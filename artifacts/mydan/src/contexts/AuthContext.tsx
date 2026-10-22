import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isAuthorizedSupervisor } from '@/lib/policy';
import { signInErrorMessage } from '@/lib/auth-errors';
import type { Supervisor } from '@/types/database';
import { notify } from '@/lib/toast';
import { t } from '@/i18n';

export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 60 * 1000; // 15 hours
export const LAST_ACTIVITY_KEY = 'mydan_last_activity_timestamp';

function isSessionExpired(): boolean {
  try {
    const lastActivityStr = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!lastActivityStr) return false;
    const lastActivity = Number(lastActivityStr);
    if (isNaN(lastActivity)) return false;
    return Date.now() - lastActivity >= INACTIVITY_TIMEOUT_MS;
  } catch {
    return false;
  }
}

function recordActivity() {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
  } catch {
    // Ignore storage quota or access restriction issues
  }
}

interface AuthValue {
  session: Session | null; user: User | null; supervisor: Supervisor | null;
  isLoading: boolean; isAuthenticated: boolean; error: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>; retryProfile(): Promise<void>;
}
const Context = createContext<AuthValue | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [supervisor, setSupervisor] = useState<Supervisor | null>(null);
  const supervisorRef = useRef<Supervisor | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const signingIn = useRef(false);
  const currentUser = useRef<string | null>(null);
  const lastActivityTime = useRef(Date.now());
  const isTimingOut = useRef(false);

  const synchronize = useCallback(async (next: Session | null) => {
    const epoch = ++generation.current;
    const isSameUser = currentUser.current === (next?.user.id ?? null);
    if (!isSameUser) {
      await cache.cancelQueries();
      cache.clear();
      currentUser.current = next?.user.id ?? null;
    }
    if (epoch !== generation.current) return;
    setSession(next);
    if (!next) {
      setSupervisor(null);
      supervisorRef.current = null;
      setError(null);
      setLoading(false);
      return;
    }

    // Silent background refresh for the already authenticated user:
    // Prevents unmounting the UI or showing a spinner on tab/app resume.
    if (isSameUser && supervisorRef.current) {
      try {
        const { data, error: failure } = await supabase.from('supervisors')
          .select('id,user_id,full_name,phone,role,branch_id,company_id,is_active,device_id')
          .eq('user_id', next.user.id).maybeSingle();
        if (!failure && data && isAuthorizedSupervisor(data, next.user.id) && epoch === generation.current) {
          setSupervisor(data);
          supervisorRef.current = data;
        }
      } catch {
        // Keep existing profile on silent background failure
      }
      return;
    }

    setSupervisor(null);
    supervisorRef.current = null;
    setError(null);
    setLoading(true);
    try {
      const { data, error: failure } = await supabase.from('supervisors')
        .select('id,user_id,full_name,phone,role,branch_id,company_id,is_active,device_id')
        .eq('user_id', next.user.id).maybeSingle();
      if (failure) throw new Error(t('تعذر تحميل حساب المشرف. تحقق من بنية الجدول وسياسات الوصول ثم أعد المحاولة.'));
      if (!isAuthorizedSupervisor(data, next.user.id)) {
        throw new Error(t('حساب المشرف غير موجود أو غير نشط أو صلاحياته غير مكتملة.'));
      }
      if (epoch === generation.current) {
        setSupervisor(data);
        supervisorRef.current = data;
      }
    } catch (failure) {
      if (epoch === generation.current) setError(failure instanceof Error ? failure.message : t('تعذر تحميل الحساب.'));
    } finally {
      if (epoch === generation.current) setLoading(false);
    }
  }, [cache]);

  const signOut = useCallback(async () => {
    ++generation.current; currentUser.current = null;
    try {
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch {
      // ignore
    }
    setSupervisor(null); supervisorRef.current = null; setSession(null); setError(null); setLoading(false);
    await cache.cancelQueries(); cache.clear();
    const { error: failure } = await supabase.auth.signOut({ scope: 'local' });
    if (failure) throw new Error(t('تعذر إنهاء الجلسة. تحقق من الاتصال وأعد المحاولة.'));
  }, [cache]);

  const triggerTimeout = useCallback(async () => {
    if (isTimingOut.current) return;
    isTimingOut.current = true;
    try {
      try {
        localStorage.removeItem(LAST_ACTIVITY_KEY);
      } catch {
        // ignore
      }
      notify(t('انتهت مهلة الجلسة لعدم النشاط (١٥ ساعة). يرجى تسجيل الدخول مجدداً.'), 'info');
      await signOut().catch(() => {});
    } finally {
      isTimingOut.current = false;
    }
  }, [signOut]);

  useEffect(() => {
    // Cold-start guard: sessionStorage clears on every fresh app open (APK killed / tab closed).
    // If no marker exists this is a cold start → sign out any persisted session and force login.
    const COLD_KEY = 'mydan_session_alive';
    let isColdStart = false;
    try { isColdStart = !sessionStorage.getItem(COLD_KEY); sessionStorage.setItem(COLD_KEY, '1'); } catch { isColdStart = true; }
    if (isColdStart) {
      void supabase.auth.signOut({ scope: 'local' });
      setLoading(false);
      return;
    }

    let alive = true;
    const initialEpoch = generation.current;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'INITIAL_SESSION' || signingIn.current) return;
      if (event === 'TOKEN_REFRESHED') {
        // Silent token renewal in background; do not reload/unmount the UI!
        setSession(next);
        return;
      }
      if (event === 'SIGNED_OUT') {
        try { localStorage.removeItem(LAST_ACTIVITY_KEY); } catch {}
      }
      // Never await Supabase requests inside its auth lock callback.
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (alive) void synchronize(next);
      }, 0);
      timers.add(timer);
    });
    void supabase.auth.getSession().then(({ data, error: failure }) => {
      if (!alive || generation.current !== initialEpoch) return;
      if (failure) {
        setLoading(false);
        setError(t('تعذر استعادة الجلسة. أعد تسجيل الدخول.'));
      } else if (data.session) {
        if (isSessionExpired()) {
          try { localStorage.removeItem(LAST_ACTIVITY_KEY); } catch {}
          notify(t('انتهت مهلة الجلسة لعدم النشاط (١٥ ساعة). يرجى تسجيل الدخول مجدداً.'), 'info');
          void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          void synchronize(null);
        } else {
          if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
            recordActivity();
          }
          void synchronize(data.session);
        }
      } else {
        void synchronize(null);
      }
    });
    return () => {
      alive = false; ++generation.current;
      timers.forEach(clearTimeout); subscription.unsubscribe();
    };
  }, [synchronize]);

  // Inactivity tracking (15 hours timeout)
  useEffect(() => {
    if (!session) return;

    lastActivityTime.current = Date.now();

    const handleUserActivity = () => {
      if (isSessionExpired()) {
        void triggerTimeout();
        return;
      }
      const now = Date.now();
      if (now - lastActivityTime.current >= 30_000) {
        lastActivityTime.current = now;
        recordActivity();
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        if (isSessionExpired()) {
          void triggerTimeout();
        } else {
          lastActivityTime.current = Date.now();
          recordActivity();
        }
      }
    };

    const events: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    const interval = setInterval(() => {
      if (isSessionExpired()) {
        void triggerTimeout();
      }
    }, 60_000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      clearInterval(interval);
    };
  }, [session, triggerTimeout]);

  const signIn = useCallback(async (email: string, password: string) => {
    signingIn.current = true;
    const epoch = ++generation.current;
    setError(null); setLoading(true); setSupervisor(null);
    try {
      const { data, error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (epoch !== generation.current) return;
      if (failure) throw new Error(signInErrorMessage(failure));
      if (!data.session) throw new Error(t('لم تُنشأ جلسة دخول. تحقق من تفعيل حسابك.'));
      recordActivity();
      lastActivityTime.current = Date.now();
      await synchronize(data.session);
    } catch (failure) {
      if (epoch === generation.current) { setLoading(false); setError(failure instanceof Error ? failure.message : t('تعذر تسجيل الدخول.')); }
      throw failure;
    } finally { signingIn.current = false; }
  }, [synchronize]);

  return <Context.Provider value={{
    session, user: session?.user ?? null, supervisor, isLoading,
    isAuthenticated: !!session && !!supervisor, error, signIn, signOut,
    retryProfile: () => synchronize(session),
  }}>{children}</Context.Provider>;
}
export function useAuth(): AuthValue {
  const value = useContext(Context);
  if (!value) throw new Error('useAuth requires AuthProvider');
  return value;
}
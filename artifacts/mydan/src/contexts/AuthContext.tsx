import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isAuthorizedSupervisor } from '@/lib/policy';
import { signInErrorMessage } from '@/lib/auth-errors';
import type { Supervisor } from '@/types/database';
import { t } from '@/i18n';

interface AuthValue {
  session: Session | null; user: User | null; supervisor: Supervisor | null;
  isLoading: boolean; isAuthenticated: boolean; error: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>; retryProfile(): Promise<void>;
}
const Context = createContext<AuthValue | undefined>(undefined);
const OFFLINE_PROFILE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const profileCacheKey = (userId: string) => 'mydan:offline-profile:v1:' + userId;
function readCachedSupervisor(userId: string): Supervisor | null {
  try {
    const raw = localStorage.getItem(profileCacheKey(userId));
    if (!raw) return null;
    const cached = JSON.parse(raw) as { savedAt: number; supervisor: unknown };
    if (!Number.isFinite(cached.savedAt) || Date.now() - cached.savedAt > OFFLINE_PROFILE_MAX_AGE) return null;
    return isAuthorizedSupervisor(cached.supervisor, userId) ? cached.supervisor : null;
  } catch { return null; }
}
function saveCachedSupervisor(supervisor: Supervisor): void {
  try { localStorage.setItem(profileCacheKey(supervisor.user_id), JSON.stringify({ savedAt: Date.now(), supervisor })); }
  catch { /* offline capture remains available for the current session */ }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [supervisor, setSupervisor] = useState<Supervisor | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const signingIn = useRef(false);
  const currentUser = useRef<string | null>(null);
  const synchronize = useCallback(async (next: Session | null) => {
    const epoch = ++generation.current;
    if (currentUser.current !== (next?.user.id ?? null)) {
      await cache.cancelQueries();
      cache.clear();
      currentUser.current = next?.user.id ?? null;
    }
    if (epoch !== generation.current) return;
    setSession(next); setSupervisor(null); setError(null);
    if (!next) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error: failure } = await supabase.from('supervisors')
        .select('id,user_id,full_name,phone,role,branch_id,company_id,is_active')
        .eq('user_id', next.user.id).maybeSingle();
      if (failure) {
        const cached = typeof navigator !== 'undefined' && !navigator.onLine ? readCachedSupervisor(next.user.id) : null;
        if (cached && epoch === generation.current) { setSupervisor(cached); return; }
        throw new Error(t('تعذر تحميل حساب المشرف. تحقق من بنية الجدول وسياسات الوصول ثم أعد المحاولة.'));
      }
      if (!isAuthorizedSupervisor(data, next.user.id)) {
        throw new Error(t('حساب المشرف غير موجود أو غير نشط أو صلاحياته غير مكتملة.'));
      }
      if (epoch === generation.current) { saveCachedSupervisor(data); setSupervisor(data); }
    } catch (failure) {
      if (epoch === generation.current) setError(failure instanceof Error ? failure.message : t('تعذر تحميل الحساب.'));
    } finally {
      if (epoch === generation.current) setLoading(false);
    }
  }, [cache]);
  useEffect(() => {
    let alive = true;
    const initialEpoch = generation.current;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'INITIAL_SESSION' || signingIn.current) return;
      // Never await Supabase requests inside its auth lock callback.
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (alive) void synchronize(next);
      }, 0);
      timers.add(timer);
    });
    void supabase.auth.getSession().then(({ data, error: failure }) => {
      if (!alive || generation.current !== initialEpoch) return;
      if (failure) { setLoading(false); setError(t('تعذر استعادة الجلسة. أعد تسجيل الدخول.')); }
      else void synchronize(data.session);
    });
    return () => {
      alive = false; ++generation.current;
      timers.forEach(clearTimeout); subscription.unsubscribe();
    };
  }, [synchronize]);
  const signIn = useCallback(async (email: string, password: string) => {
    signingIn.current = true;
    const epoch = ++generation.current;
    setError(null); setLoading(true); setSupervisor(null);
    try {
      const { data, error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (epoch !== generation.current) return;
      if (failure) throw new Error(signInErrorMessage(failure));
      if (!data.session) throw new Error(t('لم تُنشأ جلسة دخول. تحقق من تفعيل حسابك.'));
      await synchronize(data.session);
    } catch (failure) {
      if (epoch === generation.current) { setLoading(false); setError(failure instanceof Error ? failure.message : t('تعذر تسجيل الدخول.')); }
      throw failure;
    } finally { signingIn.current = false; }
  }, [synchronize]);
  const signOut = useCallback(async () => {
    ++generation.current; currentUser.current = null;
    if (session?.user.id) { try { localStorage.removeItem(profileCacheKey(session.user.id)); } catch { /* storage may be unavailable */ } }
    setSupervisor(null); setSession(null); setError(null); setLoading(false);
    await cache.cancelQueries(); cache.clear();
    const { error: failure } = await supabase.auth.signOut({ scope: 'local' });
    if (failure) throw new Error(t('تعذر إنهاء الجلسة. تحقق من الاتصال وأعد المحاولة.'));
  }, [cache, session]);
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
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase, supabaseConfiguration } from '@/lib/supabase';
import { createAuthCoordinator } from '@/lib/auth-coordinator';
import { authenticateSupervisor } from '@/lib/auth-sign-in';
import {
  loadSupervisorProfile, shouldIgnoreAuthEvent, SUPERVISOR_COLUMNS,
  type AuthState,
} from '@/lib/auth-policy';

interface AuthContextType extends AuthState {
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retryProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SESSION_ISSUE = {
  code: 'session' as const,
  message: 'تعذر استعادة جلسة الدخول. تحقق من الاتصال ثم أعد المحاولة.',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', supervisor: null, issue: null });
  const controllerRef = useRef<ReturnType<typeof createAuthCoordinator> | null>(null);
  const signingIn = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const controller = createAuthCoordinator({
      onChange: setState,
      onIdentityChange: () => queryClient.clear(),
      loadProfile: (userId) => loadSupervisorProfile(userId, () =>
        supabase.from('supervisors').select(SUPERVISOR_COLUMNS).eq('id', userId).maybeSingle(),
      ),
    });
    controllerRef.current = controller;

    if (!isSupabaseConfigured) {
      controller.fail({ code: 'configuration', message: supabaseConfiguration.message! });
      return () => { controller.dispose(); controllerRef.current = null; };
    }

    const restoreVersion = controller.getVersion();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (shouldIgnoreAuthEvent(
        event, signingIn.current, controller.getState(),
        controller.getIdentity(), session?.user.id ?? null,
      )) return;
      void controller.accept(session?.user.id ?? null);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (controllerRef.current !== controller || controller.getVersion() !== restoreVersion) return;
      if (error) controller.fail(SESSION_ISSUE);
      else void controller.accept(data.session?.user.id ?? null);
    }).catch(() => {
      if (controllerRef.current === controller && controller.getVersion() === restoreVersion) {
        controller.fail(SESSION_ISSUE);
      }
    });

    return () => {
      controller.dispose();
      subscription.unsubscribe();
      controllerRef.current = null;
    };
  }, [queryClient]);

  const retryProfile = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller || !isSupabaseConfigured) return;
    const version = controller.getVersion();
    try {
      const { data, error } = await supabase.auth.getSession();
      if (controllerRef.current !== controller || controller.getVersion() !== version) return;
      if (error) controller.fail(SESSION_ISSUE);
      else await controller.accept(data.session?.user.id ?? null);
    } catch {
      if (controllerRef.current === controller && controller.getVersion() === version) controller.fail(SESSION_ISSUE);
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const controller = controllerRef.current;
    if (!isSupabaseConfigured || !controller) {
      throw new Error(supabaseConfiguration.message ?? 'تعذر تهيئة تسجيل الدخول.');
    }
    if (signingIn.current) return;
    signingIn.current = true;
    try {
      await authenticateSupervisor(controller, () => supabase.auth.signInWithPassword({ email, password }));
    } finally {
      signingIn.current = false;
    }
  }, []);

  const signOut = useCallback(async () => {
    void controllerRef.current?.accept(null);
    if (!isSupabaseConfigured) return;
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) controllerRef.current?.fail(SESSION_ISSUE);
    } catch {
      controllerRef.current?.fail(SESSION_ISSUE);
    }
  }, []);

  const value = useMemo(() => ({
    ...state, loading: state.status === 'loading', signIn, signOut, retryProfile,
  }), [state, signIn, signOut, retryProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
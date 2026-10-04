import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Supervisor } from '@/lib/types';

interface AuthContextType {
  supervisor: Supervisor | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supervisor, setSupervisor] = useState<Supervisor | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSupervisor = async (userId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('supervisors')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        setLoading(false);
        return false;
      }

      if (!data.is_active) {
        Alert.alert('الحساب غير مفعّل', 'تواصل مع المدير لتفعيل حسابك.');
        await supabase.auth.signOut();
        setSupervisor(null);
        setLoading(false);
        return false;
      }

      setSupervisor(data as Supervisor);
      setLoading(false);
      return true;
    } catch {
      setLoading(false);
      return false;
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchSupervisor(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await fetchSupervisor(session.user.id);
      } else {
        setSupervisor(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      throw new Error('إعدادات Supabase غير مكتملة. أضف رابط المشروع ومفتاح النشر العام.');
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setSupervisor(null);
  };

  return (
    <AuthContext.Provider value={{ supervisor, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

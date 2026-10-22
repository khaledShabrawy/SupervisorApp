import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { authService } from '../services/authService';
import { t } from '@/i18n';

export function useLoginController() {
  const { isAuthenticated, isLoading, session, error, signIn, signOut, retryProfile, supervisor } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [failCount, setFailCount] = useState<number>(() => authService.getLockoutStatus().failCount);
  const [lockoutUntil, setLockoutUntil] = useState<number>(() => authService.getLockoutStatus().lockoutUntil);
  const [remainingLockout, setRemainingLockout] = useState<number>(() => authService.getLockoutStatus().remainingSeconds);

  const [forgot, setForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [forgotBusy, setForgotBusy] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  const isStandalone = typeof window !== 'undefined' && 
    (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as unknown as { standalone?: boolean }).standalone);

  useEffect(() => {
    if (lockoutUntil <= Date.now()) {
      setRemainingLockout(0);
      return;
    }
    const updateCountdown = () => {
      const diff = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setRemainingLockout(diff);
      if (diff <= 0) {
        authService.resetLockout();
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const toggleShowPassword = useCallback(() => setShowPassword((v) => !v), []);

  const handleInstall = useCallback(async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        setInstallPrompt(null);
      }
    } else {
      setShowInstallHelp((prev) => !prev);
    }
  }, [installPrompt]);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (remainingLockout > 0) return;
    setBusy(true);
    setLocalError(null);
    try {
      await signIn(email, password);
      authService.resetLockout();
    } catch (x) {
      const result = authService.recordFailedAttempt();
      const newStatus = authService.getLockoutStatus();
      setFailCount(newStatus.failCount);
      if (result.isLocked) {
        setLockoutUntil(newStatus.lockoutUntil);
        setRemainingLockout(result.remainingSeconds);
        setLocalError(t('تم تجاوز عدد محاولات الدخول المسموح بها. يرجى الانتظار 60 ثانية قبل المحاولة مجدداً.'));
      } else {
        const msg = x instanceof Error ? x.message : t('تعذر تسجيل الدخول.');
        const remainingAttempts = 5 - newStatus.failCount;
        setLocalError(`${msg} (${t('المحاولات المتبقية')}: ${remainingAttempts})`);
      }
    } finally {
      setBusy(false);
    }
  }, [signIn, email, password, remainingLockout]);

  const handleForgot = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotBusy(true);
    setForgotMsg(null);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}set-password`,
      });
      if (resetErr) throw resetErr;
      setForgotMsg(t('تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني بنجاح.'));
    } catch (err) {
      setForgotMsg(err instanceof Error ? err.message : t('تعذر إرسال رابط الاستعادة.'));
    } finally {
      setForgotBusy(false);
    }
  }, [forgotEmail]);

  const handleRetryProfile = useCallback(() => {
    void retryProfile();
  }, [retryProfile]);

  const handleSignOut = useCallback(() => {
    void signOut().catch(() => undefined);
  }, [signOut]);

  return {
    isAuthenticated,
    isLoading,
    session,
    error,
    supervisor,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    toggleShowPassword,
    busy,
    localError,
    remainingLockout,
    handleSubmit,
    handleRetryProfile,
    handleSignOut,
    forgot,
    setForgot,
    forgotEmail,
    setForgotEmail,
    forgotMsg,
    forgotBusy,
    handleForgot,
    isStandalone,
    handleInstall,
    showInstallHelp,
  };
}

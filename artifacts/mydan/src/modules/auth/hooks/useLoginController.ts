import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { authService } from '../services/authService';
import { t } from '@/i18n';

export interface BranchOption {
  id: string;
  name: string;
}

const DEFAULT_BRANCH_OPTIONS: BranchOption[] = [
  { id: 'all', name: 'جميع الفروع (المركز الرئيسي)' },
  { id: 'cairo', name: 'فرع القاهرة الكبرى' },
  { id: 'alex', name: 'فرع الإسكندرية والبحيرة' },
  { id: 'delta', name: 'فرع الدلتا والقناة' },
  { id: 'upper', name: 'فرع الصعيد' },
];

function loadCachedBranches(): BranchOption[] {
  try {
    const raw = localStorage.getItem('mydan_known_branches');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_BRANCH_OPTIONS;
}

export function useLoginController() {
  const { isAuthenticated, isLoading, session, error, signIn, signOut, retryProfile, supervisor } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [branches, setBranches] = useState<BranchOption[]>(loadCachedBranches);
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    try {
      return localStorage.getItem('mydan_active_branch_id') || 'all';
    } catch {
      return 'all';
    }
  });

  const [failCount, setFailCount] = useState<number>(() => authService.getLockoutStatus().failCount);
  const [lockoutUntil, setLockoutUntil] = useState<number>(() => authService.getLockoutStatus().lockoutUntil);
  const [remainingLockout, setRemainingLockout] = useState<number>(() => authService.getLockoutStatus().remainingSeconds);

  const [forgot, setForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [forgotBusy, setForgotBusy] = useState(false);

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

  // If supervisor has an assigned branch, enforce / preselect it
  useEffect(() => {
    if (supervisor?.branch_id) {
      setSelectedBranch(supervisor.branch_id);
      try {
        localStorage.setItem('mydan_active_branch_id', supervisor.branch_id);
      } catch {
        // ignore
      }
    }
  }, [supervisor]);

  const toggleShowPassword = useCallback(() => setShowPassword((v) => !v), []);

  const handleEmailChange = useCallback((val: string) => {
    setEmail(val);
    const trimmed = val.trim().toLowerCase();
    if (trimmed) {
      try {
        const rememberedBranch = localStorage.getItem(`mydan_user_branch_${trimmed}`);
        if (rememberedBranch) {
          setSelectedBranch(rememberedBranch);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const handleBranchChange = useCallback((branchId: string) => {
    setSelectedBranch(branchId);
    try {
      localStorage.setItem('mydan_active_branch_id', branchId);
      const trimmed = email.trim().toLowerCase();
      if (trimmed) {
        localStorage.setItem(`mydan_user_branch_${trimmed}`, branchId);
      }
    } catch {
      // ignore
    }
  }, [email]);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (remainingLockout > 0) return;
    setBusy(true);
    setLocalError(null);
    try {
      await signIn(email, password);
      authService.resetLockout();

      const trimmedEmail = email.trim().toLowerCase();
      try {
        const { data: supData } = await supabase.from('supervisors')
          .select('id,role,branch_id,company_id')
          .maybeSingle();

        if (supData) {
          const finalBranch = supData.branch_id || selectedBranch;
          setSelectedBranch(finalBranch);
          localStorage.setItem('mydan_active_branch_id', finalBranch);
          if (trimmedEmail) {
            localStorage.setItem(`mydan_user_branch_${trimmedEmail}`, finalBranch);
          }

          if (supData.company_id) {
            const { data: bList } = await supabase.from('branches')
              .select('id,name,is_active')
              .eq('company_id', supData.company_id)
              .eq('is_active', true);

            if (bList && bList.length > 0) {
              const mapped: BranchOption[] = [
                { id: 'all', name: 'جميع الفروع (المركز الرئيسي)' },
                ...bList.map((b) => ({ id: b.id, name: b.name })),
              ];
              setBranches(mapped);
              localStorage.setItem('mydan_known_branches', JSON.stringify(mapped));
            }
          }
        } else {
          localStorage.setItem('mydan_active_branch_id', selectedBranch);
          if (trimmedEmail) {
            localStorage.setItem(`mydan_user_branch_${trimmedEmail}`, selectedBranch);
          }
        }
      } catch {
        localStorage.setItem('mydan_active_branch_id', selectedBranch);
      }
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
  }, [signIn, email, password, remainingLockout, selectedBranch]);

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
    setEmail: handleEmailChange,
    password,
    setPassword,
    showPassword,
    toggleShowPassword,
    busy,
    localError,
    remainingLockout,
    branches,
    selectedBranch,
    setSelectedBranch: handleBranchChange,
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
  };
}

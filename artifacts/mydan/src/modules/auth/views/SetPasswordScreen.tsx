import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { t } from '@/i18n';

/** Landing page for invite / recovery emails: the link signs the user in, then they choose a password. */
export default function SetPasswordScreen() {
  const s = useAppSettings();
  const nav = useNavigate();
  const { retryProfile } = useAuth();
  const [ready, setReady] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) {
        setReady(true);
      } else {
        timer = setTimeout(async () => {
          if (!alive) return;
          const { data: retryData } = await supabase.auth.getSession();
          if (alive) setReady(!!retryData.session);
        }, 1200);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setReady(!!session);
    });

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const confirmProfile = useCallback(async () => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw userError ?? new Error('Account verification unavailable');
    const { data: profile, error: profileError } = await supabase.from('supervisors')
      .select('id,force_password_change,password_changed_at').eq('user_id', user.id).single();
    if (profileError || !profile || profile.force_password_change || !profile.password_changed_at) {
      throw profileError ?? new Error('Password change was not confirmed by the server');
    }
    await retryProfile();
    nav('/', { replace: true });
  }, [retryProfile, nav]);

  const recheck = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await confirmProfile();
    } catch {
      setError(t('لم يتأكد تحديث الحساب من الخادم بعد. أعد التحقق أو تواصل مع مدير النظام.'));
    } finally {
      setBusy(false);
    }
  }, [confirmProfile]);

  const submit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError(t('كلمة المرور يجب ألا تقل عن 8 أحرف.'));
      return;
    }
    if (pw !== pw2) {
      setError(t('كلمتا المرور غير متطابقتين.'));
      return;
    }
    setBusy(true);
    let updated = false;
    try {
      const { error: failure } = await supabase.auth.updateUser({ password: pw });
      if (failure) throw failure;
      updated = true;
      setPasswordSaved(true);
      setPw('');
      setPw2('');
      await confirmProfile();
    } catch {
      setError(t(updated
        ? 'لم يتأكد تحديث الحساب من الخادم بعد. أعد التحقق أو تواصل مع مدير النظام.'
        : 'تعذر إكمال تحديث الحساب. أعد المحاولة قبل المتابعة.'));
    } finally {
      setBusy(false);
    }
  }, [pw, pw2, confirmProfile]);

  return (
    <main className="login">
      <div className="s-card s-login-card">
        <h1 style={{ margin: 0, fontSize: 24 }}>{t('تعيين كلمة المرور')}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {s.app_name}
        </p>

        {ready === null ? (
          <div className="skel" style={{ height: 120 }} />
        ) : ready === false ? (
          <div className="col" style={{ gap: 12 }}>
            <div className="alert err">
              {t('رابط غير صالح أو انتهت صلاحيته. يرجى طلب رابط جديد من المشرف.')}
            </div>
            <button className="btn block" onClick={() => nav('/login', { replace: true })}>
              {t('العودة لتسجيل الدخول')}
            </button>
          </div>
        ) : passwordSaved ? (
          <div className="col" style={{ gap: 12 }}>
            <div className="alert ok" role="status">{t('تم تحديث كلمة المرور. نتحقق من جاهزية حسابك قبل المتابعة.')}</div>
            {error && <div className="alert err" role="alert">{error}</div>}
            <button className="btn block" disabled={busy} onClick={recheck}>
              {busy ? t('جاري الحفظ...') : t('إعادة التحقق من الحساب')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="col" style={{ gap: 12, textAlign: 'start' }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              {t('أدخل كلمة المرور الجديدة لحسابك (8 أحرف على الأقل).')}
            </p>
            <input
              className="input"
              type="password"
              placeholder={t('كلمة المرور الجديدة')}
              aria-label={t('كلمة المرور الجديدة')} autoComplete="new-password"
              required
              minLength={8}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder={t('تأكيد كلمة المرور')}
              aria-label={t('تأكيد كلمة المرور')} autoComplete="new-password"
              required
              minLength={8}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
            {error && <div className="alert err">{error}</div>}
            <button className="btn block" disabled={busy}>
              {busy ? t('جاري الحفظ...') : t('حفظ ومتابعة')}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

import { useCallback, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { canAdmin } from '@/lib/policy';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useInput } from './shared';
import { t } from '@/i18n';
import { LanguageToggle } from '@/components/LanguageToggle';

export default function LoginScreen() {
  const { isAuthenticated, isLoading, session, error, signIn, signOut, retryProfile, supervisor } = useAuth();
  const settings = useAppSettings();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [local, setLocal] = useState<string | null>(null);
  const onEmail = useInput(setEmail); const onPass = useInput(setPassword);
  const toggle = useCallback(() => setShow((v) => !v), []);
  const submit = useCallback(async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setLocal(null);
    try { await signIn(email, password); } catch (x) { setLocal(x instanceof Error ? x.message : t('تعذر تسجيل الدخول.')); } finally { setBusy(false); }
  }, [signIn, email, password]);
  const retry = useCallback(() => { void retryProfile(); }, [retryProfile]);
  const out = useCallback(() => { void signOut().catch(() => undefined); }, [signOut]);
  const IS_ANDROID = import.meta.env.VITE_PLATFORM === 'android';
  const [forgot, setForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [forgotBusy, setForgotBusy] = useState(false);

  if (isAuthenticated) {
    if (supervisor?.force_password_change) {
      return <Navigate to="/set-password" replace />;
    }
    return <Navigate to={!IS_ANDROID && canAdmin(supervisor) ? '/admin' : '/'} replace />;
  }
  if (isLoading && !busy) return <LoadingSpinner />;
  const profileFailed = !!session && !!error;

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotBusy(true); setForgotMsg(null);
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
  };

  return <main className="login">
    <div className="s-card s-login-card">
      <div className="row" style={{ justifyContent: 'flex-end' }}><LanguageToggle className="btn sm ghost" /></div>
      {settings.logo_url ? <img className="s-login-logo" src={settings.logo_url} alt={settings.app_name} loading="lazy" /> : <div className="s-login-logo" aria-hidden="true">{settings.app_name.slice(0, 1)}</div>}
      <h1 style={{ margin: 0, fontSize: 28 }}>{settings.app_name}</h1>
      <p className="muted" style={{ margin: 0 }}>{t('نظام إدارة المشرفين الميدانيين')}</p>
      {profileFailed ? <>
        <div className="alert err row" role="alert"><AlertCircle /><span>{t(error)}</span></div>
        <button className="btn block" data-testid="button-retry" onClick={retry}>{t('إعادة المحاولة')}</button>
        <button className="btn ghost block" data-testid="button-signout" onClick={out}>{t('تسجيل الخروج')}</button>
      </> : !forgot ? (
        <form onSubmit={submit} className="col" style={{ gap: 12, textAlign: 'start' }}>
          <input className="input" type="email" dir="ltr" placeholder={t('البريد الإلكتروني')} aria-label={t('البريد الإلكتروني')} autoComplete="username" required value={email} onChange={onEmail} data-testid="input-email" />
          <div className="s-pw">
            <input className="input" type={show ? 'text' : 'password'} dir="ltr" placeholder={t('كلمة المرور')} aria-label={t('كلمة المرور')} autoComplete="current-password" required value={password} onChange={onPass} data-testid="input-password" />
            <button type="button" className="icon-btn" aria-label={show ? t('إخفاء كلمة المرور') : t('إظهار كلمة المرور')} onClick={toggle}>{show ? <EyeOff /> : <Eye />}</button>
          </div>

          {settings.allow_forgot_password !== false && (
            <div style={{ textAlign: 'end' }}>
              <button
                type="button"
                className="btn link"
                style={{ fontSize: 13, padding: 0, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => { setForgot(true); setForgotEmail(email); }}
              >
                {t('نسيت كلمة المرور؟')}
              </button>
            </div>
          )}

          {(local || error) && <div className="alert err" role="alert">{t(local ?? error ?? '')}</div>}
          <button className="btn block" disabled={busy} data-testid="button-login">{busy && <span className="loading-spinner" aria-hidden="true" style={{ width: 18, height: 18, borderWidth: 2, borderTopColor: 'currentColor' }} />}{busy ? t('جاري الدخول...') : t('تسجيل الدخول')}</button>
        </form>
      ) : (
        <form onSubmit={handleForgot} className="col" style={{ gap: 12, textAlign: 'start' }}>
          <h2 style={{ margin: '8px 0 0', fontSize: 18 }}>{t('استعادة كلمة المرور')}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {t('أدخل بريدك الإلكتروني المسجل وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.')}
          </p>
          <input className="input" type="email" dir="ltr" placeholder={t('البريد الإلكتروني')} required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
          {forgotMsg && <div className={`alert ${forgotMsg.includes('نجاح') ? 'ok' : 'err'}`}>{forgotMsg}</div>}
          <button className="btn block" disabled={forgotBusy}>
            {forgotBusy ? t('جاري الإرسال...') : t('إرسال رابط الاستعادة')}
          </button>
          <button type="button" className="btn ghost block" onClick={() => { setForgot(false); setForgotMsg(null); }}>
            {t('العودة لتسجيل الدخول')}
          </button>
        </form>
      )}
    </div>
  </main>;
}

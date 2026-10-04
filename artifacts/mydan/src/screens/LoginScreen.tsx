import { useCallback, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useInput } from './shared';

export default function LoginScreen() {
  const { isAuthenticated, isLoading, session, error, signIn, signOut, retryProfile } = useAuth();
  const settings = useAppSettings();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [local, setLocal] = useState<string | null>(null);
  const onEmail = useInput(setEmail); const onPass = useInput(setPassword);
  const toggle = useCallback(() => setShow((v) => !v), []);
  const submit = useCallback(async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setLocal(null);
    try { await signIn(email, password); } catch (x) { setLocal(x instanceof Error ? x.message : 'تعذر تسجيل الدخول.'); } finally { setBusy(false); }
  }, [signIn, email, password]);
  const retry = useCallback(() => { void retryProfile(); }, [retryProfile]);
  const out = useCallback(() => { void signOut().catch(() => undefined); }, [signOut]);
  if (isAuthenticated) return <Navigate to="/" replace />;
  if (isLoading && !busy) return <LoadingSpinner />;
  const profileFailed = !!session && !!error;
  return <main className="login">
    <div className="s-card s-login-card">
      {settings.logo_url ? <img className="s-login-logo" src={settings.logo_url} alt={settings.app_name} loading="lazy" /> : <div className="s-login-logo" aria-hidden="true">م</div>}
      <h1 style={{ margin: 0, fontSize: 28 }}>{settings.app_name}</h1>
      <p className="muted" style={{ margin: 0 }}>نظام إدارة المشرفين الميدانيين</p>
      {profileFailed ? <>
        <div className="alert err row" role="alert"><AlertCircle /><span>{error}</span></div>
        <button className="btn block" data-testid="button-retry" onClick={retry}>إعادة المحاولة</button>
        <button className="btn ghost block" data-testid="button-signout" onClick={out}>تسجيل الخروج</button>
      </> : <form onSubmit={submit} className="col" style={{ gap: 12, textAlign: 'start' }}>
        <input className="input" type="email" dir="ltr" placeholder="البريد الإلكتروني" aria-label="البريد الإلكتروني" autoComplete="username" required value={email} onChange={onEmail} data-testid="input-email" />
        <div className="s-pw">
          <input className="input" type={show ? 'text' : 'password'} dir="ltr" placeholder="كلمة المرور" aria-label="كلمة المرور" autoComplete="current-password" required value={password} onChange={onPass} data-testid="input-password" />
          <button type="button" className="icon-btn" aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={toggle}>{show ? <EyeOff /> : <Eye />}</button>
        </div>
        {(local || error) && <div className="alert err" role="alert">{local ?? error}</div>}
        <button className="btn block" disabled={busy} data-testid="button-login">{busy && <span className="loading-spinner" aria-hidden="true" style={{ width: 18, height: 18, borderWidth: 2, borderTopColor: 'currentColor' }} />}{busy ? 'جاري الدخول...' : 'تسجيل الدخول'}</button>
      </form>}
    </div>
  </main>;
}

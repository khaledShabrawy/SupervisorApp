import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCircle, MapPinned } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function Login() {
  const { isAuthenticated, isLoading, session, error, signIn, signOut, retryProfile } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [local, setLocal] = useState<string | null>(null);
  if (isAuthenticated) return <Navigate to="/" replace />;
  if (isLoading && !busy) return <LoadingSpinner />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setLocal(null);
    try { await signIn(email, password); } catch (x) { setLocal(x instanceof Error ? x.message : 'تعذر تسجيل الدخول.'); } finally { setBusy(false); }
  };
  const profileFailed = !!session && !!error;
  return <div className="login">
    <div className="hero">
      <MapPinned size={44} />
      <h1>ميدان</h1>
      <p style={{ margin: '8px 0 0', opacity: .9, fontWeight: 600 }}>زياراتك، عملاؤك، أهدافك. في مكان واحد.</p>
    </div>
    {profileFailed ? <div className="page" style={{ padding: 24 }}>
      <div className="alert err row" role="alert"><AlertCircle /><span>{error}</span></div>
      <button className="btn block" data-testid="button-retry" onClick={() => void retryProfile()}>إعادة المحاولة</button>
      <button className="btn ghost block" data-testid="button-signout" onClick={() => void signOut().catch(() => undefined)}>تسجيل الخروج</button>
    </div> : <form onSubmit={submit}>
      <h2 style={{ margin: 0 }}>تسجيل الدخول</h2>
      <label className="f">البريد الإلكتروني
        <input className="input" type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-email" />
      </label>
      <label className="f">كلمة المرور
        <input className="input" type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-password" />
      </label>
      {(local || error) && <div className="alert err" role="alert">{local ?? error}</div>}
      <button className="btn block" disabled={busy} data-testid="button-login">{busy ? 'جاري الدخول...' : 'دخول'}</button>
    </form>}
  </div>;
}

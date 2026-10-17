import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useInput } from './shared';
import { t } from '@/i18n';

/** Landing page for invite / recovery emails: the link signs the user in, then they choose a password. */
export default function SetPasswordScreen() {
  const s = useAppSettings(); const nav = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const onPw = useInput(setPw); const onPw2 = useInput(setPw2);
  useEffect(() => {
    let alive = true;
    // Check session immediately and also listen to onAuthStateChange in case token exchange is in flight
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) {
        setReady(true);
      } else {
        // Give token exchange up to 1200ms before concluding link is missing/expired
        const timer = setTimeout(async () => {
          if (!alive) return;
          const { data: retryData } = await supabase.auth.getSession();
          if (alive) setReady(!!retryData.session);
        }, 1200);
        return () => clearTimeout(timer);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (session) setReady(true);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  const submit = useCallback(async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    if (pw.length < 8) { setError(t('كلمة المرور يجب ألا تقل عن 8 أحرف.')); return; }
    if (pw !== pw2) { setError(t('كلمتا المرور غير متطابقتين.')); return; }
    setBusy(true);
    const { error: failure } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (failure) {
      const msg = failure.message.toLowerCase();
      if (/pwned|leaked|weak/i.test(msg)) {
        setError(t('كلمة المرور ضعيفة أو مسرّبة سابقًا. اختر كلمة أخرى.'));
      } else if (/session|auth|token/i.test(msg)) {
        setError(t('انتهت صلاحية رابط الدعوة أو تم استخدامه مسبقًا. يمكنك تسجيل الدخول بكلمة المرور المسجلة.'));
      } else {
        setError(failure.message || t('تعذر حفظ كلمة المرور.'));
      }
      return;
    }
    nav('/', { replace: true });
  }, [pw, pw2, nav]);

  return <div className="login">
    <form className="s-card s-login-card" onSubmit={submit}>
      <h1 style={{ margin: 0, fontSize: 22 }}>{t('مرحبًا بك في {app}', { app: s.app_name })}</h1>
      {ready === null ? <div className="muted">{t('جاري التحقق من رابط الدعوة...')}</div>
        : !ready ? <div className="col" style={{ gap: 12 }}>
            <div className="alert warn">{t('رابط الدعوة غير صالح أو منتهي أو تم استخدامه مسبقًا.')}</div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              {t('إذا كنت قد قمت بتعيين كلمة المرور سابقًا، يمكنك تسجيل الدخول مباشرة.')}
            </p>
            <button type="button" className="btn primary block" onClick={() => nav('/login', { replace: true })}>
              {t('الانتقال إلى صفحة الدخول')}
            </button>
          </div>
        : <>
          <div className="muted">{t('اختر كلمة مرور لحسابك.')}</div>
          <label className="f" style={{ textAlign: 'start' }}>{t('كلمة المرور')}<input className="input" type="password" autoComplete="new-password" value={pw} onChange={onPw} data-testid="input-new-password" /></label>
          <label className="f" style={{ textAlign: 'start' }}>{t('تأكيد كلمة المرور')}<input className="input" type="password" autoComplete="new-password" value={pw2} onChange={onPw2} /></label>
          {error && <div className="col" style={{ gap: 8 }}>
            <div className="alert err" role="alert">{error}</div>
            {/مسبق|جلسة|session|auth/i.test(error) && (
              <button type="button" className="btn ghost sm" onClick={() => nav('/login')}>
                {t('تسجيل الدخول')}
              </button>
            )}
          </div>}
          <button className="btn block" disabled={busy}>{busy ? t('جاري الحفظ...') : t('حفظ والدخول')}</button>
        </>}
    </form>
  </div>;
}

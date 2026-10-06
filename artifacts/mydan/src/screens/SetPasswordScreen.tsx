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
    // detectSessionInUrl consumes the token from the link; give it a tick to land.
    let alive = true;
    const timer = setTimeout(async () => { const { data } = await supabase.auth.getSession(); if (alive) setReady(!!data.session); }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  const submit = useCallback(async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    if (pw.length < 8) { setError(t('كلمة المرور يجب ألا تقل عن 8 أحرف.')); return; }
    if (pw !== pw2) { setError(t('كلمتا المرور غير متطابقتين.')); return; }
    setBusy(true);
    const { error: failure } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (failure) { setError(/pwned|leaked|weak/i.test(failure.message) ? t('كلمة المرور ضعيفة أو مسرّبة سابقًا. اختر كلمة أخرى.') : t('تعذر حفظ كلمة المرور. أعد فتح رابط الدعوة.')); return; }
    nav('/', { replace: true });
  }, [pw, pw2, nav]);
  return <div className="login">
    <form className="s-card s-login-card" onSubmit={submit}>
      <h1 style={{ margin: 0, fontSize: 22 }}>{t('مرحبًا بك في {app}', { app: s.app_name })}</h1>
      {ready === null ? <div className="muted">{t('جاري التحقق من رابط الدعوة...')}</div>
        : !ready ? <div className="alert err">{t('رابط الدعوة غير صالح أو منتهي. اطلب من المدير إرسال دعوة جديدة.')}</div>
        : <>
          <div className="muted">{t('اختر كلمة مرور لحسابك.')}</div>
          <label className="f" style={{ textAlign: 'start' }}>{t('كلمة المرور')}<input className="input" type="password" autoComplete="new-password" value={pw} onChange={onPw} data-testid="input-new-password" /></label>
          <label className="f" style={{ textAlign: 'start' }}>{t('تأكيد كلمة المرور')}<input className="input" type="password" autoComplete="new-password" value={pw2} onChange={onPw2} /></label>
          {error && <div className="alert err" role="alert">{error}</div>}
          <button className="btn block" disabled={busy}>{busy ? t('جاري الحفظ...') : t('حفظ والدخول')}</button>
        </>}
    </form>
  </div>;
}

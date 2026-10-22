import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { t } from '@/i18n';

/** Landing page for invite / recovery emails: the link signs the user in, then they choose a password. */
export default function SetPasswordScreen() {
  const s = useAppSettings();
  const nav = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
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
      if (session) setReady(true);
    });

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  const submit = useCallback(
    async (e: FormEvent) => {
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
      const { error: failure } = await supabase.auth.updateUser({ password: pw });
      if (failure) {
        setBusy(false);
        setError(failure.message);
        return;
      }

      await supabase.auth.updateUser({
        data: { force_password_change: false, password_changed_at: new Date().toISOString() },
      });

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('supervisors')
          .update({ force_password_change: false, password_changed_at: new Date().toISOString() })
          .eq('user_id', user.id);
      }

      setBusy(false);
      nav('/', { replace: true });
    },
    [pw, pw2, nav]
  );

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
        ) : (
          <form onSubmit={submit} className="col" style={{ gap: 12, textAlign: 'start' }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              {t('أدخل كلمة المرور الجديدة لحسابك (8 أحرف على الأقل).')}
            </p>
            <input
              className="input"
              type="password"
              placeholder={t('كلمة المرور الجديدة')}
              required
              minLength={8}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder={t('تأكيد كلمة المرور')}
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

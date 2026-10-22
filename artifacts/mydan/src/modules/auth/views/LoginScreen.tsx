import { Navigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff } from '@/components/Icons';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { canAdmin } from '@/lib/policy';
import LoadingSpinner from '@/components/LoadingSpinner';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useLoginController } from '../hooks/useLoginController';
import { t } from '@/i18n';

const IS_ANDROID = import.meta.env.VITE_PLATFORM === 'android';

export default function LoginScreen() {
  const settings = useAppSettings();
  const ctrl = useLoginController();

  if (ctrl.isAuthenticated) {
    if (ctrl.supervisor?.force_password_change) {
      return <Navigate to="/set-password" replace />;
    }
    return <Navigate to={!IS_ANDROID && canAdmin(ctrl.supervisor) ? '/admin' : '/'} replace />;
  }

  if (ctrl.isLoading && !ctrl.busy) {
    return <LoadingSpinner />;
  }

  const profileFailed = !!ctrl.session && !!ctrl.error;

  return (
    <main className="login">
      <div className="s-card s-login-card">
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <LanguageToggle className="btn sm ghost" />
        </div>

        {settings.logo_url ? (
          <img className="s-login-logo" src={settings.logo_url} alt={settings.app_name} loading="lazy" />
        ) : (
          <div className="s-login-logo" aria-hidden="true">{settings.app_name.slice(0, 1)}</div>
        )}

        <h1 style={{ margin: 0, fontSize: 28 }}>{settings.app_name}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {settings.app_tagline || t('أتمتة قوة المبيعات الميدانية بالذكاء الاصطناعي')}
        </p>

        {profileFailed ? (
          <>
            <div className="alert err row" role="alert">
              <AlertCircle />
              <span>{t(ctrl.error ?? '')}</span>
            </div>
            <button className="btn block" data-testid="button-retry" onClick={ctrl.handleRetryProfile}>
              {t('إعادة المحاولة')}
            </button>
            <button className="btn ghost block" data-testid="button-signout" onClick={ctrl.handleSignOut}>
              {t('تسجيل الخروج')}
            </button>
          </>
        ) : !ctrl.forgot ? (
          <form onSubmit={ctrl.handleSubmit} className="col" style={{ gap: 12, textAlign: 'start' }}>
            <input
              className="input"
              type="email"
              dir="ltr"
              placeholder={t('البريد الإلكتروني')}
              aria-label={t('البريد الإلكتروني')}
              autoComplete="username"
              required
              value={ctrl.email}
              onChange={(e) => ctrl.setEmail(e.target.value)}
              data-testid="input-email"
            />
            <div className="s-pw">
              <input
                className="input"
                type={ctrl.showPassword ? 'text' : 'password'}
                dir="ltr"
                placeholder={t('كلمة المرور')}
                aria-label={t('كلمة المرور')}
                autoComplete="current-password"
                required
                value={ctrl.password}
                onChange={(e) => ctrl.setPassword(e.target.value)}
                data-testid="input-password"
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={ctrl.showPassword ? t('إخفاء كلمة المرور') : t('إظهار كلمة المرور')}
                onClick={ctrl.toggleShowPassword}
              >
                {ctrl.showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>

            {settings.allow_forgot_password !== false && (
              <div style={{ textAlign: 'end' }}>
                <button
                  type="button"
                  className="btn link"
                  style={{ fontSize: 13, padding: 0, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => {
                    ctrl.setForgot(true);
                    ctrl.setForgotEmail(ctrl.email);
                  }}
                >
                  {t('نسيت كلمة المرور؟')}
                </button>
              </div>
            )}

            {(ctrl.localError || ctrl.error) && (
              <div className="alert err" role="alert">
                {t(ctrl.localError ?? ctrl.error ?? '')}
              </div>
            )}

            <button className="btn block" disabled={ctrl.busy || ctrl.remainingLockout > 0} data-testid="button-login">
              {ctrl.busy && (
                <span
                  className="loading-spinner"
                  aria-hidden="true"
                  style={{ width: 18, height: 18, borderWidth: 2, borderTopColor: 'currentColor' }}
                />
              )}
              {ctrl.busy
                ? t('جاري الدخول...')
                : ctrl.remainingLockout > 0
                ? `${t('يرجى الانتظار')} (${ctrl.remainingLockout} ${t('ثانية')})`
                : t('تسجيل الدخول')}
            </button>
          </form>
        ) : (
          <form onSubmit={ctrl.handleForgot} className="col" style={{ gap: 12, textAlign: 'start' }}>
            <h2 style={{ margin: '8px 0 0', fontSize: 18 }}>{t('استعادة كلمة المرور')}</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {t('أدخل بريدك الإلكتروني المسجل وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.')}
            </p>
            <input
              className="input"
              type="email"
              dir="ltr"
              placeholder={t('البريد الإلكتروني')}
              required
              value={ctrl.forgotEmail}
              onChange={(e) => ctrl.setForgotEmail(e.target.value)}
            />
            {ctrl.forgotMsg && (
              <div className={`alert ${ctrl.forgotMsg.includes('نجاح') ? 'ok' : 'err'}`}>
                {ctrl.forgotMsg}
              </div>
            )}
            <button className="btn block" disabled={ctrl.forgotBusy}>
              {ctrl.forgotBusy ? t('جاري الإرسال...') : t('إرسال رابط الاستعادة')}
            </button>
            <button
              type="button"
              className="btn ghost block"
              onClick={() => {
                ctrl.setForgot(false);
              }}
            >
              {t('العودة لتسجيل الدخول')}
            </button>
          </form>
        )}

        {!ctrl.isStandalone && !IS_ANDROID && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border, #e2e8f0)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a
              href="/Mydan.apk"
              download="Mydan.apk"
              className="btn ghost sm block"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                color: 'var(--color-primary, #1A56DB)',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <span aria-hidden="true">🤖</span>
              <span>{t('تحميل تطبيق أندرويد (APK)')}</span>
            </a>
            <button
              type="button"
              onClick={ctrl.handleInstall}
              className="btn ghost sm block"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                color: 'var(--color-primary, #1A56DB)',
                fontWeight: 600,
              }}
            >
              <span aria-hidden="true">📲</span>
              <span>{t('تثبيت تطبيق Mydan على الهاتف (PWA)')}</span>
            </button>
            {ctrl.showInstallHelp && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5, textAlign: 'center' }}>
                {t('لتثبيت التطبيق مباشرة: افتح خيارات المتصفح (⋮) أعلى الشاشة واختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".')}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

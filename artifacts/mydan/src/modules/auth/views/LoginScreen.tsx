import { Navigate } from 'react-router-dom';
import { AlertCircle, Building2, Eye, EyeOff, ShieldCheck } from '@/components/Icons';
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
    <main className="login-portal">
      <div className="login-shell">
        {/* Left Side: Enterprise Showcase (Desktop) */}
        <div className="login-showcase">
          <div>
            <div className="row" style={{ alignItems: 'center', gap: 12, marginBottom: 20 }}>
              {settings.logo_url ? (
                <img
                  src={settings.logo_url}
                  alt={settings.app_name}
                  style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover', background: '#fff', padding: 2 }}
                />
              ) : (
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'var(--color-primary, #1A56DB)',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 900,
                    fontSize: 22,
                  }}
                >
                  {settings.app_name.slice(0, 1)}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }}>{settings.app_name} Web Control</div>
                <div style={{ fontSize: 12, color: '#93C5FD' }}>{t('بوابة الإدارة والتحكم السحابية')}</div>
              </div>
            </div>

            <p style={{ fontSize: 14, color: '#E2E8F0', lineHeight: 1.7, marginBottom: 28 }}>
              {settings.app_tagline || t('أتمتة قوة المبيعات الميدانية بالذكاء الاصطناعي')}
            </p>

            <div className="col" style={{ gap: 12 }}>
              <div className="login-feature-card">
                <div style={{ fontSize: 20 }}>🏢</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>
                    {t('إدارة وحدات الأعمال والفروع الإقليمية')}
                  </div>
                  <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>
                    تحديد الفروع المركزية ومتابعة خطط السير والامتثال الميداني لحظياً.
                  </div>
                </div>
              </div>

              <div className="login-feature-card">
                <div style={{ fontSize: 20 }}>🎯</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>
                    {t('رقابة المشرفين والتدقيق الذكي بالذكاء الاصطناعي')}
                  </div>
                  <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>
                    تدقيق فوري لحصة الوجود ونواقص الرف عبر خوارزميات الرؤية الذكية.
                  </div>
                </div>
              </div>

              <div className="login-feature-card">
                <div style={{ fontSize: 20 }}>📍</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>
                    {t('الالتزام الجغرافي وخطط السير الميدانية')}
                  </div>
                  <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>
                    سياج جغرافي صارم 100% يمنع التلاعب بتسجيل الزيارات والحضور.
                  </div>
                </div>
              </div>
            </div>

            {/* Live Performance & Security Stats */}
            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: '12px 10px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#60A5FA' }}>99.4%</div>
                <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>{t('دقة تدقيق الرف')}</div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: '12px 10px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#34D399' }}>100%</div>
                <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>{t('سياج جغرافي صارم')}</div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: '12px 10px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#A78BFA' }}>0 ms</div>
                <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>{t('تشغيل فوري أوفلاين')}</div>
              </div>
            </div>
          </div>

          <div style={{ paddingTop: 24, borderTop: '1px solid rgba(255, 255, 255, 0.12)' }}>
            <div className="row between" style={{ alignItems: 'center', fontSize: 12, color: '#94A3B8' }}>
              <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
                <span>{t('الخوادم السحابية متصلة ومؤمنة')}</span>
              </span>
              <bdi dir="ltr" style={{ fontWeight: 600, color: '#CBD5E1' }}>256-bit SSL</bdi>
            </div>
          </div>
        </div>

        {/* Right Side: Web Control Login Form */}
        <div className="login-form-pane">
          <div className="row between" style={{ alignItems: 'center', marginBottom: 16 }}>
            <div className="badge b-blue" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8 }}>
              <span>{t('بوابة الإشراف الميداني')}</span>
              <span style={{ opacity: 0.4 }}>•</span>
              <bdi dir="ltr" style={{ fontWeight: 700, letterSpacing: -0.2 }}>Salesbuzz Edition</bdi>
            </div>
            <LanguageToggle className="btn sm ghost" />
          </div>

          <div style={{ marginBottom: 20 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0F172A' }}>
              {t('تسجيل الدخول للمنظومة')}
            </h1>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
              {t('يرجى إدخال بيانات الاعتماد ووحدة الأعمال للمتابعة')}
            </p>
          </div>

          {profileFailed ? (
            <div className="col" style={{ gap: 10 }}>
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
            </div>
          ) : !ctrl.forgot ? (
            <form onSubmit={ctrl.handleSubmit} className="col" style={{ gap: 14, textAlign: 'start' }}>
              <div className="col" style={{ gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  {t('البريد الإلكتروني')}
                </label>
                <input
                  className="input"
                  type="email"
                  dir="ltr"
                  placeholder="name@company.com"
                  aria-label={t('البريد الإلكتروني')}
                  autoComplete="username"
                  required
                  value={ctrl.email}
                  onChange={(e) => ctrl.setEmail(e.target.value)}
                  data-testid="input-email"
                />
              </div>

              <div className="col" style={{ gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  {t('كلمة المرور')}
                </label>
                <div className="s-pw">
                  <input
                    className="input"
                    type={ctrl.showPassword ? 'text' : 'password'}
                    dir="ltr"
                    placeholder="••••••••"
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
              </div>

              {/* Branch / Business Unit Selector */}
              <div className="col" style={{ gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 size={15} color="var(--color-primary)" />
                  <span>{t('وحدة الأعمال (الفرع)')}</span>
                </label>
                <select
                  className="input"
                  value={ctrl.selectedBranch}
                  onChange={(e) => ctrl.setSelectedBranch(e.target.value)}
                  data-testid="select-branch"
                  style={{ fontWeight: 600 }}
                >
                  {ctrl.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id === 'all' ? t('جميع الفروع (المركز الرئيسي)') : b.name}
                    </option>
                  ))}
                </select>
              </div>

              {settings.allow_forgot_password !== false && (
                <div style={{ textAlign: 'end' }}>
                  <button
                    type="button"
                    className="btn link"
                    style={{ fontSize: 12, padding: 0, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
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

              <button
                className="btn block"
                disabled={ctrl.busy || ctrl.remainingLockout > 0}
                data-testid="button-login"
                style={{
                  minHeight: 46,
                  fontSize: 15,
                  fontWeight: 700,
                  marginTop: 6,
                  boxShadow: '0 4px 14px rgba(26, 86, 219, 0.3)',
                }}
              >
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
                  : t('دخول بوابة التحكم السحابية')}
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

          {/* Footer security & marketing link */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid var(--border, #E2E8F0)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ShieldCheck size={14} color="#16A34A" />
              <span>{t('نظام مشفر ومؤمن بروتوكول')} <bdi dir="ltr" style={{ fontWeight: 700, color: '#475569' }}>256-bit SSL</bdi></span>
            </div>
            <a
              href="/"
              style={{
                fontSize: 12,
                color: 'var(--color-primary, #1A56DB)',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {t('العودة للموقع التعريفي للمنصة')} ↗
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

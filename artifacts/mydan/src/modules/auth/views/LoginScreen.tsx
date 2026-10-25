import { Navigate } from 'react-router-dom';
import { AlertCircle, Building2, Eye, EyeOff, ShieldCheck } from '@/components/Icons';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { canAdmin } from '@/lib/policy';
import LoadingSpinner from '@/components/LoadingSpinner';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useLoginController } from '../hooks/useLoginController';
import { t } from '@/i18n';

const IS_ANDROID = import.meta.env.VITE_PLATFORM === 'android';

const CHART_HEIGHTS = [40, 62, 48, 80, 55, 88, 70, 95, 65, 100];

const FEATURES = [
  {
    icon: '🎯',
    bg: 'rgba(26,86,219,.28)',
    titleKey: 'رقابة الرف بالذكاء الاصطناعي',
    subKey: 'دقة 99.4% في تحليل حصة الوجود والنواقص الفورية',
  },
  {
    icon: '📍',
    bg: 'rgba(16,137,129,.28)',
    titleKey: 'سياج جغرافي 100% صارم',
    subKey: 'منع التلاعب بتسجيل الزيارات والحضور تماماً',
  },
  {
    icon: '⚡',
    bg: 'rgba(99,102,241,.28)',
    titleKey: 'عمل أوفلاين بلا انقطاع',
    subKey: 'مزامنة تلقائية ذكية عند استعادة الاتصال',
  },
] as const;

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
  const appName = settings.app_name || 'Mydan';
  const initial = appName.slice(0, 1);

  return (
    <main className="login-portal">
      <div className="login-shell">

        {/* ═══════════════════════════════════
            LEFT — Showcase Panel (desktop only)
            ═══════════════════════════════════ */}
        <div className="login-showcase">

          {/* Brand */}
          <div className="lp-brand">
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt={appName}
                style={{ width: 50, height: 50, borderRadius: 14, objectFit: 'cover',
                  border: '2px solid rgba(255,255,255,.15)', flex: 'none' }}
              />
            ) : (
              <div className="lp-brand-icon">{initial}</div>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: -.4 }}>{appName}</div>
              <div style={{ fontSize: 11, color: '#93C5FD', fontWeight: 600 }}>Field Intelligence Platform</div>
            </div>
          </div>

          {/* Headline */}
          <div>
            <h2 className="lp-headline">
              {t('أتمتة قوة')}<br />
              <span className="lp-headline-accent">{t('المبيعات الميدانية')}</span><br />
              {t('بالذكاء الاصطناعي')}
            </h2>
            <p style={{ fontSize: 14, color: '#94A3B8', margin: '12px 0 0', lineHeight: 1.75 }}>
              {settings.app_tagline || t('رقابة لحظية، رؤية تنافسية، وإنجاز ميداني قابل للقياس.')}
            </p>
          </div>

          {/* Mini Dashboard Mockup */}
          <div className="lp-mockup">
            <div className="lp-mockup-topbar">
              <div className="lp-dot" style={{ background: '#EF4444' }} />
              <div className="lp-dot" style={{ background: '#F59E0B' }} />
              <div className="lp-dot" style={{ background: '#22C55E' }} />
              <div style={{ flex: 1, height: 7, background: 'rgba(255,255,255,.06)', borderRadius: 4, marginInlineStart: 8 }} />
            </div>
            <div className="lp-mockup-kpis">
              {([
                { num: '94%', lbl: t('حضور الرف'),   color: '#34D399' },
                { num: '287', lbl: t('زيارة اليوم'), color: '#60A5FA' },
                { num: '3.2k',lbl: t('أوردر'),        color: '#A78BFA' },
              ] as const).map((k) => (
                <div key={k.lbl} className="lp-kpi">
                  <div className="lp-kpi-num" style={{ color: k.color }}>{k.num}</div>
                  <div className="lp-kpi-lbl">{k.lbl}</div>
                </div>
              ))}
            </div>
            <div className="lp-chart">
              {CHART_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  className="lp-bar"
                  style={{
                    height: `${h}%`,
                    animationDelay: `${i * 0.07}s`,
                    background: i >= 7
                      ? 'linear-gradient(180deg, #93C5FD, #1D4ED8)'
                      : 'linear-gradient(180deg, #3B82F6, #1E40AF)',
                    opacity: 0.55 + i * 0.04,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Feature cards */}
          <div className="col" style={{ gap: 8 }}>
            {FEATURES.map((f) => (
              <div key={f.titleKey} className="lp-feature">
                <div className="lp-feature-icon" style={{ background: f.bg }}>{f.icon}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#E2E8F0' }}>{t(f.titleKey)}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, lineHeight: 1.45 }}>{t(f.subKey)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Stats strip */}
          <div className="lp-stats">
            {([
              { num: '99.4%', lbl: t('دقة الذكاء'),    color: '#60A5FA' },
              { num: '100%',  lbl: t('سياج جغرافي'),   color: '#34D399' },
              { num: '<1s',   lbl: t('تحليل الرف'),     color: '#A78BFA' },
            ] as const).map((s) => (
              <div key={s.lbl} className="lp-stat">
                <div className="lp-stat-num" style={{ color: s.color }}>{s.num}</div>
                <div className="lp-stat-lbl">{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════
            RIGHT — Form Panel
            ═══════════════════════════════════ */}
        <div className="login-form-pane">

          {/* Mobile brand logo (hidden on desktop) */}
          <div className="lp-logo-mobile">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt={appName}
                style={{ width: 42, height: 42, borderRadius: 12, objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: 42, height: 42, borderRadius: 12, flex: 'none',
                background: 'linear-gradient(135deg,#1A56DB,#3B82F6)',
                display: 'grid', placeItems: 'center',
                fontWeight: 900, fontSize: 20, color: '#fff',
              }}>{initial}</div>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: '#F1F5F9', letterSpacing: -.3 }}>{appName}</div>
              <div style={{ fontSize: 11, color: '#64748B' }}>Field Intelligence Platform</div>
            </div>
          </div>

          {/* Badge + language toggle */}
          <div className="row between" style={{ alignItems: 'center', marginBottom: 24 }}>
            <div className="badge b-blue" style={{ fontSize: 11, padding: '4px 10px' }}>
              {t('بوابة التحكم الميداني')}
            </div>
            <LanguageToggle className="btn sm ghost" />
          </div>

          {/* Profile-failed state */}
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
            /* ─── Login Form ─── */
            <>
              <h1 className="lp-title">{t('مرحباً بعودتك')}</h1>
              <p className="lp-subtitle">{t('سجّل دخولك للمتابعة والرقابة الميدانية')}</p>

              <form onSubmit={ctrl.handleSubmit} className="col" style={{ gap: 14 }}>

                {/* Email */}
                <div className="lp-field">
                  <label className="lp-label">{t('البريد الإلكتروني')}</label>
                  <input
                    className="lp-input"
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

                {/* Password */}
                <div className="lp-field">
                  <label className="lp-label">{t('كلمة المرور')}</label>
                  <div className="lp-pw">
                    <input
                      className="lp-input"
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

                {/* Branch selector */}
                <div className="lp-field">
                  <label className="lp-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Building2 size={14} color="var(--color-primary)" />
                    {t('وحدة الأعمال (الفرع)')}
                  </label>
                  <select
                    className="lp-input"
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

                {/* Forgot password link */}
                {settings.allow_forgot_password !== false && (
                  <div style={{ textAlign: 'end', marginTop: -4 }}>
                    <button
                      type="button"
                      style={{ fontSize: 12, padding: 0, color: 'var(--color-primary)',
                        background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                      onClick={() => { ctrl.setForgot(true); ctrl.setForgotEmail(ctrl.email); }}
                    >
                      {t('نسيت كلمة المرور؟')}
                    </button>
                  </div>
                )}

                {/* Error */}
                {(ctrl.localError || ctrl.error) && (
                  <div className="alert err" role="alert">
                    {t(ctrl.localError ?? ctrl.error ?? '')}
                  </div>
                )}

                {/* Submit */}
                <button
                  className="lp-btn"
                  disabled={ctrl.busy || ctrl.remainingLockout > 0}
                  data-testid="button-login"
                >
                  <span className="lp-btn-inner">
                    {ctrl.busy && (
                      <span
                        className="loading-spinner"
                        aria-hidden="true"
                        style={{ width: 18, height: 18, borderWidth: 2,
                          borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }}
                      />
                    )}
                    {ctrl.busy
                      ? t('جاري الدخول...')
                      : ctrl.remainingLockout > 0
                      ? `${t('انتظر')} ${ctrl.remainingLockout}${t('ث')}`
                      : t('دخول المنظومة')}
                  </span>
                </button>
              </form>
            </>

          ) : (
            /* ─── Forgot Password Form ─── */
            <>
              <h1 className="lp-title" style={{ fontSize: 24 }}>{t('استعادة كلمة المرور')}</h1>
              <p className="lp-subtitle">{t('أدخل بريدك الإلكتروني وسنرسل رابط إعادة التعيين')}</p>

              <form onSubmit={ctrl.handleForgot} className="col" style={{ gap: 14 }}>
                <div className="lp-field">
                  <label className="lp-label">{t('البريد الإلكتروني')}</label>
                  <input
                    className="lp-input"
                    type="email"
                    dir="ltr"
                    placeholder="name@company.com"
                    required
                    value={ctrl.forgotEmail}
                    onChange={(e) => ctrl.setForgotEmail(e.target.value)}
                  />
                </div>

                {ctrl.forgotMsg && (
                  <div className={`alert ${ctrl.forgotMsg.includes('نجاح') ? 'ok' : 'err'}`}>
                    {ctrl.forgotMsg}
                  </div>
                )}

                <button className="lp-btn" disabled={ctrl.forgotBusy}>
                  <span className="lp-btn-inner">
                    {ctrl.forgotBusy ? t('جاري الإرسال...') : t('إرسال رابط الاستعادة')}
                  </span>
                </button>

                <button
                  type="button"
                  className="btn ghost block"
                  onClick={() => ctrl.setForgot(false)}
                >
                  {t('العودة لتسجيل الدخول')}
                </button>
              </form>
            </>
          )}

          {/* Trust footer */}
          <div className="lp-trust">
            <ShieldCheck size={14} color="#16A34A" />
            <span>{t('مشفر بـ')} <strong style={{ color: '#475569' }}>256-bit SSL</strong></span>
            <span style={{ opacity: .35 }}>·</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="lp-live-dot" />
              {t('الخوادم متصلة')}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}

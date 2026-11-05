import { Suspense, useCallback, useEffect } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Bell, Building2, Camera, ClipboardList, Download, FileText, GraduationCap, Home, LogOut, MapPin, Package, PieChart, ScanSearch, Settings2, ShieldCheck, Store, Target, Users } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useDeviceBinding } from '@/lib/device-binding';
import { canAdmin, passwordChangeRequired } from '@/lib/policy';
import { notify } from '@/lib/toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import { LanguageToggle } from '@/components/LanguageToggle';
import './admin.css';
import { t } from '@/i18n';
import { TrialBanner } from '@/components/TrialBanner';
import { useCompanySubscription, SubscriptionLockedView } from '@/lib/subscription';

export const ADMIN_NAV = [
  { to: '/admin', group: 'overview', label: t('لوحة المؤشرات'), icon: BarChart3, end: true },
  { to: '/admin/live-map', group: 'field', label: t('سجل مواقع الزيارات'), icon: MapPin },
  { to: '/admin/shelf-share', group: 'overview', label: t('حصة الرف'), icon: BarChart3 },
  { to: '/admin/training', group: 'field', label: t('أكاديمية التدريب'), icon: GraduationCap },
  { to: '/admin/users', group: 'management', label: t('المستخدمين'), icon: Users },
  { to: '/admin/companies', group: 'system', label: t('الشركات'), icon: Building2, superAdminOnly: true },
  { to: '/admin/branches', group: 'management', label: t('الفروع'), icon: MapPin },
  { to: '/admin/customers', group: 'management', label: t('العملاء'), icon: Store },
  { to: '/admin/products', group: 'management', label: t('المنتجات'), icon: Package },
  { to: '/admin/targets', group: 'field', label: t('الأهداف'), icon: Target },
  { to: '/admin/assets', group: 'management', label: t('الأصول'), icon: ShieldCheck },
  { to: '/admin/surveys', group: 'field', label: t('الاستبيانات'), icon: FileText },
  { to: '/admin/notifications', group: 'field', label: t('الإشعارات'), icon: Bell },
  { to: '/admin/settings', group: 'system', label: t('إعدادات الشركة'), icon: Settings2 },
  { to: '/admin/audit', group: 'system', label: t('سجل المراجعة'), icon: ClipboardList },
  { to: '/admin/bulk-import', group: 'management', label: t('استيراد جماعي'), icon: Download },
  { to: '/admin/reports', group: 'overview', label: t('التقارير المخصصة'), icon: PieChart },
  { to: '/admin/prospects', group: 'field', label: t('العملاء المحتملون'), icon: ScanSearch },
  { to: '/admin/field-surveys', group: 'field', label: t('سجل المسح الميداني'), icon: Camera },
] as const;

const NAV_GROUPS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'field', label: 'العمل الميداني' },
  { key: 'management', label: 'إدارة البيانات' },
  { key: 'system', label: 'النظام والأمان' },
] as const;

/** Auth + role gate for /admin/*; renders the desktop admin shell instead of the mobile one. */
export default function AdminLayout() {
  const { isAuthenticated, isLoading, supervisor, signOut } = useAuth();
  const subscription = useCompanySubscription();
  const binding = useDeviceBinding(supervisor);
  const s = useAppSettings();
  const { pathname } = useLocation();
  const logout = useCallback(() => void signOut().catch((e: Error) => notify(e.message, 'error')), [signOut]);
  useEffect(() => {
    const page = ADMIN_NAV.find((n) => n.to === pathname)?.label ?? t('الإدارة');
    document.title = `${page} | ${t('إدارة {app}', { app: s.app_name })}`;
  }, [pathname, s.app_name]);

  if (isLoading || subscription.isLoading || binding.status === 'checking') return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: pathname }} />;
  if (passwordChangeRequired(supervisor, s)) return <Navigate to="/set-password" replace />;
  if (!canAdmin(supervisor)) return <Navigate to="/" replace />;
  if (binding.status === 'error' || binding.status === 'locked') return <div className="page" role="alert">
    <p>{binding.status === 'error' ? binding.message : 'هذا الحساب مرتبط بجهاز آخر.'}</p>
    <button className="btn" onClick={binding.retry}>إعادة المحاولة</button>
    <button className="btn" onClick={logout}>تسجيل الخروج</button>
  </div>;
  if (subscription.isError) return <div className="page" role="alert">
    <p>{subscription.error?.message}</p><button className="btn" onClick={() => void subscription.retry()}>إعادة المحاولة</button>
  </div>;
  if (subscription.isLocked) {
    return (
      <SubscriptionLockedView
        companyName={subscription.company?.name}
        expiresAt={subscription.company?.expires_at}
        isInactive={subscription.isInactive}
      />
    );
  }

  return <div className="adm">
    <a className="skip-link" href="#admin-main">{t('انتقل إلى المحتوى')}</a>
    <aside className="adm-side">
      <div className="adm-brand">
        {s.logo_url ? <img className="logo" src={s.logo_url} alt="" /> : <span className="logo">{s.app_name.slice(0, 1)}</span>}
        <div className="grow">{s.app_name}<small style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 8px #22C55E', flex: 'none' }} />{supervisor!.full_name}</small></div>
        <span className="adm-lang-mobile"><LanguageToggle /></span>
      </div>
      <nav className="adm-nav" aria-label={t('قائمة الإدارة')}>
        {NAV_GROUPS.map(group => {
          const links = ADMIN_NAV.filter(item => item.group === group.key &&
            (!('superAdminOnly' in item) || supervisor?.role === 'super_admin'));
          return <section className="adm-nav-group" key={group.key} aria-label={t(group.label)}>
            <h2 className="adm-nav-label">{t(group.label)}</h2>
            {links.map(({ to, label, icon: Icon, ...rest }) =>
              <NavLink key={to} to={to} end={'end' in rest} data-testid={`admin-nav-${to.split('/').pop()}`}>
                <Icon size={18} /><span>{label}</span>
              </NavLink>)}
          </section>;
        })}
      </nav>
      {/* صف ثابت على الموبايل — دائماً مرئي بدون تمرير */}
      <div className="adm-mobile-actions">
        <NavLink to="/" className="adm-mobile-btn adm-mobile-back"><Home size={16} />{t('الرئيسية')}</NavLink>
        <button className="adm-mobile-btn adm-mobile-logout" onClick={logout}><LogOut size={16} />{t('تسجيل الخروج')}</button>
      </div>
      <div className="adm-foot">
        <LanguageToggle className="lang-toggle" />
        <button className="logout-btn" onClick={logout}><LogOut size={18} />{t('تسجيل الخروج')}</button>
      </div>
    </aside>
    <main id="admin-main" className="adm-main">
      <TrialBanner />
      <Suspense fallback={<LoadingSpinner />}><Outlet /></Suspense>
    </main>
  </div>;
}

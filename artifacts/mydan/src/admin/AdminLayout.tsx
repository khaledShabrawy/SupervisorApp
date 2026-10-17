import { Suspense, useCallback, useEffect } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Bell, Building2, ClipboardList, Download, FileText, GraduationCap, Home, LogOut, MapPin, Package, PieChart, ScanSearch, Settings2, ShieldCheck, ShoppingCart, Store, Target, Users } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { canAdmin } from '@/lib/policy';
import { notify } from '@/lib/toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import { LanguageToggle } from '@/components/LanguageToggle';
import './admin.css';
import { t } from '@/i18n';
import { TrialBanner } from '@/components/TrialBanner';

export const ADMIN_NAV = [
  { to: '/admin', label: t('لوحة المؤشرات'), icon: BarChart3, end: true },
  { to: '/admin/live-map', label: t('تتبع المشرفين 🗺️'), icon: MapPin },
  { to: '/admin/training', label: t('أكاديمية التدريب 🎓'), icon: GraduationCap },
  { to: '/admin/orders', label: t('الأوردرات'), icon: ShoppingCart },
  { to: '/admin/users', label: t('المستخدمين'), icon: Users },
  { to: '/admin/companies', label: t('الشركات'), icon: Building2, superAdminOnly: true },
  { to: '/admin/branches', label: t('الفروع'), icon: MapPin },
  { to: '/admin/customers', label: t('العملاء'), icon: Store },
  { to: '/admin/products', label: t('المنتجات'), icon: Package },
  { to: '/admin/targets', label: t('الأهداف'), icon: Target },
  { to: '/admin/assets', label: t('الأصول'), icon: ShieldCheck },
  { to: '/admin/surveys', label: t('الاستبيانات'), icon: FileText },
  { to: '/admin/notifications', label: t('الإشعارات'), icon: Bell },
  { to: '/admin/settings', label: t('إعدادات الشركة'), icon: Settings2 },
  { to: '/admin/audit', label: t('سجل المراجعة'), icon: ClipboardList },
  { to: '/admin/bulk-import', label: t('استيراد جماعي'), icon: Download },
  { to: '/admin/reports', label: t('التقارير المخصصة'), icon: PieChart },
  { to: '/admin/prospects', label: t('العملاء المحتملون'), icon: ScanSearch },
] as const;

/** Auth + role gate for /admin/*; renders the desktop admin shell instead of the mobile one. */
export default function AdminLayout() {
  const { isAuthenticated, isLoading, supervisor, signOut } = useAuth();
  const s = useAppSettings();
  const { pathname } = useLocation();
  const logout = useCallback(() => void signOut().catch((e: Error) => notify(e.message, 'error')), [signOut]);
  useEffect(() => {
    const page = ADMIN_NAV.find((n) => n.to === pathname)?.label ?? t('الإدارة');
    document.title = `${page} | ${t('إدارة {app}', { app: s.app_name })}`;
  }, [pathname, s.app_name]);

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: pathname }} />;
  if (!canAdmin(supervisor)) return <Navigate to="/" replace />;

  return <div className="adm">
    <aside className="adm-side">
      <div className="adm-brand">
        {s.logo_url ? <img className="logo" src={s.logo_url} alt="" /> : <span className="logo">{s.app_name.slice(0, 1)}</span>}
        <div className="grow">{s.app_name}<small>{supervisor!.full_name}</small></div>
        <span className="adm-lang-mobile"><LanguageToggle /></span>
      </div>
      <nav className="adm-nav" aria-label={t('قائمة الإدارة')}>
        {ADMIN_NAV.filter(({ ...rest }) => !('superAdminOnly' in rest) || supervisor?.role === 'super_admin').map(({ to, label, icon: Icon, ...rest }) =>
          <NavLink key={to} to={to} end={'end' in rest} data-testid={`admin-nav-${to.split('/').pop()}`}><Icon size={18} />{label}</NavLink>)}
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
    <main className="adm-main">
      <TrialBanner />
      <Suspense fallback={<LoadingSpinner />}><Outlet /></Suspense>
    </main>
  </div>;
}

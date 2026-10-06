import { Suspense, useCallback, useEffect } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowRight, BarChart3, Bell, Home, LogOut, MapPin, Package, Settings2, ShieldCheck, Store, Target, Users } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { canAdmin } from '@/lib/policy';
import { notify } from '@/lib/toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import { LanguageToggle } from '@/components/LanguageToggle';
import './admin.css';
import { t } from '@/i18n';

export const ADMIN_NAV = [
  { to: '/admin', label: t('لوحة المؤشرات'), icon: BarChart3, end: true },
  { to: '/admin/users', label: t('المشرفون'), icon: Users },
  { to: '/admin/branches', label: t('الفروع'), icon: MapPin },
  { to: '/admin/customers', label: t('العملاء'), icon: Store },
  { to: '/admin/products', label: t('المنتجات'), icon: Package },
  { to: '/admin/targets', label: t('الأهداف'), icon: Target },
  { to: '/admin/assets', label: t('الأصول'), icon: ShieldCheck },
  { to: '/admin/notifications', label: t('الإشعارات'), icon: Bell },
  { to: '/admin/settings', label: t('إعدادات الشركة'), icon: Settings2 },
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
        {ADMIN_NAV.map(({ to, label, icon: Icon, ...rest }) =>
          <NavLink key={to} to={to} end={'end' in rest} data-testid={`admin-nav-${to.split('/').pop()}`}><Icon size={18} />{label}</NavLink>)}
        <NavLink to="/" className="adm-back-mobile"><Home size={18} />{t('التطبيق')}</NavLink>
      </nav>
      <div className="adm-foot">
        <LanguageToggle className="btn sm ghost" />
        <NavLink to="/" className="row" style={{ textDecoration: 'none', minHeight: 44 }}><ArrowRight size={18} className="flip-ltr" />{t('العودة للتطبيق')}</NavLink>
        <button className="row icon-btn" style={{ justifyContent: 'flex-start', gap: 10, font: 'inherit' }} onClick={logout}><LogOut size={18} />{t('تسجيل الخروج')}</button>
      </div>
    </aside>
    <main className="adm-main">
      <Suspense fallback={<LoadingSpinner />}><Outlet /></Suspense>
    </main>
  </div>;
}

import { Suspense, useCallback, useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, LogOut, Settings2 } from '@/components/Icons';
import { useUnreadCount } from '@/lib/data';
import { num } from '@/lib/format';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useRealtime } from '@/hooks/useRealtime';
import { canAdmin } from '@/lib/policy';
import { notify } from '@/lib/toast';
import { BottomNav } from './BottomNav';
import LoadingSpinner from './LoadingSpinner';

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Shell />;
}
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { supervisor } = useAuth();
  return canAdmin(supervisor) ? <>{children}</> : <Navigate to="/" replace />;
}
function Realtime({ id, company }: { id: string; company: string }) {
  const qc = useQueryClient();
  useRealtime('notifications', `supervisor_id=eq.${id}`, () => {
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'mydan' && q.queryKey[1] === company && q.queryKey[2] === id && q.queryKey[4] === 'notifications' });
  });
  useRealtime('shelf_audits', `supervisor_id=eq.${id}`, () => {
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'mydan'
      && q.queryKey[1] === company && q.queryKey[2] === id && q.queryKey[4] === 'audits' });
  });
  return null;
}
function Shell() {
  const { supervisor, signOut } = useAuth();
  const s = useAppSettings();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const admin = canAdmin(supervisor);
  const unread = useUnreadCount();
  const goBack = useCallback(() => nav(-1), [nav]);
  const goAdmin = useCallback(() => nav('/admin'), [nav]);
  const goNotifications = useCallback(() => nav('/notifications'), [nav]);
  const logout = useCallback(() => void signOut().catch((e: Error) => notify(e.message, 'error')), [signOut]);
  const home = pathname === '/';
  useEffect(() => {
    const names: Record<string, string> = { '/': 'الرئيسية', '/visits': 'الزيارات',
      '/visits/new': 'بدء زيارة', '/shelf-audit': 'مراجعة الرف', '/orders': 'الطلبات',
      '/customers': 'العملاء', '/targets': 'الأهداف والتقارير', '/beat-plan': 'خطة المسار',
      '/notifications': 'الإشعارات', '/admin': 'لوحة الإدارة' };
    document.title = `${names[pathname] ?? 'ميدان'} | ${s.app_name}`;
    return () => { document.title = 'ميدان | إدارة المبيعات الميدانية'; };
  }, [pathname, s.app_name]);
  return <div className="shell">
    <Realtime id={supervisor!.id} company={supervisor!.company_id} />
    <header className="topbar">
      {home || ['/visits', '/customers', '/targets', '/notifications'].includes(pathname)
        ? (s.logo_url ? <img className="logo" src={s.logo_url} alt={s.app_name} loading="lazy" /> : <span className="logo">{s.app_name.slice(0, 1)}</span>)
        : <button className="icon-btn" aria-label="رجوع" onClick={goBack}><ArrowRight /></button>}
      <h1><span className="header-brand">{s.app_name}</span><small>{supervisor!.name}</small></h1>
      <button className="icon-btn" aria-label="الإشعارات" data-testid="button-notifications" onClick={goNotifications}>
        <Bell size={21} />
        {unread.isError ? <span className="dot" aria-label="تعذر قراءة عدد الإشعارات">!</span>
          : unread.data != null && unread.data > 0 && <span className="dot">{unread.data > 99 ? '99+' : num(unread.data)}</span>}
      </button>
      {admin && <button className="icon-btn" aria-label="الإدارة" aria-current={pathname === '/admin' ? 'page' : undefined} data-testid="button-admin" onClick={goAdmin}><Settings2 /></button>}
      <button className="icon-btn" aria-label="تسجيل الخروج" data-testid="button-logout"
        onClick={logout}><LogOut /></button>
    </header>
    <Suspense fallback={<LoadingSpinner />}><Outlet /></Suspense>
    <BottomNav />
  </div>;
}
export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="row between"><h2 style={{ margin: 0, fontSize: 22 }}>{children}</h2>{action}</div>;
}

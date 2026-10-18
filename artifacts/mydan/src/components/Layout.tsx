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
import { LanguageToggle } from './LanguageToggle';
import LoadingSpinner from './LoadingSpinner';
import { SyncActionBar } from './SyncActionBar';
import { TrialBanner } from './TrialBanner';
import { useDeviceBinding } from '@/lib/device-binding';
import { useCompanySubscription, SubscriptionLockedView } from '@/lib/subscription';
import { t } from '@/i18n';

const IS_ANDROID = import.meta.env.VITE_PLATFORM === 'android';

function DeviceLockedView({ registeredDeviceId, currentDeviceId }: { registeredDeviceId: string; currentDeviceId: string }) {
  const { signOut, supervisor } = useAuth();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: '#F8FAFC' }}>
      <div className="card col" style={{ maxWidth: 460, textAlign: 'center', gap: 16, padding: 28, borderRadius: 16, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
        <div style={{ fontSize: 54 }}>🔒</div>
        <h2 style={{ margin: 0, color: '#EF4444', fontSize: 20 }}>{t('هذا الحساب مرتبط بجهاز آخر')}</h2>
        <p className="muted" style={{ lineHeight: 1.6, fontSize: 14 }}>
          {t('حساب المشرف ({name}) مقترن بجهاز عمل مصرح به سابقاً. لأسباب أمنية ومنع التلاعب الميداني، يُحظر تسجيل الدخول من أكثر من جهاز هاتف.', { name: supervisor?.full_name || '' })}
        </p>
        <div className="alert warn" style={{ fontSize: 12, direction: 'ltr', textAlign: 'start', overflowWrap: 'anywhere' }}>
          <div><strong>Registered Device:</strong> {registeredDeviceId}</div>
          <div><strong>Current Device:</strong> {currentDeviceId}</div>
        </div>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
          {t('يرجى التواصل مع إدارة الشركة أو مسؤول النظام لإلغاء ارتباط الجهاز السابق والسماح بالربط من جهازك الحالي.')}
        </p>
        <button className="btn primary block" onClick={() => void signOut()} style={{ marginTop: 8 }}>
          {t('تسجيل الخروج')}
        </button>
      </div>
    </div>
  );
}

export function RequireAuth() {
  const { isAuthenticated, isLoading, supervisor } = useAuth();
  const binding = useDeviceBinding(supervisor);
  const subscription = useCompanySubscription();

  if (isLoading || binding.status === 'checking' || subscription.isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (supervisor?.force_password_change) return <Navigate to="/set-password" replace />;
  if (binding.status === 'locked') {
    return (
      <DeviceLockedView
        registeredDeviceId={binding.registeredDeviceId}
        currentDeviceId={binding.currentDeviceId}
      />
    );
  }
  if (subscription.isLocked) {
    return (
      <SubscriptionLockedView
        companyName={subscription.company?.name}
        expiresAt={subscription.company?.expires_at}
        isInactive={subscription.isInactive}
      />
    );
  }
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
  useRealtime('shelf_audit', `supervisor_id=eq.${id}`, () => {
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
    document.title = `${({ '/': t('الرئيسية'), '/visits': t('الزيارات'),
      '/visits/new': t('بدء زيارة'), '/shelf-audit': t('مراجعة الرف'),
      '/customers': t('العملاء'), '/targets': t('الأهداف والتقارير'), '/beat-plan': t('خطة الزيارات'),
      '/notifications': t('الإشعارات'), '/admin': t('لوحة الإدارة') } as Record<string, string>)[pathname] ?? 'Mydan'} | ${s.app_name}`;
    return () => { document.title = `Mydan | ${t('إدارة المشرفين الميدانيين')}`; };
  }, [pathname, s.app_name]);
  if (!IS_ANDROID && admin && !pathname.startsWith('/admin')) return <Navigate to="/admin" replace />;
  return <div className="shell">
    <Realtime id={supervisor!.id} company={supervisor!.company_id} />
    <header className="topbar">
      {home || ['/visits', '/customers', '/targets', '/notifications'].includes(pathname)
        ? (s.logo_url ? <img className="logo" src={s.logo_url} alt={s.app_name} loading="lazy" /> : <span className="logo">{s.app_name.slice(0, 1)}</span>)
        : <button className="icon-btn" aria-label={t('رجوع')} onClick={goBack}><ArrowRight className="flip-ltr" /></button>}
      <h1><span className="header-brand">{s.app_name}</span><small>{supervisor!.full_name}</small></h1>
      <LanguageToggle />
      <button className="icon-btn" aria-label={t('الإشعارات')} data-testid="button-notifications" onClick={goNotifications}>
        <Bell size={21} />
        {unread.isError ? <span className="dot" aria-label={t('تعذر قراءة عدد الإشعارات')}>!</span>
          : unread.data != null && unread.data > 0 && <span className="dot">{unread.data > 99 ? '99+' : num(unread.data)}</span>}
      </button>
      {!IS_ANDROID && admin && <button className="icon-btn" aria-label={t('الإدارة')} aria-current={pathname === '/admin' ? 'page' : undefined} data-testid="button-admin" onClick={goAdmin}><Settings2 /></button>}
      <button className="icon-btn logout-btn" aria-label={t('تسجيل الخروج')} data-testid="button-logout"
        onClick={logout}><LogOut /></button>
    </header>
    <SyncActionBar />
    <div style={{ padding: '8px 16px 0' }}><TrialBanner /></div>
    <Suspense fallback={<LoadingSpinner />}><Outlet /></Suspense>
    <BottomNav />
  </div>;
}
export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="row between"><h2 style={{ margin: 0, fontSize: 22 }}>{children}</h2>{action}</div>;
}

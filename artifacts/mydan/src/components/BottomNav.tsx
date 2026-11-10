import { Link, useLocation } from 'react-router-dom';
import { Bell, BarChart3, ClipboardList, Home, Users } from '@/components/Icons';
import { useUnreadCount } from '@/lib/data';
import { useScreenAllowed } from '@/lib/permissions';
import { num } from '@/lib/format';
import { t } from '@/i18n';


function NotificationCount() {
  const unread = useUnreadCount();
  const n = unread.data ?? 0;
  return <>
    {unread.isError && <span className="dot" aria-label={t('تعذر قراءة عدد الإشعارات')}>!</span>}
    {!unread.isError && n > 0 && <span className="dot" aria-label={`${num(n)} غير مقروء`}>{n > 99 ? '99+' : num(n)}</span>}
  </>;
}

export function BottomNav() {
  const tabs = [
    { to: '/', label: t('الرئيسية'), icon: Home, end: true },
    { to: '/visits', label: t('الزيارات'), icon: ClipboardList },
    { to: '/customers', label: t('العملاء'), icon: Users },
    { to: '/targets', label: t('التقارير'), icon: BarChart3 },
    { to: '/notifications', label: t('الإشعارات'), icon: Bell },
  ];
  const { pathname } = useLocation();
  // Visit-related operations remain grouped under the visit list.
  const selected = /^\/(visits|shelf-audit|beat-plan)(\/|$)/.test(pathname) ? '/visits' : pathname;
  const reportsAllowed = useScreenAllowed('my_reports');
  const notificationsAllowed = useScreenAllowed('notifications');
  const visibleTabs = tabs.filter(({ to }) =>
    (to !== '/targets' || reportsAllowed) && (to !== '/notifications' || notificationsAllowed));
  return <nav className="bottomnav" aria-label={t('التنقل الرئيسي')}
    style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}>
    {visibleTabs.map(({ to, label, icon: Icon }) => (
      <Link key={to} to={to} aria-current={selected === to ? 'page' : undefined} className={selected === to ? 'active' : ''} data-testid={`tab-${to}`}>
        <Icon size={24} />
        {to === '/notifications' && <NotificationCount />}
        <span>{label}</span>
      </Link>
    ))}
  </nav>;
}
export default BottomNav;


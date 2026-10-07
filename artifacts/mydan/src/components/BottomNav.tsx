import { Link, useLocation } from 'react-router-dom';
import { Bell, BarChart3, ClipboardList, Home, Users } from '@/components/Icons';
import { useUnreadCount } from '@/lib/data';
import { num } from '@/lib/format';
import { t } from '@/i18n';


const tabs = [
  { to: '/', label: t('الرئيسية'), icon: Home, end: true },
  { to: '/visits', label: t('الزيارات'), icon: ClipboardList },
  { to: '/customers', label: t('العملاء'), icon: Users },
  { to: '/targets', label: t('التقارير'), icon: BarChart3 },
  { to: '/notifications', label: t('الإشعارات'), icon: Bell },
];
export function BottomNav() {
  const { pathname } = useLocation();
  // Preserve five tabs: visit-related operations belong to field visits.
  const selected = /^\/(visits|shelf-audit|beat-plan)(\/|$)/.test(pathname) ? '/visits' : pathname;
  const unread = useUnreadCount();
  const n = unread.data ?? 0;
  return <nav className="bottomnav" aria-label={t('التنقل الرئيسي')}>
    {tabs.map(({ to, label, icon: Icon }) => (
      <Link key={to} to={to} aria-current={selected === to ? 'page' : undefined} className={selected === to ? 'active' : ''} data-testid={`tab-${to}`}>
        <Icon size={24} />
        {to === '/notifications' && unread.isError && <span className="dot" aria-label={t('تعذر قراءة عدد الإشعارات')}>!</span>}
        {to === '/notifications' && n > 0 && <span className="dot" aria-label={`${num(n)} غير مقروء`}>{n > 99 ? '99+' : num(n)}</span>}
        <span>{label}</span>
      </Link>
    ))}
  </nav>;
}
export default BottomNav;


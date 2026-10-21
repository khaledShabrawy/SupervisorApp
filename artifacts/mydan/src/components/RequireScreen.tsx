import type { ReactNode } from 'react';
import { useMyPermissions, isScreenAllowed, type ScreenKey } from '@/lib/permissions';
import { useScope } from '@/lib/data';
import EmptyState from './EmptyState';
import LoadingSpinner from './LoadingSpinner';
import { ShieldAlert } from './Icons';
import { t } from '@/i18n';

/** UI gate for per-supervisor screen permissions. Fails closed: denies access until permissions are confirmed. */
export function RequireScreen({ screen, children }: { screen: ScreenKey; children: ReactNode }) {
  const sc = useScope();
  const q = useMyPermissions();

  if (sc.isAdmin || sc.supervisor?.role === 'branch_manager' || sc.supervisor?.role === 'manager') return <>{children}</>;
  if (screen === 'beat_plan' && ['admin', 'super_admin', 'branch_manager', 'manager'].includes(sc.supervisor?.role ?? '')) return <>{children}</>;

  if (q.isPending) return <LoadingSpinner />;

  if (q.isError) return (
    <div className="page">
      <EmptyState
        icon={<ShieldAlert />}
        title={t('تعذر التحقق من الصلاحيات')}
        text={t('لا يمكن عرض هذه الشاشة. تحقق من الاتصال وأعد المحاولة.')}
      />
    </div>
  );

  if (!isScreenAllowed(q.data, screen)) return (
    <div className="page">
      <EmptyState
        icon={<ShieldAlert />}
        title={t('هذه الشاشة غير مفعّلة لحسابك')}
        text={t('تواصل مع مدير النظام لتفعيلها.')}
      />
    </div>
  );

  return <>{children}</>;
}

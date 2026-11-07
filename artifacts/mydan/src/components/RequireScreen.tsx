import type { ReactNode } from 'react';
import { useMyPermissions, isScreenAllowed, type ScreenKey } from '@/lib/permissions';
import { useScope } from '@/lib/data';
import { canBypassScreenGrant, isScreenRoleSupported } from '@/lib/screen-permissions';
import EmptyState from './EmptyState';
import LoadingSpinner from './LoadingSpinner';
import { ShieldAlert } from './Icons';
import { t } from '@/i18n';

/** UI gate for per-supervisor screen permissions. Fails closed: denies access until permissions are confirmed. */
export function RequireScreen({ screen, children }: { screen: ScreenKey; children: ReactNode }) {
  const sc = useScope();
  const q = useMyPermissions();

  if (canBypassScreenGrant(sc.supervisor.role, screen)) return <>{children}</>;

  if (isScreenRoleSupported(sc.supervisor.role, screen) && q.isPending) return <LoadingSpinner />;

  if (isScreenRoleSupported(sc.supervisor.role, screen) && q.isError) return (
    <div className="page" role="alert">
      <EmptyState
        icon={<ShieldAlert />}
        title={t('تعذر التحقق من الصلاحيات')}
        text={t('لا يمكن عرض هذه الشاشة. تحقق من الاتصال وأعد المحاولة.')}
        action={{ label: t('إعادة المحاولة'), onClick: () => void q.refetch() }}
      />
    </div>
  );

  if (!isScreenRoleSupported(sc.supervisor.role, screen) || !q.data || !isScreenAllowed(q.data, screen)) return (
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

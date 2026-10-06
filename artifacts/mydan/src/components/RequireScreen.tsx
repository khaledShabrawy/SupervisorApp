import type { ReactNode } from 'react';
import { useScreenAllowed, type ScreenKey } from '@/lib/permissions';
import EmptyState from './EmptyState';
import { ShieldAlert } from './Icons';
import { t } from '@/i18n';

/** UI gate for per-supervisor screen permissions. Data access itself is enforced by RLS. */
export function RequireScreen({ screen, children }: { screen: ScreenKey; children: ReactNode }) {
  if (useScreenAllowed(screen)) return <>{children}</>;
  return <div className="page"><EmptyState icon={<ShieldAlert />} title={t('هذه الشاشة غير مفعّلة لحسابك')} text={t('تواصل مع مدير النظام لتفعيلها.')} /></div>;
}

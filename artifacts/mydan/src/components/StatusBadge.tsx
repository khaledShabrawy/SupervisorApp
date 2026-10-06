import { memo } from 'react';
import { t } from '@/i18n';

const MAP: Record<string, [string, string]> = {
  completed: [t('مكتمل'), 'b-green'], pending: [t('معلق'), 'b-yellow'],
  skipped: [t('ملغي'), 'b-red'], in_progress: [t('جاري'), 'b-blue'],
  confirmed: [t('مؤكد'), 'b-blue'], delivered: [t('تم التسليم'), 'b-green'],
};
export const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const [label, cls] = MAP[status] ?? [status, 'b-gray'];
  return <span className={`badge ${cls}`} data-testid={`status-${status}`}>{label}</span>;
});
export default StatusBadge;

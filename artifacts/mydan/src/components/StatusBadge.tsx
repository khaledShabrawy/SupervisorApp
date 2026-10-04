import { memo } from 'react';

const MAP: Record<string, [string, string]> = {
  completed: ['مكتمل', 'b-green'], pending: ['معلق', 'b-yellow'],
  cancelled: ['ملغي', 'b-red'], in_progress: ['جاري', 'b-blue'],
  confirmed: ['مؤكد', 'b-blue'], delivered: ['تم التسليم', 'b-green'],
};
export const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const [label, cls] = MAP[status] ?? [status, 'b-gray'];
  return <span className={`badge ${cls}`} data-testid={`status-${status}`}>{label}</span>;
});
export default StatusBadge;

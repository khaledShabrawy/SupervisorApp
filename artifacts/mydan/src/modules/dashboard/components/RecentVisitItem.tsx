import { memo } from 'react';
import type { VisitRow } from '@/lib/data';
import { StatusBadge } from '@/components/StatusBadge';
import { fmtDate, fmtTime } from '@/lib/format';
import { Act } from '@/screens/shared';
import { t } from '@/i18n';

export const RecentVisitItem = memo(function RecentVisitItem({
  v,
  onOpen,
}: {
  v: VisitRow;
  onOpen: (id: string) => void;
}) {
  return (
    <Act id={v.id} onAct={onOpen} className="s-row" testId={`row-recent-${v.id}`}>
      <div className="grow">
        <div className="title">{v.customers?.name ?? t('عميل')}</div>
        <div className="muted">
          {fmtDate(v.visit_date)} · {fmtTime(v.check_in_time)}
        </div>
      </div>
      <StatusBadge status={v.status} />
    </Act>
  );
});

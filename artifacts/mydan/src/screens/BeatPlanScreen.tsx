import { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Route } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useBeatPlan, type BeatRow } from '@/lib/data';
import { customerTypeLabel } from '@/lib/screen-helpers';
import { PageTitle } from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import { ErrorState, SkeletonList } from '@/components/States';
import { DAYS } from '@/lib/format';
import { Chip, useRefetch } from './shared';
import { t } from '@/i18n';

const ORDER = [6, 0, 1, 2, 3, 4, 5];
const Item = memo(function Item({ b, i, status, onOpen }: { b: BeatRow; i: number; status?: string; onOpen: (id: string) => void }) {
  const open = useCallback(() => onOpen(b.customer_id), [onOpen, b.customer_id]);
  return <button className="s-row" onClick={open} data-testid={`card-beat-${b.id}`}>
    <div className="grow"><div className="title">{i + 1}. {b.customers?.name ?? t('عميل غير متاح')}</div>
      <div className="muted row" style={{ gap: 4 }}><MapPin size={14} />{b.customers?.address ?? '—'}</div></div>
    {b.customers && <span className="badge b-blue">{t(customerTypeLabel(b.customers.customer_type))}</span>}
    {status && <StatusBadge status={status} />}
  </button>;
});
export default function BeatPlanScreen() {
  const { supervisor } = useAuth(); const settings = useAppSettings();
  const nav = useNavigate(); const today = new Date().getDay(); const [day, setDay] = useState(today); const q = useBeatPlan(day); const retry = useRefetch(q.refetch); const onDay = useCallback((v: string) => setDay(Number(v)), []);
  const open = useCallback((id: string) => nav(`/visits/new?customer=${id}`), [nav]);
  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle>{t('خطة الزيارات')}</PageTitle>
    <div className="tabs">{ORDER.map((i) => <Chip key={i} value={String(i)} label={`${DAYS[i]}${i === today ? t(' (اليوم)') : ''}`} active={day === i} onSelect={onDay} testId={`day-${i}`} />)}</div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : q.data.plan.length === 0 ? <EmptyState icon={<Route />} title={t('لا توجد زيارات مخططة')} />
      : q.data.plan.map((b, i) => <Item key={b.id} b={b} i={i} status={day === today ? q.data.visited.get(b.customer_id) : undefined} onOpen={open} />)}
  </div>;
}

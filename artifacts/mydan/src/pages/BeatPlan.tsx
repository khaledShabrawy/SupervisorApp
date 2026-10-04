import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Route } from 'lucide-react';
import { useBeatPlan } from '@/lib/data';
import { PageTitle } from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import { ErrorState, SkeletonList } from '@/components/States';
import { DAYS } from '@/lib/format';

export default function BeatPlan() {
  const nav = useNavigate(); const today = new Date().getDay(); const [day, setDay] = useState(today); const q = useBeatPlan(day);
  return <div className="page">
    <PageTitle>خطة المسار</PageTitle>
    <div className="tabs">{DAYS.map((d, i) => <button key={d} className={`chip ${day === i ? 'on' : ''}`} onClick={() => setDay(i)} data-testid={`day-${i}`}>{d}{i === today ? ' (اليوم)' : ''}</button>)}</div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      : q.data.plan.length === 0 ? <EmptyState icon={<Route />} title="لا عملاء في مسار هذا اليوم" />
      : q.data.plan.map((b, i) => { const st = day === today ? q.data.visited.get(b.customer_id) : undefined; return <div key={b.id} className="card row" data-testid={`card-beat-${b.id}`}>
        <div className="grow"><div className="title">{i + 1}. {b.customers?.name ?? 'عميل غير متاح'}</div>
          <div className="muted row" style={{ gap: 4 }}><MapPin size={14} />{b.customers?.address ?? '—'}</div></div>
        {st ? <StatusBadge status={st} /> : day === today && <button className="btn sm" onClick={() => nav('/visits/new')}>زيارة</button>}
      </div>; })}
  </div>;
}

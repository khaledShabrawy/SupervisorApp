import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, ClipboardList, Play, Plus, XCircle } from 'lucide-react';
import { useUpdateVisitStatus, useVisits, type VisitRow } from '@/lib/data';
import { StatusBadge } from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import { PageTitle } from '@/components/Layout';
import { fmtDate, fmtTime } from '@/lib/format';

const FILTERS = [['all', 'الكل'], ['pending', 'معلقة'], ['in_progress', 'جارية'], ['completed', 'مكتملة'], ['cancelled', 'ملغية']];

function VisitCard({ v }: { v: VisitRow }) {
  const nav = useNavigate();
  const m = useUpdateVisitStatus();
  const set = (status: 'completed' | 'cancelled') => {
    if (status === 'cancelled' && !window.confirm('هل تريد إلغاء هذه الزيارة؟')) return;
    m.mutate({ id: v.id, status });
  };
  return <div className="card col" data-testid={`card-visit-${v.id}`}>
    <div className="row between"><div className="title grow">{v.customers?.name ?? 'عميل غير معروف'}</div><StatusBadge status={v.status} /></div>
    <div className="muted">{fmtDate(v.visit_date)} · دخول {fmtTime(v.check_in_time)} · خروج {fmtTime(v.check_out_time)}</div>
    {v.notes && <div style={{ fontSize: 14 }}>{v.notes}</div>}
    {(v.status === 'pending' || v.status === 'in_progress') && <div className="row">
      {v.status === 'pending' && <button className="btn sm success grow" disabled={m.isPending} onClick={() => nav(`/visits/new?visit=${encodeURIComponent(v.id)}`)}><Play size={18} /> بدء</button>}
      {v.status === 'in_progress' && <button className="btn sm success grow" disabled={m.isPending} onClick={() => set('completed')}><CheckCheck size={18} /> إنهاء</button>}
      <button className="btn sm danger-ghost grow" disabled={m.isPending} onClick={() => set('cancelled')}><XCircle size={18} /> إلغاء</button>
    </div>}
  </div>;
}
export default function Visits() {
  const nav = useNavigate(); const [f, setF] = useState('all'); const q = useVisits(f);
  return <div className="page">
    <PageTitle>الزيارات</PageTitle>
    <div className="tabs" role="tablist">{FILTERS.map(([k, l]) => <button key={k} className={`chip ${f === k ? 'on' : ''}`} onClick={() => setF(k)} data-testid={`filter-${k}`}>{l}</button>)}</div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      : q.items.length === 0 ? <EmptyState icon={<ClipboardList />} title="لا توجد زيارات" text="لا نتائج لهذا التصنيف." action={{ label: 'زيارة جديدة', onClick: () => nav('/visits/new') }} />
      : <>{q.items.map((v) => <VisitCard key={v.id} v={v} />)}<LoadMore q={q} /></>}
    <button className="btn fab" aria-label="زيارة جديدة" data-testid="button-fab-visit" onClick={() => nav('/visits/new')}><Plus /> زيارة جديدة</button>
  </div>;
}

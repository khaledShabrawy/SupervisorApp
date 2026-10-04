import { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, ClipboardList, Play, Plus, RefreshCw, XCircle } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useUpdateVisitStatus, type VisitRow } from '@/lib/data';
import { useVisitsRange } from '@/lib/screen-data';
import { distanceMeters } from '@/lib/policy';
import { StatusBadge } from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import { PageTitle } from '@/components/Layout';
import { fmtDate, fmtTime } from '@/lib/format';
import { Chip, distanceLabel, usePullRefresh, useSentinel } from './shared';

type Row = VisitRow & { customers: (VisitRow['customers'] & { latitude?: number | null; longitude?: number | null }) | null };
type Period = 'today' | 'week' | 'month';
const TABS: [Period, string][] = [['today', 'اليوم'], ['week', 'الأسبوع'], ['month', 'الشهر']];

const Item = memo(function Item({ v, onStart, onStatus }: { v: Row; onStart: (id: string) => void; onStatus: (id: string, s: 'completed' | 'cancelled') => void }) {
  const c = v.customers;
  const dist = v.latitude != null && v.longitude != null && c?.latitude != null && c?.longitude != null
    ? distanceLabel(distanceMeters(v.latitude, v.longitude, c.latitude, c.longitude)) : null;
  const start = useCallback(() => onStart(v.id), [onStart, v.id]);
  const done = useCallback(() => onStatus(v.id, 'completed'), [onStatus, v.id]);
  const cancel = useCallback(() => onStatus(v.id, 'cancelled'), [onStatus, v.id]);
  return <div className="card col" data-testid={`card-visit-${v.id}`}>
    <div className="row between"><div className="title grow">{c?.name ?? 'عميل غير معروف'}</div><StatusBadge status={v.status} /></div>
    <div className="muted">{fmtDate(v.visit_date)} · دخول {fmtTime(v.check_in_time)} · خروج {fmtTime(v.check_out_time)}{dist ? ` · ${dist}` : ''}</div>
    {v.notes && <div style={{ fontSize: 14 }}>{v.notes}</div>}
    {(v.status === 'pending' || v.status === 'in_progress') && <div className="row">
      {v.status === 'pending' && <button className="btn sm success grow" onClick={start}><Play size={18} /> بدء</button>}
      {v.status === 'in_progress' && <button className="btn sm success grow" onClick={done}><CheckCheck size={18} /> إنهاء</button>}
      <button className="btn sm danger-ghost grow" onClick={cancel}><XCircle size={18} /> إلغاء</button>
    </div>}
  </div>;
});

export default function VisitsScreen() {
  const nav = useNavigate(); const { supervisor } = useAuth(); const settings = useAppSettings();
  const [p, setP] = useState<Period>('today');
  const onTab = useCallback((v: string) => setP(v as Period), []);
  const q = useVisitsRange(p); const m = useUpdateVisitStatus();
  const refresh = useCallback(() => { void q.refetch(); }, [q]);
  usePullRefresh(refresh);
  const more = useCallback(() => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); }, [q]);
  const sentinel = useSentinel(!!q.hasNextPage, more);
  const onStart = useCallback((id: string) => nav(`/visits/new?visit=${id}`), [nav]);
  const onStatus = useCallback((id: string, status: 'completed' | 'cancelled') => {
    if (status === 'cancelled' && !window.confirm('هل تريد إلغاء هذه الزيارة؟')) return;
    m.mutate({ id, status });
  }, [m]);
  const create = useCallback(() => nav('/visits/new'), [nav]);
  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle action={<button className="icon-btn" aria-label="تحديث" onClick={refresh} data-testid="button-refresh"><RefreshCw className={q.isFetching ? 's-spin' : ''} /></button>}>الزيارات</PageTitle>
    <div className="tabs" role="tablist">{TABS.map(([k, l]) => <Chip key={k} role="tab" value={k} label={l} active={p === k} onSelect={onTab} testId={`tab-${k}`} />)}</div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={refresh} />
      : q.items.length === 0 ? <EmptyState icon={<ClipboardList />} title="لا توجد زيارات" text="لا زيارات في هذه الفترة." action={{ label: 'زيارة جديدة', onClick: create }} />
      : <>{(q.items as Row[]).map((v) => <Item key={v.id} v={v} onStart={onStart} onStatus={onStatus} />)}<div ref={sentinel} /><LoadMore q={q} /></>}
    <button className="btn fab" aria-label="زيارة جديدة" data-testid="button-fab-visit" onClick={create}><Plus /> زيارة جديدة</button>
  </div>;
}

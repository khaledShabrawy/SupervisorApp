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
import { fmtDate, fmtTime, num, visitMinutes } from '@/lib/format';
import { Chip, distanceLabel, usePullRefresh, useSentinel } from './shared';
import { t } from '@/i18n';

type Row = VisitRow & { customers: (VisitRow['customers'] & { latitude?: number | null; longitude?: number | null }) | null };
type Period = 'today' | 'week' | 'month';
const TABS: [Period, string][] = [['today', t('اليوم')], ['week', t('الأسبوع')], ['month', t('الشهر')]];

const Item = memo(function Item({ v, onStart, onStatus }: { v: Row; onStart: (id: string) => void; onStatus: (id: string, s: 'completed' | 'skipped') => void }) {
  const nav = useNavigate();
  const c = v.customers;
  const dist = v.latitude != null && v.longitude != null && c?.latitude != null && c?.longitude != null
    ? distanceLabel(distanceMeters(v.latitude, v.longitude, c.latitude, c.longitude)) : null;
  const minutes = visitMinutes(v.check_in_time, v.check_out_time);
  const open = useCallback(() => nav(`/visits/${v.id}`), [nav, v.id]);
  const start = useCallback(() => onStart(v.id), [onStart, v.id]);
  const cancel = useCallback(() => onStatus(v.id, 'skipped'), [onStatus, v.id]);
  return <div className="card col" data-testid={`card-visit-${v.id}`} onClick={open}
    onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    }} role="button" tabIndex={0}>
    <div className="row between"><div className="title grow">{c?.name ?? t('عميل غير معروف')}</div><StatusBadge status={v.status} /></div>
    <div className="muted">{fmtDate(v.visit_date)} · {t('دخول')} {fmtTime(v.check_in_time)} · {t('خروج')} {fmtTime(v.check_out_time)}{dist ? ` · ${dist}` : ''}</div>
    {minutes != null && minutes > 0 && <div className="muted" style={{ fontSize: 12 }}>{t('مدة الزيارة: {n} دقيقة', { n: num(minutes) })}</div>}
    {v.notes && <div style={{ fontSize: 14 }}>{v.notes}</div>}
    {(v.status === 'pending' || v.status === 'in_progress') && <div className="row">
      {v.status === 'pending' && <button className="btn sm success grow" onClick={(e) => { e.stopPropagation(); start(); }}><Play size={18} /> {t('بدء')}</button>}
      {/* Completing needs a visit outcome, which is chosen on the detail screen. */}
      {v.status === 'in_progress' && <button className="btn sm success grow" onClick={(e) => { e.stopPropagation(); open(); }}><CheckCheck size={18} /> {t('متابعة وإنهاء')}</button>}
      <button className="btn sm danger-ghost grow" onClick={(e) => { e.stopPropagation(); cancel(); }}><XCircle size={18} /> {t('إلغاء')}</button>
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
  const onStatus = useCallback((id: string, status: 'completed' | 'skipped') => {
    if (status === 'skipped' && !window.confirm(t('هل تريد إلغاء هذه الزيارة؟'))) return;
    m.mutate({ id, status });
  }, [m]);
  const create = useCallback(() => nav('/visits/new'), [nav]);
  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle action={<button className="icon-btn" aria-label={t('تحديث')} onClick={refresh} data-testid="button-refresh"><RefreshCw className={q.isFetching ? 's-spin' : ''} /></button>}>{t('الزيارات')}</PageTitle>
    <div className="tabs" role="tablist">{TABS.map(([k, l]) => <Chip key={k} role="tab" value={k} label={l} active={p === k} onSelect={onTab} testId={`tab-${k}`} />)}</div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={refresh} />
      : q.items.length === 0 ? <EmptyState icon={<ClipboardList />} title={t('لا توجد زيارات')} text={t('لا زيارات في هذه الفترة.')} action={{ label: t('زيارة جديدة'), onClick: create }} />
      : <>{(q.items as Row[]).map((v) => <Item key={v.id} v={v} onStart={onStart} onStatus={onStatus} />)}<div ref={sentinel} /><LoadMore q={q} /></>}
    <button className="btn fab" aria-label={t('زيارة جديدة')} data-testid="button-fab-visit" onClick={create}><Plus /> {t('زيارة جديدة')}</button>
  </div>;
}

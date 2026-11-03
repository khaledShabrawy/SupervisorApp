import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, ClipboardList, Compass, Download, Play, Plus, RefreshCw, XCircle } from '@/components/Icons';
import { exportToCsv } from '@/lib/csv-export';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useUpdateVisitStatus, type VisitRow } from '@/lib/data';
import { useVisitsRange } from '@/lib/screen-data';
import { usePriorityCustomerIds } from '../services/visitService';
import { distanceMeters } from '@/lib/policy';
import { mapsDirectionsUrl } from '@/lib/visit-geo';
import { StatusBadge } from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import { PageTitle } from '@/components/Layout';
import { fmtDate, fmtTime, num, visitMinutes } from '@/lib/format';
import { Chip, distanceLabel, usePullRefresh, useSentinel } from '@/screens/shared';
import { t } from '@/i18n';
import { confirm } from '@/lib/confirm';

type Row = VisitRow & { customers: (VisitRow['customers'] & { latitude?: number | null; longitude?: number | null }) | null };
type Period = 'today' | 'week' | 'month';
const TABS: [Period, string][] = [['today', t('اليوم')], ['week', t('الأسبوع')], ['month', t('الشهر')]];

const Item = memo(function Item({
  v,
  isPriority,
  onStart,
  onStatus,
  gpsLat,
  gpsLng,
  radiusM,
}: {
  v: Row;
  isPriority?: boolean;
  onStart: (id: string) => void;
  onStatus: (id: string, s: 'completed' | 'skipped') => void;
  gpsLat?: number | null;
  gpsLng?: number | null;
  radiusM: number;
}) {
  const nav = useNavigate();
  const c = v.customers;
  const dist = v.latitude != null && v.longitude != null && c?.latitude != null && c?.longitude != null
    ? distanceLabel(distanceMeters(v.latitude, v.longitude, c.latitude, c.longitude)) : null;

  // Live distance for active/pending visits
  const liveDist = gpsLat != null && gpsLng != null && c?.latitude != null && c?.longitude != null
    ? distanceMeters(gpsLat, gpsLng, c.latitude, c.longitude)
    : null;

  const minutes = visitMinutes(v.check_in_time, v.check_out_time);
  const open = useCallback(() => nav(`/visits/${v.id}`), [nav, v.id]);
  const start = useCallback(() => onStart(v.id), [onStart, v.id]);
  const cancel = useCallback(() => onStatus(v.id, 'skipped'), [onStatus, v.id]);

  return <div className="card col" data-testid={`card-visit-${v.id}`} onClick={open}
    onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    }} role="button" tabIndex={0}>
    <div className="row between" style={{ alignItems: 'flex-start' }}>
      <div className="grow">
        <div className="title row" style={{ alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span>{c?.name ?? t('عميل غير معروف')}</span>
          {isPriority && <span className="badge b-amber" style={{ fontSize: 11, padding: '1px 6px', fontWeight: 600 }}>⭐ {t('أولوية')}</span>}
        </div>
        {v.on_beat != null ? (
          <div style={{ marginTop: 4 }}>
            <span className={`badge ${v.on_beat ? 'b-green' : 'b-red'}`} style={{ fontSize: 11, padding: '2px 8px', fontWeight: 600 }}>
              {v.on_beat ? `✅ ${t('داخل النطاق')}` : `⚠️ ${t('خارج النطاق (OOR)')}`}
              {v.geo_distance != null ? ` · ${num(Math.round(v.geo_distance))} ${t('م')}` : ''}
            </span>
          </div>
        ) : (v.status === 'pending' || v.status === 'in_progress') && liveDist != null ? (
          <div style={{ marginTop: 4 }}>
            <span
              className={`badge ${liveDist <= radiusM ? 'b-green' : 'b-gray'}`}
              style={{ fontSize: 11, padding: '2px 8px', fontWeight: 600 }}
            >
              {liveDist <= radiusM ? `✅ ${t('داخل النطاق الآن ({d} م)', { d: String(Math.round(liveDist)) })}` : `📍 ${distanceLabel(liveDist)}`}
            </span>
          </div>
        ) : dist ? (
          <div style={{ marginTop: 4 }}>
            <span className="badge b-gray" style={{ fontSize: 11, padding: '2px 8px' }}>📍 {dist}</span>
          </div>
        ) : null}
      </div>
      <StatusBadge status={v.status} />
    </div>
    <div className="muted">{fmtDate(v.visit_date)} · {t('دخول')} {fmtTime(v.check_in_time)} · {t('خروج')} {fmtTime(v.check_out_time)}{dist ? ` · ${dist}` : ''}</div>
    {minutes != null && minutes > 0 && <div className="muted" style={{ fontSize: 12 }}>{t('مدة الزيارة: {n} دقيقة', { n: num(minutes) })}</div>}
    {v.notes && <div style={{ fontSize: 14 }}>{v.notes}</div>}
    {(v.status === 'pending' || v.status === 'in_progress') && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
      {v.status === 'pending' && <button className="btn sm success grow" onClick={(e) => { e.stopPropagation(); start(); }}><Play size={18} /> {t('بدء')}</button>}
      {/* Completing needs a visit outcome, which is chosen on the detail screen. */}
      {v.status === 'in_progress' && <button className="btn sm success grow" onClick={(e) => { e.stopPropagation(); open(); }}><CheckCheck size={18} /> {t('متابعة وإنهاء')}</button>}
      {c?.latitude != null && c?.longitude != null && (
        <a
          className="btn sm ghost"
          href={mapsDirectionsUrl(c.latitude, c.longitude)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={t('ملاحة')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 10px' }}
        >
          <Compass size={16} />
          <span>{t('ملاحة')}</span>
        </a>
      )}
      <button className="btn sm danger-ghost grow" onClick={(e) => { e.stopPropagation(); cancel(); }}><XCircle size={18} /> {t('إلغاء')}</button>
    </div>}
  </div>;
});

export default function VisitsScreen() {
  const nav = useNavigate(); const { supervisor } = useAuth(); const settings = useAppSettings();
  const gps = useGeolocation();
  const [p, setP] = useState<Period>('today');
  const onTab = useCallback((v: string) => setP(v as Period), []);
  const q = useVisitsRange(p); const m = useUpdateVisitStatus();
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [geofenceFilter, setGeofenceFilter] = useState<'all' | 'on_beat' | 'oor'>('all');
  const priorityIds = usePriorityCustomerIds();

  const filteredItems = useMemo(() => {
    let all = (q.items ?? []) as Row[];
    if (priorityOnly) all = all.filter((v) => v.customer_id && priorityIds.has(v.customer_id));
    if (geofenceFilter === 'on_beat') all = all.filter((v) => v.on_beat === true);
    if (geofenceFilter === 'oor') all = all.filter((v) => v.on_beat === false);
    return all;
  }, [q.items, priorityOnly, priorityIds, geofenceFilter]);

  const stats = useMemo(() => {
    const list = (q.items ?? []) as Row[];
    const total = list.length;
    const completed = list.filter((v) => v.status === 'completed').length;
    const onBeat = list.filter((v) => v.status === 'completed' && v.on_beat === true).length;
    const compliance = completed > 0 ? Math.round((onBeat / completed) * 100) : null;
    return { total, completed, onBeat, compliance };
  }, [q.items]);

  const refresh = useCallback(() => { void q.refetch(); }, [q]);
  usePullRefresh(refresh);
  const more = useCallback(() => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); }, [q]);
  const sentinel = useSentinel(!!q.hasNextPage, more);
  const onStart = useCallback((id: string) => nav(`/visits/new?visit=${id}`), [nav]);
  const onStatus = useCallback(async (id: string, status: 'completed' | 'skipped') => {
    if (status === 'skipped' && !await confirm('هل تريد إلغاء هذه الزيارة؟')) return;
    m.mutate({ id, status });
  }, [m]);
  const create = useCallback(() => nav('/visits/new'), [nav]);

  const handleExportVisits = useCallback(() => {
    if (!filteredItems.length) return;
    exportToCsv(
      `Visits_${p}_${new Date().toISOString().slice(0, 10)}`,
      [
        { header: t('تاريخ الزيارة'), accessor: (v: Row) => fmtDate(v.visit_date) },
        { header: t('العميل'), accessor: (v: Row) => v.customers?.name || '' },
        { header: t('العنوان'), accessor: (v: Row) => v.customers?.address || '' },
        { header: t('الحالة'), accessor: (v: Row) => v.status },
        { header: t('وقت الدخول'), accessor: (v: Row) => fmtTime(v.check_in_time) },
        { header: t('وقت الخروج'), accessor: (v: Row) => fmtTime(v.check_out_time) },
        { header: t('مدة الزيارة (دقيقة)'), accessor: (v: Row) => visitMinutes(v.check_in_time, v.check_out_time) ?? '' },
        { header: t('النطاق الجغرافي'), accessor: (v: Row) => (v.on_beat != null ? (v.on_beat ? t('داخل النطاق') : t('خارج النطاق OOR')) : '') },
        { header: t('المسافة (متر)'), accessor: (v: Row) => (v.geo_distance != null ? Math.round(v.geo_distance) : '') },
        { header: t('ملاحظات'), accessor: (v: Row) => v.notes || '' },
      ],
      filteredItems
    );
  }, [filteredItems, p]);

  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle action={
      <div className="row gap-1 items-center">
        <button
          className="icon-btn"
          aria-label={t('تصدير Excel')}
          title={t('تصدير الزيارات إلى Excel')}
          onClick={handleExportVisits}
          disabled={!filteredItems.length}
        >
          <Download size={18} />
        </button>
        <button className="icon-btn" aria-label={t('تحديث')} onClick={refresh} data-testid="button-refresh">
          <RefreshCw className={q.isFetching ? 's-spin' : ''} />
        </button>
      </div>
    }>{t('الزيارات')}</PageTitle>

    {/* Performance & Geofence Score Strip for Today */}
    {p === 'today' && stats.total > 0 && (
      <div className="card row between" style={{ alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <span className="badge b-primary" style={{ fontWeight: 700 }}>
            {stats.completed} / {stats.total} {t('مكتملة')}
          </span>
        </div>
        {stats.compliance != null && (
          <span className={`badge ${stats.compliance >= 80 ? 'b-green' : 'b-amber'}`} style={{ fontWeight: 600 }}>
            🎯 {t('نسبة الالتزام بالسياج: {n}%', { n: num(stats.compliance) })}
          </span>
        )}
      </div>
    )}

    <div className="tabs" role="tablist">
      {TABS.map(([k, l]) => <Chip key={k} role="tab" value={k} label={l} active={p === k} onSelect={onTab} testId={`tab-${k}`} />)}
      <Chip role="button" value="priority" label={t('العملاء الأكثر أولوية')} active={priorityOnly} onSelect={() => setPriorityOnly((x) => !x)} testId="chip-priority-filter" />
    </div>

    {/* Geofence Filter Chips */}
    <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
      <button
        type="button"
        className={`chip ${geofenceFilter === 'all' ? 'on' : ''}`}
        onClick={() => setGeofenceFilter('all')}
        style={{ fontSize: 12 }}
      >
        {t('الكل')}
      </button>
      <button
        type="button"
        className={`chip ${geofenceFilter === 'on_beat' ? 'on' : ''}`}
        onClick={() => setGeofenceFilter('on_beat')}
        style={{ fontSize: 12 }}
      >
        ✅ {t('داخل النطاق')}
      </button>
      <button
        type="button"
        className={`chip ${geofenceFilter === 'oor' ? 'on' : ''}`}
        onClick={() => setGeofenceFilter('oor')}
        style={{ fontSize: 12 }}
      >
        ⚠️ {t('خارج النطاق')}
      </button>
    </div>

    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={refresh} />
      : filteredItems.length === 0 ? <EmptyState icon={<ClipboardList />} title={t('لا توجد زيارات')} text={priorityOnly ? t('لا توجد زيارات لعملاء ذوي أولوية في هذه الفترة.') : t('لا زيارات في هذه الفترة.')} action={{ label: t('زيارة جديدة'), onClick: create }} />
      : <>{filteredItems.map((v) => <Item key={v.id} v={v} isPriority={v.customer_id != null && priorityIds.has(v.customer_id)} onStart={onStart} onStatus={onStatus} gpsLat={gps.latitude} gpsLng={gps.longitude} radiusM={settings.geofence_radius_m} />)}<div ref={sentinel} /><LoadMore q={q} /></>}
    <button className="btn fab" aria-label={t('زيارة جديدة')} data-testid="button-fab-visit" onClick={create}><Plus /> {t('زيارة جديدة')}</button>
  </div>;
}

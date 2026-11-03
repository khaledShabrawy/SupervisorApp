import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Compass, MapPin, MapPinned, Play, RefreshCw, Route, Zap } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useBeatPlan, useBeatPlanDays, type BeatRow } from '@/lib/data';
import { customerTypeLabel } from '@/lib/screen-helpers';
import { distanceKm, mapsDirectionsUrl, optimizeRoute, totalRouteKm } from '@/lib/visit-geo';
import { distanceMeters } from '@/lib/policy';
import { PageTitle } from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import { ErrorState, SkeletonList } from '@/components/States';
import { DAYS } from '@/lib/format';
import { Chip, distanceLabel, useRefetch } from '@/screens/shared';
import { t } from '@/i18n';

const BeatMap = lazy(() => import('@/components/BeatMap'));

const Item = memo(function Item({
  b,
  i,
  status,
  onOpen,
  gpsLat,
  gpsLng,
  radiusM,
  isOptimized,
  prevStopDist,
}: {
  b: BeatRow;
  i: number;
  status?: string;
  onOpen: (id: string) => void;
  gpsLat?: number | null;
  gpsLng?: number | null;
  radiusM: number;
  isOptimized?: boolean;
  prevStopDist?: number | null;
}) {
  const c = b.customers;
  const open = useCallback(() => onOpen(b.customer_id), [onOpen, b.customer_id]);

  const distM = useMemo(() => {
    if (gpsLat == null || gpsLng == null || c?.latitude == null || c?.longitude == null) return null;
    return distanceMeters(gpsLat, gpsLng, c.latitude, c.longitude);
  }, [gpsLat, gpsLng, c?.latitude, c?.longitude]);

  const inGeofence = distM != null && distM <= radiusM;
  const distText = distanceLabel(distM);

  return (
    <div
      className="card col"
      style={{
        padding: '12px 14px',
        gap: 8,
        borderInlineStart: isOptimized ? '4px solid var(--color-primary)' : undefined,
        cursor: 'pointer',
      }}
      onClick={open}
      data-testid={`card-beat-${b.id}`}
    >
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="title row" style={{ alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              className={`badge ${isOptimized ? 'b-primary' : 'b-gray'}`}
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                fontWeight: 700,
                minWidth: 26,
                textAlign: 'center',
                borderRadius: 12,
              }}
            >
              #{i + 1}
            </span>
            <span>{c?.name ?? t('عميل غير متاح')}</span>
            {c?.customer_code && (
              <span className="badge b-blue" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                {c.customer_code}
              </span>
            )}
          </div>
          <div className="muted row" style={{ gap: 4, marginTop: 4, fontSize: 13 }}>
            <MapPin size={14} />
            <span>{c?.address ?? '—'}</span>
          </div>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
          {status && <StatusBadge status={status} />}
          {c && <span className="badge b-blue" style={{ fontSize: 11 }}>{t(customerTypeLabel(c.customer_type))}</span>}
        </div>
      </div>

      <div className="row between" style={{ alignItems: 'center', fontSize: 12, flexWrap: 'wrap', gap: 6 }}>
        <div className="row" style={{ alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {distM != null ? (
            <span
              className={`badge ${inGeofence ? 'b-green' : 'b-gray'}`}
              style={{ fontSize: 11, padding: '2px 8px', fontWeight: 600 }}
            >
              {inGeofence ? `✅ ${t('داخل النطاق')}` : `📍 ${distText}`}
            </span>
          ) : (
            <span className="muted" style={{ fontSize: 11 }}>
              {t('بلا إحداثيات')}
            </span>
          )}

          {isOptimized && prevStopDist != null && prevStopDist > 0 && (
            <span className="muted" style={{ fontSize: 11, color: 'var(--color-primary)' }}>
              +{prevStopDist} {t('كم من المحطة السابقة')}
            </span>
          )}
        </div>

        <div className="row" style={{ gap: 6 }}>
          {c?.latitude != null && c?.longitude != null && (
            <a
              href={mapsDirectionsUrl(c.latitude, c.longitude)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn sm ghost"
              style={{ padding: '3px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={(e) => e.stopPropagation()}
              title={t('التوجيه إلى العميل على خرائط جوجل')}
            >
              <Compass size={14} />
              <span>{t('ملاحة')}</span>
            </a>
          )}
          <button
            className="btn sm success"
            style={{ padding: '3px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
          >
            <Play size={13} />
            <span>{status === 'completed' ? t('عرض الزيارة') : t('بدء')}</span>
          </button>
        </div>
      </div>
    </div>
  );
});

export default function BeatPlanScreen() {
  const { supervisor } = useAuth();
  const settings = useAppSettings();
  const nav = useNavigate();
  const gps = useGeolocation();
  const today = new Date().getDay();

  const daysQ = useBeatPlanDays();
  const availableDays = daysQ.data ?? [];

  const [day, setDay] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [optimized, setOptimized] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');

  useEffect(() => {
    if (availableDays.length === 0) return;
    if (day === null || !availableDays.includes(day)) {
      setDay(availableDays.includes(today) ? today : availableDays[0]);
    }
  }, [availableDays, today, day]);
  // reset optimizer when day changes
  useEffect(() => { setOptimized(false); }, [day]);

  const q = useBeatPlan(day ?? today);
  const retry = useRefetch(q.refetch);
  const onDay = useCallback((v: string) => setDay(Number(v)), []);
  const open = useCallback((id: string) => nav(`/visits/new?customer=${id}`), [nav]);
  const toggleMap = useCallback(() => setShowMap((s) => !s), []);
  const isFetching = q.isFetching || daysQ.isFetching;
  const sync = useCallback(() => { void q.refetch(); void daysQ.refetch(); setOptimized(false); }, [q, daysQ]);

  // ── Route Optimizer ───────────────────────────────────────────────────────
  const startLat = gps.latitude ?? q.data?.plan[0]?.customers?.latitude ?? null;
  const startLng = gps.longitude ?? q.data?.plan[0]?.customers?.longitude ?? null;

  const optimizedPlan = useMemo<BeatRow[]>(() => {
    if (!optimized || !q.data?.plan.length || startLat == null || startLng == null) return [];
    return optimizeRoute(
      q.data.plan.map((b) => ({ ...b, latitude: b.customers?.latitude ?? null, longitude: b.customers?.longitude ?? null })),
      startLat, startLng,
    );
  }, [optimized, q.data?.plan, startLat, startLng]);

  const distOriginal = useMemo(() => {
    if (!q.data?.plan.length || startLat == null || startLng == null) return null;
    return totalRouteKm(
      q.data.plan.map((b) => ({ latitude: b.customers?.latitude ?? null, longitude: b.customers?.longitude ?? null })),
      startLat, startLng,
    );
  }, [q.data?.plan, startLat, startLng]);

  const distOptimized = useMemo(() => {
    if (!optimizedPlan.length || startLat == null || startLng == null) return null;
    return totalRouteKm(
      optimizedPlan.map((b) => ({ latitude: b.customers?.latitude ?? null, longitude: b.customers?.longitude ?? null })),
      startLat, startLng,
    );
  }, [optimizedPlan, startLat, startLng]);

  const activePlan = optimized && optimizedPlan.length ? optimizedPlan : q.data?.plan ?? [];
  const canOptimize = !!q.data?.plan.length && startLat != null && startLng != null;
  const toggleOptimize = useCallback(() => setOptimized((s) => !s), []);

  // Compute inter-stop distances for optimized display
  const prevDistances = useMemo(() => {
    return activePlan.map((b, idx) => {
      if (idx === 0) return null;
      const prev = activePlan[idx - 1]?.customers;
      const curr = b.customers;
      if (prev?.latitude != null && prev?.longitude != null && curr?.latitude != null && curr?.longitude != null) {
        return distanceKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
      }
      return null;
    });
  }, [activePlan]);

  // Statistics for today's beat plan
  const stats = useMemo(() => {
    const total = activePlan.length;
    const visited = activePlan.filter((b) => day === today && q.data?.visited.get(b.customer_id) === 'completed').length;
    const remaining = Math.max(0, total - visited);
    const pct = total > 0 ? Math.round((visited / total) * 100) : 0;
    return { total, visited, remaining, pct };
  }, [activePlan, day, today, q.data?.visited]);

  const displayedPlan = useMemo(() => {
    if (statusFilter === 'all' || day !== today) return activePlan;
    return activePlan.filter((b) => {
      const isCompleted = q.data?.visited.get(b.customer_id) === 'completed';
      return statusFilter === 'completed' ? isCompleted : !isCompleted;
    });
  }, [activePlan, statusFilter, day, today, q.data?.visited]);

  const titleAction = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        className="btn sm ghost"
        style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 12px', fontSize: 13 }}
        aria-label={t('تحديث')}
        onClick={sync}
        disabled={isFetching}
        data-testid="button-sync-plan"
      >
        <RefreshCw size={15} style={isFetching ? { animation: 'spin 1s linear infinite' } : undefined} />
        {t('تحديث')}
      </button>
      <button className="icon-btn" aria-label={showMap ? t('عرض القائمة') : t('عرض الخريطة')} onClick={toggleMap} data-testid="button-toggle-map">
        {showMap ? <ClipboardList size={20} /> : <MapPinned size={20} />}
      </button>
    </div>
  );

  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle action={titleAction}>{t('خطة الزيارات')}</PageTitle>

    {/* Tabs — تظهر فقط الأيام التي فيها زيارات مخططة لهذا المشرف */}
    {daysQ.isPending
      ? <div className="tabs"><div className="skeleton" style={{ height: 36, width: '100%', borderRadius: 8 }} /></div>
      : availableDays.length > 0
        ? <div className="tabs">
            {availableDays.map((i) => (
              <Chip key={i} value={String(i)} label={DAYS[i]} active={day === i} onSelect={onDay} testId={`day-${i}`} />
            ))}
          </div>
        : null
    }

    {daysQ.isPending
      ? <SkeletonList />
      : daysQ.isError
        ? <ErrorState error={daysQ.error} onRetry={daysQ.refetch} />
        : availableDays.length === 0
          ? <EmptyState icon={<Route />} title={t('لا توجد خطة زيارات مضافة')} text={t('لم يتم تعيين خطة سير لهذا المشرف بعد. يمكن للإدارة رفع وتعيين خطة الزيارات.')} />
          : day === null || q.isPending
            ? <SkeletonList />
            : q.isError
              ? <ErrorState error={q.error} onRetry={retry} />
              : q.data.plan.length === 0
                ? <EmptyState icon={<Route />} title={t('لا توجد زيارات مخططة')} text={t('لا توجد زيارات مسجلة لهذا اليوم.')} />
                : <>
                    {/* ── Route Progress Summary Card ── */}
                    {day === today && stats.total > 0 && (
                      <div className="card col" style={{ gap: 10, padding: '12px 14px' }}>
                        <div className="row between" style={{ alignItems: 'center' }}>
                          <div className="row" style={{ alignItems: 'center', gap: 6 }}>
                            <Route size={16} />
                            <strong>{t('إنجاز خط السير اليومي')}</strong>
                          </div>
                          <span className="badge b-primary" style={{ fontWeight: 700 }}>
                            {stats.visited} / {stats.total} ({stats.pct}%)
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div style={{ width: '100%', height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${stats.pct}%`,
                              height: '100%',
                              background: stats.pct >= 100 ? 'var(--color-success)' : 'var(--color-primary)',
                              borderRadius: 3,
                              transition: 'width 0.4s ease',
                            }}
                          />
                        </div>
                        <div className="row between muted" style={{ fontSize: 12 }}>
                          <span>{t('المكتملة')}: {stats.visited}</span>
                          <span>{t('المتبقية')}: {stats.remaining}</span>
                        </div>
                      </div>
                    )}

                    {/* ── Optimizer Banner ── */}
                    <div className="card row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div className="grow col" style={{ gap: 2 }}>
                        {optimized && distOriginal != null && distOptimized != null ? (
                          <span className="muted" style={{ fontSize: 13 }}>
                            {t('المسافة')}{' '}
                            <span style={{ textDecoration: 'line-through', color: 'var(--color-danger,#ef4444)' }}>{distOriginal} {t('كم')}</span>
                            {' → '}
                            <strong style={{ color: 'var(--color-success,#108981)' }}>{distOptimized} {t('كم')}</strong>
                            {distOriginal > distOptimized && (
                              <span style={{ marginInlineStart: 6, color: 'var(--color-success,#108981)', fontSize: 12 }}>
                                {t('(وفّرت {d} كم)', { d: String(Math.round((distOriginal - distOptimized) * 10) / 10) })}
                              </span>
                            )}
                          </span>
                        ) : distOriginal != null ? (
                          <span className="muted" style={{ fontSize: 13 }}>{t('إجمالي المسار')}: {distOriginal} {t('كم')}</span>
                        ) : null}
                      </div>
                      <button
                        className={`btn sm ${optimized ? 'success' : 'ghost'}`}
                        style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}
                        onClick={toggleOptimize}
                        disabled={!canOptimize}
                        title={canOptimize ? '' : t('يلزم تحديد الموقع أو وجود عملاء بإحداثيات')}
                        data-testid="button-optimize-route"
                      >
                        <Zap size={15} />
                        {optimized ? t('إلغاء التحسين') : t('تحسين المسار')}
                      </button>
                    </div>

                    {/* Status Filter Chips for Today */}
                    {day === today && stats.total > 0 && !showMap && (
                      <div className="row" style={{ gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                        <button
                          type="button"
                          className={`chip ${statusFilter === 'all' ? 'on' : ''}`}
                          onClick={() => setStatusFilter('all')}
                          style={{ fontSize: 12 }}
                        >
                          {t('الكل')} ({stats.total})
                        </button>
                        <button
                          type="button"
                          className={`chip ${statusFilter === 'pending' ? 'on' : ''}`}
                          onClick={() => setStatusFilter('pending')}
                          style={{ fontSize: 12 }}
                        >
                          {t('المتبقية')} ({stats.remaining})
                        </button>
                        <button
                          type="button"
                          className={`chip ${statusFilter === 'completed' ? 'on' : ''}`}
                          onClick={() => setStatusFilter('completed')}
                          style={{ fontSize: 12 }}
                        >
                          {t('المكتملة')} ({stats.visited})
                        </button>
                      </div>
                    )}

                    {showMap
                      ? <Suspense fallback={<SkeletonList />}>
                          <BeatMap
                            plan={activePlan}
                            visited={day === today ? q.data.visited : new Map()}
                          />
                        </Suspense>
                      : displayedPlan.map((b, i) => (
                          <Item
                            key={b.id}
                            b={b}
                            i={i}
                            status={day === today ? q.data.visited.get(b.customer_id) : undefined}
                            onOpen={open}
                            gpsLat={gps.latitude}
                            gpsLng={gps.longitude}
                            radiusM={settings.geofence_radius_m}
                            isOptimized={optimized}
                            prevStopDist={prevDistances[i]}
                          />
                        ))
                    }
                  </>
    }
  </div>;
}

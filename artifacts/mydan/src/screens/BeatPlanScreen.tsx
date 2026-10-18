import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, MapPin, MapPinned, RefreshCw, Route, Zap } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useBeatPlan, useBeatPlanDays, type BeatRow } from '@/lib/data';
import { customerTypeLabel } from '@/lib/screen-helpers';
import { optimizeRoute, totalRouteKm } from '@/lib/visit-geo';
import { PageTitle } from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import { ErrorState, SkeletonList } from '@/components/States';
import { DAYS } from '@/lib/format';
import { Chip, useRefetch } from './shared';
import { t } from '@/i18n';

const BeatMap = lazy(() => import('@/components/BeatMap'));

const Item = memo(function Item({ b, i, status, onOpen }: { b: BeatRow; i: number; status?: string; onOpen: (id: string) => void }) {
  const open = useCallback(() => onOpen(b.customer_id), [onOpen, b.customer_id]);
  return <button className="s-row" onClick={open} data-testid={`card-beat-${b.id}`}>
    <div className="grow">
      <div className="title">{i + 1}. {b.customers?.name ?? t('عميل غير متاح')}</div>
      <div className="muted row" style={{ gap: 4 }}><MapPin size={14} />{b.customers?.address ?? '—'}</div>
    </div>
    {b.customers && <span className="badge b-blue">{t(customerTypeLabel(b.customers.customer_type))}</span>}
    {status && <StatusBadge status={status} />}
  </button>;
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

    {day === null || daysQ.isPending
      ? <SkeletonList />
      : daysQ.isError
        ? <ErrorState error={daysQ.error} onRetry={daysQ.refetch} />
        : availableDays.length === 0
          ? <EmptyState icon={<Route />} title={t('لا توجد خطة زيارات مضافة')} />
          : q.isPending
            ? <SkeletonList />
            : q.isError
              ? <ErrorState error={q.error} onRetry={retry} />
              : q.data.plan.length === 0
                ? <EmptyState icon={<Route />} title={t('لا توجد زيارات مخططة')} />
                : <>
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

                    {showMap
                      ? <Suspense fallback={<SkeletonList />}>
                          <BeatMap
                            plan={activePlan}
                            visited={day === today ? q.data.visited : new Map()}
                          />
                        </Suspense>
                      : activePlan.map((b, i) => (
                          <Item key={b.id} b={b} i={i} status={day === today ? q.data.visited.get(b.customer_id) : undefined} onOpen={open} />
                        ))
                    }
                  </>
    }
  </div>;
}

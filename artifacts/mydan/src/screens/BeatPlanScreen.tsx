import { lazy, memo, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, MapPin, MapPinned, RefreshCw, Route } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useBeatPlan, useBeatPlanDays, type BeatRow } from '@/lib/data';
import { customerTypeLabel } from '@/lib/screen-helpers';
import { PageTitle } from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import { ErrorState, SkeletonList } from '@/components/States';
import { DAYS } from '@/lib/format';
import { Chip, useRefetch } from './shared';
import { LANG, t } from '@/i18n';
import { notify } from '@/lib/toast';

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
  const today = new Date().getDay();

  const daysQ = useBeatPlanDays();
  const availableDays = daysQ.data ?? [];

  const [day, setDay] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => {
    if (availableDays.length === 0) return;
    if (day === null || !availableDays.includes(day)) {
      setDay(availableDays.includes(today) ? today : availableDays[0]);
    }
  }, [availableDays, today, day]);

  const q = useBeatPlan(day ?? today);
  const retry = useRefetch(q.refetch);
  const onDay = useCallback((v: string) => setDay(Number(v)), []);
  const open = useCallback((id: string) => nav(`/visits/new?customer=${id}`), [nav]);
  const toggleMap = useCallback(() => setShowMap((s) => !s), []);
  const syncPlan = useCallback(async () => {
    if (!online) { notify(t('لا يوجد اتصال لتحديث الخطة.'), 'error'); return; }
    setSyncing(true);
    try {
      await Promise.all([daysQ.refetch({ throwOnError: true }), q.refetch({ throwOnError: true })]);
      notify(t('تم تحديث خطة الزيارات'), 'success');
    } catch { notify(t('تعذر تحديث الخطة. تحقق من الاتصال.'), 'error'); }
    finally { setSyncing(false); }
  }, [online, daysQ, q]);

  const syncLabel = LANG === 'ar' ? t('تحديث') : t('تحديث خطة المشرف');
  const mapAction = (
    <button className="icon-btn" aria-label={showMap ? t('عرض القائمة') : t('عرض الخريطة')} onClick={toggleMap} data-testid="button-toggle-map">
      {showMap ? <ClipboardList size={20} /> : <MapPinned size={20} />}
    </button>
  );
  const headerActions = <div className="row" style={{ gap: 6 }}>
    <button className="btn sm ghost" type="button" aria-label={syncLabel} onClick={() => void syncPlan()} disabled={!online || syncing} data-testid="button-sync-plan">
      <RefreshCw size={16} className={syncing ? 's-spin' : ''} /> {syncing ? t('جاري التحديث...') : syncLabel}
    </button>
    {mapAction}
  </div>;

  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle action={headerActions}>{t('خطة الزيارات')}</PageTitle>
    {q.data?.offlineCopy && <div className="alert warn" role="status">{t('تعرض نسخة محفوظة على الجهاز من {date}', { date: new Date(q.data.savedAt).toLocaleString() })}</div>}

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
                : showMap
                  ? <Suspense fallback={<SkeletonList />}>
                      <BeatMap
                        plan={q.data.plan}
                        visited={day === today ? q.data.visited : new Map()}
                      />
                    </Suspense>
                  : q.data.plan.map((b, i) => (
                      <Item key={b.id} b={b} i={i} status={day === today ? q.data.visited.get(b.customer_id) : undefined} onOpen={open} />
                    ))
    }
  </div>;
}

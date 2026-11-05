import { memo, useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { useInput, useRefetch } from '@/screens/shared';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Compass, LocateFixed, MapPin, Play, ShieldCheck, Store } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useCreateVisit, useNearestCustomers, useSaveCustomer, useVisitToStart } from '@/lib/data';
import { useCustomerById } from '@/lib/screen-data';
import { geofence, mapsDirectionsUrl, NEAREST_LIMITS, type NearestLimit } from '@/lib/visit-geo';
import { ErrorState, SkeletonList } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import { CustomerPicker } from '@/components/CustomerPicker';
import { PageTitle } from '@/components/Layout';
import { num } from '@/lib/format';
import { notify } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import type { Customer } from '@/types/database';
import { t } from '@/i18n';

type Gps = { latitude: number; longitude: number };
type Ranked = Customer & { distance_km: number };

function geoText(g: ReturnType<typeof geofence>, radius: number) {
  if (g.distance_m == null) return t('هذا العميل بلا إحداثيات؛ ستُسجّل الزيارة خارج خط السير.');
  return g.on_beat ? t('داخل نطاق العميل ({d} م من {r} م)', { d: num(g.distance_m), r: num(radius) })
    : t('خارج نطاق العميل: {d} م (المسموح {r} م)', { d: num(g.distance_m), r: num(radius) });
}

type OorPending = { c: Customer; g: ReturnType<typeof geofence>; note: string };

const NavigateButton = memo(function NavigateButton({ c }: { c: Pick<Customer, 'latitude' | 'longitude' | 'name'> }) {
  if (c.latitude == null || c.longitude == null) return null;
  return (
    <a
      className="btn sm ghost"
      href={mapsDirectionsUrl(c.latitude, c.longitude)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('التوجيه إلى {name} على خرائط جوجل', { name: c.name })}
      data-testid="link-navigate"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      <Compass size={15} />
      <span>{t('التوجيه 🗺️')}</span>
    </a>
  );
});

const NearCard = memo(function NearCard({ c, radius, busy, onLog }: { c: Ranked; radius: number; busy: boolean; onLog: (c: Ranked) => void }) {
  const inRange = c.distance_km * 1000 <= radius;
  const log = useCallback(() => onLog(c), [onLog, c]);
  return <div className="card col" data-testid={`card-near-${c.id}`}>
    <div className="row between">
      <div className="grow">
        <div className="title row" style={{ alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {c.customer_code && <span className="badge b-blue" style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.customer_code}</span>}
          <span>{c.name}</span>
        </div>
        {c.address && <div className="muted">{c.address}</div>}
      </div>
      <span className={`badge ${inRange ? 'b-green' : 'b-gray'}`} title={inRange ? t('داخل نطاق الزيارة') : t('خارج نطاق الزيارة')}>{t('{d} كم', { d: c.distance_km.toFixed(2) })}</span>
    </div>
    <div className="row" style={{ flexWrap: 'wrap' }}>
      <button className="btn sm success grow" disabled={busy} onClick={log} data-testid={`button-log-${c.id}`}><Play size={18} /> {t('تسجيل زيارة')}</button>
      <NavigateButton c={c} />
    </div>
  </div>;
});

function NearestCustomers({ gps, busy, onLog }: { gps: Gps; busy: boolean; onLog: (c: Ranked) => void }) {
  const s = useAppSettings();
  const [limit, setLimit] = useState<NearestLimit>(5);
  const q = useNearestCustomers(gps.latitude, gps.longitude, limit);
  const retry = useRefetch(q.refetch);
  const ranked = (q.data ?? []) as Ranked[];
  const onLimit = useCallback((e: ChangeEvent<HTMLSelectElement>) =>
    setLimit(e.target.value === 'all' ? 'all' : Number(e.target.value) as NearestLimit), []);
  return <div className="col">
    <div className="row between">
      <span className="title"><MapPin size={18} style={{ display: 'inline', marginInlineEnd: 6 }} />{t('العملاء الأقرب إليك')}</span>
      <label className="row muted" style={{ gap: 6 }}>{t('عرض')}
        <select className="input" style={{ width: 'auto', minHeight: 40 }} value={String(limit)} onChange={onLimit} data-testid="select-nearest-limit">
          {NEAREST_LIMITS.map((n) => <option key={n} value={n}>{n === 'all' ? t('الكل') : num(n)}</option>)}
        </select>
      </label>
    </div>
    {q.isPending ? <SkeletonList n={3} /> : q.isError ? (
      <div className="alert warn row" style={{ alignItems: 'center', gap: 6 }}>
        <span>{t('تعذر تحديد العملاء القريبين تلقائياً. يمكنك اختيار العميل من البحث بالأسفل.')}</span>
      </div>
    )
      : ranked.length === 0 ? <EmptyState icon={<Store />} title={t('لا يوجد عملاء بإحداثيات')} text={t('أضف موقع العملاء من شاشة العملاء أو ابحث بالاسم بالأسفل.')} />
      : ranked.map((c) => <NearCard key={c.id} c={c} radius={s.geofence_radius_m} busy={busy} onLog={onLog} />)}
  </div>;
}

const OOR_REASONS = [
  'إحداثيات العميل غير دقيقة وتتطلب تحديثاً',
  'التاجر متواجد في مخزن أو فرع مجاور',
  'مقابلة التاجر خارج المنفذ',
  'المنفذ مغلق والتاجر متواجد بالجوار',
  'متابعة هاتفية أو استثنائية معتمدة',
  'سبب تشغيلي آخر',
];

export default function NewVisitScreen() {
  const nav = useNavigate(); const { supervisor } = useAuth(); const s = useAppSettings();
  const gps = useGeolocation(); const m = useCreateVisit();
  const saveCustomer = useSaveCustomer();
  const [params] = useSearchParams();
  const existingId = params.get('visit');
  const paramCustomerId = params.get('customer');
  const existing = useVisitToStart(existingId);
  const fallbackCustId = (!existingId ? paramCustomerId : (existing.data?.customer_id || paramCustomerId));
  const pre = useCustomerById(fallbackCustId);
  const [picked, setPicked] = useState<Customer | null>(null);
  const [oorPending, setOorPending] = useState<OorPending | null>(null);
  const [oorReason, setOorReason] = useState<string>(OOR_REASONS[0]);
  const customer = picked ?? existing.data?.customers ?? pre.data ?? null;
  const [editedNotes, setNotes] = useState<string | null>(null);
  const notes = editedNotes ?? existing.data?.notes ?? '';
  const here = useMemo<Gps | null>(() => gps.latitude != null && gps.longitude != null
    ? { latitude: gps.latitude, longitude: gps.longitude } : null, [gps.latitude, gps.longitude]);

  const checkIn = useCallback((c: Customer, note: string) => {
    if (!supervisor || !here || gps.isMock || !gps.accuracy || !gps.recordedAt) return;
    const g = geofence(here, c, s.geofence_radius_m);
    if (g.on_beat) {
      m.mutate({ customer_id: c.id, latitude: here.latitude, longitude: here.longitude, notes: note,
        gps_accuracy_m: gps.accuracy!, gps_recorded_at: gps.recordedAt!, geo_distance: g.distance_m, on_beat: true, ...(existingId ? { existingId } : {}) },
      { onSuccess: (visit) => nav(visit.queued ? '/visits' : `/visits/${visit.id}`, { replace: true }) });
    } else {
      setOorPending({ c, g, note });
    }
  }, [supervisor, here, gps.isMock, gps.accuracy, gps.recordedAt, s.geofence_radius_m, m, existingId, nav]);

  const confirmOor = useCallback(() => {
    if (!oorPending || !here || gps.isMock || !gps.accuracy || !gps.recordedAt) return;
    const { c, g, note } = oorPending;
    setOorPending(null);
    const notePrefix = oorReason ? `[OOR: ${oorReason}]` : '[OOR]';
    const combinedNote = note ? `${notePrefix} ${note}` : notePrefix;
    m.mutate({ customer_id: c.id, latitude: here.latitude, longitude: here.longitude, notes: combinedNote,
      gps_accuracy_m: gps.accuracy!, gps_recorded_at: gps.recordedAt!, geo_distance: g.distance_m, on_beat: false, ...(existingId ? { existingId } : {}) },
    { onSuccess: (visit) => nav(visit.queued ? '/visits' : `/visits/${visit.id}`, { replace: true }) });
  }, [oorPending, here, gps.isMock, gps.accuracy, gps.recordedAt, oorReason, m, existingId, nav]);

  const cancelOor = useCallback(() => setOorPending(null), []);
  const logNearest = useCallback((c: Ranked) => checkIn(c, ''), [checkIn]);
  const submit = useCallback(() => { if (customer) checkIn(customer, notes); }, [customer, notes, checkIn]);

  const handleUpdateCustomerGPS = useCallback(async (c: Customer) => {
    if (!here) return;
    if (!await confirm(t('هل تريد حفظ موقعك الحالي كإحداثيات رسمية لهذا المنفذ؟'))) return;
    saveCustomer.mutate({
      id: c.id,
      input: {
        name: c.name,
        type: (c as any).type || (c as any).customer_type || 'retail',
        address: c.address || '',
        customer_code: c.customer_code,
        latitude: here.latitude,
        longitude: here.longitude,
        is_active: c.is_active ?? true,
      },
    }, {
      onSuccess: () => {
        notify(t('تم تحديث موقع المنفذ بنجاح'), 'success');
        if (picked && picked.id === c.id) {
          setPicked({ ...picked, latitude: here.latitude, longitude: here.longitude });
        }
      },
      onError: (err: any) => notify(err.message, 'error'),
    });
  }, [here, saveCustomer, picked]);

  const check = customer && here ? geofence(here, customer, s.geofence_radius_m) : null;
  const onNotes = useInput(setNotes);
  const retryExisting = useRefetch(existing.refetch); const retryPre = useRefetch(pre.refetch);
  const back = useCallback(() => nav('/visits'), [nav]);
  const clear = useCallback(() => setPicked(null), []);
  const focused = !!existingId || !!paramCustomerId || !!customer || !!picked;

  return <div className="page" aria-label={s.app_name} data-role={supervisor?.role}>
    <PageTitle action={<button className="icon-btn" aria-label={t('رجوع إلى الزيارات')} onClick={back}><ArrowRight className="flip-ltr" /></button>}>{existingId ? t('بدء زيارة معلقة') : t('زيارة جديدة')}</PageTitle>

    <div className="card col">
      <span className="title">{t('موقعك')}</span>
      {gps.isMock ? (
        <div className="alert err" role="alert" style={{ fontWeight: 600 }}>
          ⚠️ {gps.mockWarning || t('تم رصد تزييف موقع (Mock/Fake GPS). لن يُسمح بتسجيل الزيارة بموقع وهمي.')}
        </div>
      ) : gps.loading ? (
        <div className="alert warn" role="status">{t('جاري تحديد موقعك...')}</div>
      ) : here ? (
        <div className="muted">{t('تم تحديد موقعك · دقة GPS {d} م', { d: num(Math.round(gps.accuracy ?? 0)) })}</div>
      ) : (
        <div className="alert err" role="alert">{gps.error}
          <div style={{ fontWeight: 400, marginTop: 4 }}>{t('لا يمكن تسجيل زيارة بدون الموقع. فعّل GPS واسمح للتطبيق بالوصول للموقع من إعدادات المتصفح أو الهاتف.')}</div>
        </div>
      )}
      {!gps.loading && <button className="btn ghost" onClick={gps.retry}><LocateFixed /> {t('إعادة تحديد الموقع')}</button>}
    </div>

    {focused ? <>
      <div className="card col"><span className="title">{t('العميل')}</span>
        {existingId && existing.isPending ? <SkeletonList n={1} />
          : existingId && existing.isError ? <ErrorState error={existing.error} onRetry={retryExisting} />
          : customer ? <div className="row between">
              <div className="alert ok grow row" style={{ alignItems: 'center', gap: 6, margin: 0 }}>
                {customer.customer_code && <span className="badge b-blue" style={{ fontFamily: 'monospace' }}>{customer.customer_code}</span>}
                <span>{customer.name}</span>
              </div>
              <button className="btn sm ghost" onClick={clear}>{t('تغيير')}</button>
            </div>
          : (pre.isPending || (existingId && existing.isPending)) ? <SkeletonList n={1} />
          : <div className="col gap-2">
              <div className="alert warn row" style={{ alignItems: 'center', gap: 6, margin: 0 }}>
                <span>{t('تعذر العثور على بيانات العميل تلقائياً. يمكنك اختيار العميل من القائمة أدناه.')}</span>
              </div>
              <CustomerPicker value={picked} onChange={setPicked} />
            </div>}
        {fallbackCustId && pre.isError && <ErrorState error={pre.error} onRetry={retryPre} />}
        {customer && <NavigateButton c={customer} />}

        {/* Geofence Radar / Status Widget */}
        {customer && check && (
          <div className="col" style={{ gap: 8, marginTop: 4 }}>
            {check.distance_m == null ? (
              <div className="alert warn col" style={{ gap: 8, margin: 0 }}>
                <div className="row" style={{ alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={18} />
                  <span>{t('هذا العميل ليس لديه إحداثيات GPS مسجلة في النظام.')}</span>
                </div>
                {here && (
                  <button
                    type="button"
                    className="btn sm ghost"
                    style={{ width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    onClick={() => handleUpdateCustomerGPS(customer)}
                  >
                    <MapPin size={14} />
                    <span>{t('حفظ موقعي الحالي كإحداثيات رسمية للمنفذ')}</span>
                  </button>
                )}
              </div>
            ) : check.on_beat ? (
              <div className="alert ok row" style={{ alignItems: 'center', gap: 8, margin: 0 }} role="status">
                <ShieldCheck size={20} />
                <div>
                  <strong>{t('أنت الآن داخل نطاق المتجر ({d} م من {r} م)', { d: num(check.distance_m), r: num(s.geofence_radius_m) })}</strong>
                </div>
              </div>
            ) : (
              <div className="alert warn col" style={{ gap: 8, margin: 0 }} role="status">
                <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={20} />
                  <div>
                    <strong>{t('أنت خارج نطاق المتجر ({d} م - المسموح {r} م)', { d: num(check.distance_m), r: num(s.geofence_radius_m) })}</strong>
                    <div style={{ fontSize: 13, marginTop: 2, color: 'var(--color-danger, #ef4444)', fontWeight: 600 }}>
                      {t('أنت على بعد {d} م خارج النطاق', { d: num(check.distance_m - s.geofence_radius_m) })}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {customer.latitude != null && customer.longitude != null && (
                    <a
                      className="btn sm ghost"
                      href={mapsDirectionsUrl(customer.latitude, customer.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Compass size={14} />
                      <span>{t('ملاحة خرائط Google')}</span>
                    </a>
                  )}
                  {here && (
                    <button
                      type="button"
                      className="btn sm ghost"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => handleUpdateCustomerGPS(customer)}
                    >
                      <MapPin size={14} />
                      <span>{t('تحديث موقع المنفذ لموقعي الحالي')}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <label className="f">{t('ملاحظات (اختياري)')}<textarea className="input" rows={3} value={notes} onChange={onNotes} data-testid="input-notes" /></label>
      <button className="btn success block" disabled={!customer || !here || gps.isMock || m.isPending} onClick={submit} data-testid="button-start-visit">
        {m.isPending ? t('جاري الحفظ...') : t('تسجيل الوصول')}</button>
    </> : <>
      {here && <NearestCustomers gps={here} busy={m.isPending} onLog={logNearest} />}
      <div className="card col"><span className="title">{t('أو ابحث عن عميل بالاسم')}</span>
        <CustomerPicker value={picked} onChange={setPicked} /></div>
    </>}

    {oorPending && (
      <div role="dialog" aria-modal="true" aria-labelledby="oor-title"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overscrollBehavior: 'contain' }}>
        <div className="card col" style={{ maxWidth: 440, width: '100%', gap: 14 }}>
          <div className="row" style={{ alignItems: 'center', gap: 8, color: 'var(--color-danger, #ef4444)' }}>
            <AlertTriangle size={22} />
            <strong id="oor-title" style={{ fontSize: 16 }}>{t('تسجيل زيارة خارج النطاق (OOR)')}</strong>
          </div>
          <div className="alert warn" style={{ margin: 0, fontSize: 13 }}>
            {geoText(oorPending.g, s.geofence_radius_m)}
          </div>
          <label className="f" style={{ gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t('سبب الاستثناء الجغرافي')} *</span>
            <select
              className="input"
              value={oorReason}
              onChange={(e) => setOorReason(e.target.value)}
              style={{ minHeight: 40 }}
            >
              {OOR_REASONS.map((r) => (
                <option key={r} value={r}>{t(r)}</option>
              ))}
            </select>
          </label>
          <p style={{ margin: 0, color: 'var(--color-muted, #6b7280)', fontSize: 13 }}>
            {t('سيتم تسجيل الزيارة كزيارة خارج خط السير (OOR). هل تريد المتابعة؟')}
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost grow" onClick={cancelOor} data-testid="btn-oor-cancel">{t('إلغاء')}</button>
            <button className="btn danger grow" onClick={confirmOor} data-testid="btn-oor-confirm"
              disabled={m.isPending}>{t('تسجيل كـ OOR')}</button>
          </div>
        </div>
      </div>
    )}
  </div>;
}

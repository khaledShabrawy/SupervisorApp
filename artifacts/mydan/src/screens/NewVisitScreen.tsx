import { memo, useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { useInput, useRefetch } from './shared';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, LocateFixed, MapPin, Play, ShieldCheck, Store } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useCreateVisit, useLocatedCustomers, useVisitToStart } from '@/lib/data';
import { useCustomerById } from '@/lib/screen-data';
import { geofence, mapsDirectionsUrl, nearestCustomers, NEAREST_LIMITS, type NearestLimit } from '@/lib/visit-geo';
import { ErrorState, SkeletonList } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import { CustomerPicker } from '@/components/CustomerPicker';
import { PageTitle } from '@/components/Layout';
import { num } from '@/lib/format';
import type { Customer } from '@/types/database';
import { t } from '@/i18n';

type Gps = { latitude: number; longitude: number };
type Ranked = Customer & { distance_km: number };

function geoText(g: ReturnType<typeof geofence>, radius: number) {
  if (g.distance_m == null) return t('هذا العميل بلا إحداثيات؛ ستُسجّل الزيارة خارج خط السير.');
  return g.on_beat ? t('داخل نطاق العميل ({d} م من {r} م)', { d: num(g.distance_m), r: num(radius) })
    : t('خارج نطاق العميل: {d} م (المسموح {r} م)', { d: num(g.distance_m), r: num(radius) });
}

/** Field reps sometimes must log a visit away from the pin (wrong pin, closed shop); it is allowed but flagged off-route. */
function confirmOffRoute(g: ReturnType<typeof geofence>, radius: number) {
  return g.on_beat || window.confirm(`${geoText(g, radius)}\n${t('سيتم تسجيل الزيارة كزيارة خارج خط السير (OOR). متابعة؟')}`);
}

const NavigateButton = memo(function NavigateButton({ c }: { c: Pick<Customer, 'latitude' | 'longitude' | 'name'> }) {
  if (c.latitude == null || c.longitude == null) return null;
  return <a className="btn sm ghost" href={mapsDirectionsUrl(c.latitude, c.longitude)} target="_blank" rel="noopener noreferrer"
    aria-label={t('التوجيه إلى {name} على خرائط جوجل', { name: c.name })} data-testid="link-navigate">{t('التوجيه 🗺️')}</a>;
});

const NearCard = memo(function NearCard({ c, radius, busy, onLog }: { c: Ranked; radius: number; busy: boolean; onLog: (c: Ranked) => void }) {
  const inRange = c.distance_km * 1000 <= radius;
  const log = useCallback(() => onLog(c), [onLog, c]);
  return <div className="card col" data-testid={`card-near-${c.id}`}>
    <div className="row between">
      <div className="grow"><div className="title">{c.name}</div>{c.address && <div className="muted">{c.address}</div>}</div>
      <span className={`badge ${inRange ? 'b-green' : 'b-gray'}`} title={inRange ? t('داخل نطاق الزيارة') : t('خارج نطاق الزيارة')}>{t('{d} كم', { d: c.distance_km.toFixed(2) })}</span>
    </div>
    <div className="row" style={{ flexWrap: 'wrap' }}>
      <button className="btn sm success grow" disabled={busy} onClick={log} data-testid={`button-log-${c.id}`}><Play size={18} /> {t('تسجيل زيارة')}</button>
      <NavigateButton c={c} />
    </div>
  </div>;
});

function NearestCustomers({ gps, busy, onLog }: { gps: Gps; busy: boolean; onLog: (c: Ranked) => void }) {
  const s = useAppSettings(); const q = useLocatedCustomers(); const retry = useRefetch(q.refetch);
  const [limit, setLimit] = useState<NearestLimit>(5);
  const onLimit = useCallback((e: ChangeEvent<HTMLSelectElement>) =>
    setLimit(e.target.value === 'all' ? 'all' : Number(e.target.value) as NearestLimit), []);
  const ranked = useMemo(() => q.data ? nearestCustomers(q.data, gps.latitude, gps.longitude, limit) : [], [q.data, gps, limit]);
  return <div className="col">
    <div className="row between">
      <span className="title"><MapPin size={18} style={{ display: 'inline', marginInlineEnd: 6 }} />{t('العملاء الأقرب إليك')}</span>
      <label className="row muted" style={{ gap: 6 }}>{t('عرض')}
        <select className="input" style={{ width: 'auto', minHeight: 40 }} value={String(limit)} onChange={onLimit} data-testid="select-nearest-limit">
          {NEAREST_LIMITS.map((n) => <option key={n} value={n}>{n === 'all' ? t('الكل') : num(n)}</option>)}
        </select>
      </label>
    </div>
    {q.isPending ? <SkeletonList n={3} /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : ranked.length === 0 ? <EmptyState icon={<Store />} title={t('لا يوجد عملاء بإحداثيات')} text={t('أضف موقع العملاء من شاشة العملاء أو ابحث بالاسم بالأسفل.')} />
      : ranked.map((c) => <NearCard key={c.id} c={c} radius={s.geofence_radius_m} busy={busy} onLog={onLog} />)}
  </div>;
}

export default function NewVisitScreen() {
  const nav = useNavigate(); const { supervisor } = useAuth(); const s = useAppSettings();
  const gps = useGeolocation(); const m = useCreateVisit();
  const [params] = useSearchParams();
  const existingId = params.get('visit'); const preId = existingId ? null : params.get('customer');
  const existing = useVisitToStart(existingId); const pre = useCustomerById(preId);
  const [picked, setPicked] = useState<Customer | null>(null);
  const customer = existingId ? existing.data?.customers ?? null : picked ?? pre.data ?? null;
  const [editedNotes, setNotes] = useState<string | null>(null);
  const notes = editedNotes ?? existing.data?.notes ?? '';
  const here = useMemo<Gps | null>(() => gps.latitude != null && gps.longitude != null
    ? { latitude: gps.latitude, longitude: gps.longitude } : null, [gps.latitude, gps.longitude]);

  const checkIn = useCallback((c: Customer, note: string) => {
    if (!supervisor || !here) return;
    const g = geofence(here, c, s.geofence_radius_m);
    if (!confirmOffRoute(g, s.geofence_radius_m)) return;
    m.mutate({ customer_id: c.id, latitude: here.latitude, longitude: here.longitude, notes: note,
      geo_distance: g.distance_m, on_beat: g.on_beat, ...(existingId ? { existingId } : {}) },
    { onSuccess: (visit) => nav(`/visits/${visit.id}`, { replace: true }) });
  }, [supervisor, here, s.geofence_radius_m, m, existingId, nav]);
  const logNearest = useCallback((c: Ranked) => checkIn(c, ''), [checkIn]);
  const submit = useCallback(() => { if (customer) checkIn(customer, notes); }, [customer, notes, checkIn]);

  const check = customer && here ? geofence(here, customer, s.geofence_radius_m) : null;
  const onNotes = useInput(setNotes);
  const retryExisting = useRefetch(existing.refetch); const retryPre = useRefetch(pre.refetch);
  const back = useCallback(() => nav('/visits'), [nav]);
  const clear = useCallback(() => setPicked(null), []);
  const focused = !!existingId || !!preId || !!customer;

  return <div className="page" aria-label={s.app_name} data-role={supervisor?.role}>
    <PageTitle action={<button className="icon-btn" aria-label={t('رجوع إلى الزيارات')} onClick={back}><ArrowRight className="flip-ltr" /></button>}>{existingId ? t('بدء زيارة معلقة') : t('زيارة جديدة')}</PageTitle>

    <div className="card col">
      <span className="title">{t('موقعك')}</span>
      {gps.loading ? <div className="alert warn" role="status">{t('جاري تحديد موقعك...')}</div>
        : here ? <div className="muted">{t('تم تحديد موقعك · دقة GPS {d} م', { d: num(Math.round(gps.accuracy ?? 0)) })}</div>
        : <div className="alert err" role="alert">{gps.error}
            <div style={{ fontWeight: 400, marginTop: 4 }}>{t('لا يمكن تسجيل زيارة بدون الموقع. فعّل GPS واسمح للتطبيق بالوصول للموقع من إعدادات المتصفح أو الهاتف.')}</div></div>}
      {!gps.loading && <button className="btn ghost" onClick={gps.retry}><LocateFixed /> {t('إعادة تحديد الموقع')}</button>}
    </div>

    {focused ? <>
      <div className="card col"><span className="title">{t('العميل')}</span>
        {existingId ? existing.isPending ? <SkeletonList n={1} />
          : existing.isError ? <ErrorState error={existing.error} onRetry={retryExisting} />
          : <div>{customer?.name ?? t('تعذر العثور على بيانات العميل')}</div>
          : customer ? <div className="row between"><div className="alert ok grow">{customer.name}</div>
              {picked && <button className="btn sm ghost" onClick={clear}>{t('تغيير')}</button>}</div>
          : pre.isPending ? <SkeletonList n={1} /> : null}
        {preId && pre.isError && <ErrorState error={pre.error} onRetry={retryPre} />}
        {customer && <NavigateButton c={customer} />}
        {check && <div className={`alert row ${check.on_beat ? 'ok' : 'warn'}`} role="status">{check.on_beat && <ShieldCheck />}<span>{geoText(check, s.geofence_radius_m)}</span></div>}
      </div>
      <label className="f">{t('ملاحظات (اختياري)')}<textarea className="input" rows={3} value={notes} onChange={onNotes} data-testid="input-notes" /></label>
      <button className="btn success block" disabled={!customer || !here || m.isPending} onClick={submit} data-testid="button-start-visit">
        {m.isPending ? t('جاري الحفظ...') : t('تسجيل الوصول')}</button>
    </> : <>
      {here && <NearestCustomers gps={here} busy={m.isPending} onLog={logNearest} />}
      <div className="card col"><span className="title">{t('أو ابحث عن عميل بالاسم')}</span>
        <CustomerPicker value={picked} onChange={setPicked} /></div>
    </>}
  </div>;
}

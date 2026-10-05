import { useCallback, useMemo, useState } from 'react';
import { useInput, useRefetch } from './shared';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, LocateFixed, ShieldCheck } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { distanceMeters } from '@/lib/policy';
import { useCreateVisit, useVisitToStart } from '@/lib/data';
import { useCustomerById } from '@/lib/screen-data';
import { ErrorState, SkeletonList } from '@/components/States';
import { CustomerPicker } from '@/components/CustomerPicker';
import { PageTitle } from '@/components/Layout';
import { num } from '@/lib/format';
import type { Customer } from '@/types/database';

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
  const check = useMemo(() => {
    if (!customer) return null;
    if (gps.latitude == null || gps.longitude == null) return { ok: false, far: false, text: gps.error ?? 'لم يتم تحديد موقعك بعد.' };
    if (customer.latitude == null || customer.longitude == null) return { ok: false, far: false, text: 'هذا العميل بلا إحداثيات. عدّل بيانات العميل وأضف موقعه أولا.' };
    const d = distanceMeters(gps.latitude, gps.longitude, customer.latitude, customer.longitude);
    return d <= s.geofence_radius_m ? { ok: true, far: false, text: `أنت داخل نطاق العميل (${num(Math.round(d))} م من ${num(s.geofence_radius_m)} م)` }
      : { ok: false, far: true, text: `أنت بعيد عن موقع العميل (${num(Math.round(d))}م)` };
  }, [customer, gps, s.geofence_radius_m]);
  const submit = useCallback(() => {
    if (!supervisor || !customer || !check?.ok || gps.latitude == null || gps.longitude == null) return;
    m.mutate({ customer_id: customer.id, latitude: gps.latitude, longitude: gps.longitude, notes, ...(existingId ? { existingId } : {}) },
      { onSuccess: () => nav('/visits', { replace: true }) });
  }, [supervisor, customer, check, gps.latitude, gps.longitude, m, notes, existingId, nav]);
  const onNotes = useInput(setNotes);
  const retryExisting = useRefetch(existing.refetch); const retryPre = useRefetch(pre.refetch);
  const back = useCallback(() => nav('/visits'), [nav]);
  return <div className="page" aria-label={s.app_name} data-role={supervisor?.role}>
    <PageTitle action={<button className="icon-btn" aria-label="رجوع إلى الزيارات" onClick={back}><ArrowRight /></button>}>{existingId ? 'بدء زيارة معلقة' : 'زيارة جديدة'}</PageTitle>
    <div className="card col"><span className="title">العميل</span>
      {existingId ? existing.isPending ? <SkeletonList n={1} />
        : existing.isError ? <ErrorState error={existing.error} onRetry={retryExisting} />
        : <div>{customer?.name ?? 'تعذر العثور على بيانات العميل'}</div>
        : <>
          {customer && <div className="alert ok">{customer.name}</div>}
          {preId && pre.isError && <ErrorState error={pre.error} onRetry={retryPre} />}
          <CustomerPicker value={customer} onChange={setPicked} /></>}
    </div>
    <div className="card col">
      <span className="title">الموقع</span>
      {gps.loading ? <div className="alert warn">جاري تحديد موقعك...</div> : gps.latitude != null
        ? <div className="muted">دقة GPS: {num(Math.round(gps.accuracy ?? 0))} م</div> : <div className="alert err">{gps.error}</div>}
      {check && <div className={`alert row ${check.ok ? 'ok' : check.far ? 'warn' : 'err'}`} role="status">{check.ok && <ShieldCheck />}<span>{check.text}</span></div>}
      {!gps.loading && <button className="btn ghost" onClick={gps.retry}><LocateFixed /> إعادة تحديد الموقع</button>}
    </div>
    <label className="f">ملاحظات (اختياري)<textarea className="input" rows={3} value={notes} onChange={onNotes} data-testid="input-notes" /></label>
    <button className="btn success block" disabled={!customer || !check?.ok || m.isPending} onClick={submit} data-testid="button-start-visit">{m.isPending ? 'جاري الحفظ...' : 'تسجيل الوصول'}</button>
  </div>;
}

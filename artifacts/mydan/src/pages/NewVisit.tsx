import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LocateFixed, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { distanceMeters } from '@/lib/policy';
import { useCreateVisit, useVisitToStart } from '@/lib/data';
import { ErrorState, SkeletonList } from '@/components/States';
import { CustomerPicker } from '@/components/CustomerPicker';
import { PageTitle } from '@/components/Layout';
import { num } from '@/lib/format';
import type { Customer } from '@/types/database';

export default function NewVisit() {
  const nav = useNavigate(); const s = useAppSettings(); const gps = useGeolocation(); const m = useCreateVisit();
  const [params] = useSearchParams();
  const existingId = params.get('visit');
  const existing = useVisitToStart(existingId);
  const [selectedCustomer, setCustomer] = useState<Customer | null>(null);
  const customer = existingId ? existing.data?.customers ?? null : selectedCustomer;
  const [editedNotes, setNotes] = useState<string | null>(null);
  const notes = editedNotes ?? existing.data?.notes ?? '';
  const check = useMemo(() => {
    if (!customer) return null;
    if (gps.latitude == null || gps.longitude == null) return { ok: false, text: gps.error ?? 'لم يتم تحديد موقعك بعد.' };
    if (customer.latitude == null || customer.longitude == null) return { ok: false, text: 'هذا العميل بلا إحداثيات. عدّل بيانات العميل وأضف موقعه أولا.' };
    const d = distanceMeters(gps.latitude, gps.longitude, customer.latitude, customer.longitude);
    return d <= s.geofence_radius_m ? { ok: true, text: `أنت داخل نطاق العميل (${num(Math.round(d))} م من ${num(s.geofence_radius_m)} م)` }
      : { ok: false, text: `أنت خارج النطاق: ${num(Math.round(d))} م، والمسموح ${num(s.geofence_radius_m)} م` };
  }, [customer, gps, s.geofence_radius_m]);
  const submit = () => {
    if (!customer || !check?.ok || gps.latitude == null || gps.longitude == null) return;
    m.mutate({ customer_id: customer.id, latitude: gps.latitude, longitude: gps.longitude, notes,
      ...(existingId ? { existingId } : {}) }, { onSuccess: () => nav('/visits', { replace: true }) });
  };
  return <div className="page">
    <PageTitle>{existingId ? 'بدء الزيارة المعلقة' : 'زيارة جديدة'}</PageTitle>
    <div className="card col"><span className="title">1. العميل</span>
      {existingId ? existing.isPending ? <SkeletonList n={1} />
        : existing.isError ? <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
        : <div>{customer?.name ?? 'تعذر العثور على بيانات العميل'}</div>
        : <CustomerPicker value={customer} onChange={setCustomer} />}</div>
    <div className="card col">
      <span className="title">2. التحقق من الموقع</span>
      {gps.loading ? <div className="skel" style={{ height: 44 }} /> : gps.latitude != null
        ? <div className="muted">دقة GPS: {num(Math.round(gps.accuracy ?? 0))} م</div>
        : <div className="alert err">{gps.error}</div>}
      {check && <div className={`alert row ${check.ok ? 'ok' : 'err'}`} role="status">{check.ok ? <ShieldCheck /> : <ShieldAlert />}<span>{check.text}</span></div>}
      {gps.latitude == null && !gps.loading && <button className="btn ghost" onClick={() => window.location.reload()}><LocateFixed /> إعادة تحديد الموقع</button>}
    </div>
    <label className="f">ملاحظات (اختياري)<textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-notes" /></label>
    <button className="btn block" disabled={!customer || !check?.ok || m.isPending} onClick={submit} data-testid="button-start-visit">{m.isPending ? 'جاري الحفظ...' : 'بدء الزيارة'}</button>
  </div>;
}

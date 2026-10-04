import { useState } from 'react';
import { LocateFixed, MapPin, Pencil, Plus, Search, Store } from '@/components/Icons';
import { useCustomers, useSaveCustomer } from '@/lib/data';
import { PageTitle } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import EmptyState from '@/components/EmptyState';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import { notify } from '@/lib/toast';
import type { Customer } from '@/types/database';

function Form({ c, onClose }: { c: Customer | null; onClose: () => void }) {
  const m = useSaveCustomer();
  const [name, setName] = useState(c?.name ?? ''); const [type, setType] = useState(c?.customer_type ?? '');
  const [address, setAddress] = useState(c?.address ?? ''); const [active, setActive] = useState(c?.is_active ?? true);
  const [lat, setLat] = useState(c?.latitude != null ? String(c.latitude) : ''); const [lng, setLng] = useState(c?.longitude != null ? String(c.longitude) : '');
  const [locating, setLocating] = useState(false);
  const locate = () => {
    if (!navigator.geolocation) return notify('تحديد الموقع غير مدعوم.', 'error');
    setLocating(true);
    navigator.geolocation.getCurrentPosition((p) => { setLat(String(p.coords.latitude)); setLng(String(p.coords.longitude)); setLocating(false); },
      () => { setLocating(false); notify('تعذر تحديد الموقع. تحقق من الإذن وGPS.', 'error'); }, { enableHighAccuracy: true, timeout: 15000 });
  };
  const la = lat === '' ? null : Number(lat), lo = lng === '' ? null : Number(lng);
  const badCoord = (la !== null && (!Number.isFinite(la) || Math.abs(la) > 90)) || (lo !== null && (!Number.isFinite(lo) || Math.abs(lo) > 180)) || ((la === null) !== (lo === null));
  const valid = name.trim() && type.trim() && address.trim() && !badCoord;
  return <Sheet title={c ? 'تعديل العميل' : 'عميل جديد'} onClose={onClose}><div className="col">
    <label className="f">اسم العميل<input className="input" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-name" /></label>
    <label className="f">النوع (بقالة، سوبرماركت...)<input className="input" value={type} onChange={(e) => setType(e.target.value)} data-testid="input-type" /></label>
    <label className="f">العنوان<input className="input" value={address} onChange={(e) => setAddress(e.target.value)} data-testid="input-address" /></label>
    <div className="row">
      <label className="f grow">خط العرض<input className="input" dir="ltr" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
      <label className="f grow">خط الطول<input className="input" dir="ltr" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} /></label>
    </div>
    <button type="button" className="btn ghost" disabled={locating} onClick={locate}><LocateFixed /> {locating ? 'جاري التحديد...' : 'استخدام موقعي الحالي'}</button>
    {badCoord && <div className="alert err">الإحداثيات غير صالحة. أدخل القيمتين معا أو اتركهما فارغتين.</div>}
    {c && <label className="row" style={{ minHeight: 44 }}><input type="checkbox" style={{ width: 24, height: 24 }} checked={active} onChange={(e) => setActive(e.target.checked)} /> عميل نشط</label>}
    <button className="btn" disabled={!valid || m.isPending} data-testid="button-save-customer"
      onClick={() => m.mutate({ id: c?.id, input: { name: name.trim(), customer_type: type.trim(), address: address.trim(), latitude: la, longitude: lo, is_active: active } }, { onSuccess: onClose })}>
      {m.isPending ? 'جاري الحفظ...' : 'حفظ'}</button>
  </div></Sheet>;
}
export default function Customers() {
  const [term, setTerm] = useState(''); const q = useCustomers(term);
  const [edit, setEdit] = useState<Customer | 'new' | null>(null);
  return <div className="page">
    <PageTitle action={<button className="btn sm" data-testid="button-new-customer" onClick={() => setEdit('new')}><Plus size={18} /> عميل</button>}>العملاء</PageTitle>
    <div style={{ position: 'relative' }}>
      <Search size={18} style={{ position: 'absolute', insetInlineStart: 12, top: 15, color: 'var(--muted)' }} />
      <input className="input" style={{ paddingInlineStart: 38 }} placeholder="بحث بالاسم أو العنوان" value={term} onChange={(e) => setTerm(e.target.value)} data-testid="input-search" />
    </div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      : q.items.length === 0 ? <EmptyState icon={<Store />} title={term ? 'لا نتائج للبحث' : 'لا يوجد عملاء'} action={term ? undefined : { label: 'إضافة عميل', onClick: () => setEdit('new') }} />
      : <>{q.items.map((c) => <div key={c.id} className="card row" data-testid={`card-customer-${c.id}`}>
        <div className="grow"><div className="title">{c.name}{!c.is_active && <span className="badge b-gray" style={{ marginInlineStart: 8 }}>غير نشط</span>}</div>
          <div className="muted">{c.customer_type}</div><div className="muted row" style={{ gap: 4 }}><MapPin size={14} />{c.address}</div>
          {c.latitude == null && <div className="muted" style={{ color: 'var(--warn)' }}>بدون موقع GPS</div>}</div>
        <button className="icon-btn" aria-label={`تعديل ${c.name}`} onClick={() => setEdit(c)}><Pencil /></button>
      </div>)}<LoadMore q={q} /></>}
    {edit && <Form c={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
  </div>;
}

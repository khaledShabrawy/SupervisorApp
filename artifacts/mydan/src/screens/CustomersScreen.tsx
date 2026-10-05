import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocateFixed, MapPin, Pencil, Plus, Search, Store } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useSaveCustomer, type VisitRow } from '@/lib/data';
import { useCustomerCards, useCustomerHistory, type CustomerCardRow } from '@/lib/screen-data';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { customerTypeLabel, relativeArabicTime } from '@/lib/screen-helpers';
import { PageTitle } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import { notify } from '@/lib/toast';
import { fmtDate } from '@/lib/format';
import { Chip, useCheck, useInput, useMinuteTick, useRefetch } from './shared';
import type { Customer } from '@/types/database';

function Form({ c, onClose }: { c: Customer | null; onClose: () => void }) {
  const m = useSaveCustomer();
  const [name, setName] = useState(c?.name ?? ''); const [type, setType] = useState(c?.customer_type ?? '');
  const [address, setAddress] = useState(c?.address ?? ''); const [active, setActive] = useState(c?.is_active ?? true);
  const [lat, setLat] = useState(c?.latitude != null ? String(c.latitude) : ''); const [lng, setLng] = useState(c?.longitude != null ? String(c.longitude) : '');
  const [locating, setLocating] = useState(false);
  const onName = useInput(setName); const onType = useInput(setType); const onAddr = useInput(setAddress); const onLat = useInput(setLat); const onLng = useInput(setLng); const onActive = useCheck(setActive);
  const locate = useCallback(() => {
    if (!navigator.geolocation) return notify('تحديد الموقع غير مدعوم.', 'error');
    setLocating(true);
    navigator.geolocation.getCurrentPosition((p) => { setLat(String(p.coords.latitude)); setLng(String(p.coords.longitude)); setLocating(false); },
      () => { setLocating(false); notify('تعذر تحديد الموقع. تحقق من الإذن وGPS.', 'error'); }, { enableHighAccuracy: true, timeout: 15000 });
  }, []);
  const la = lat === '' ? null : Number(lat), lo = lng === '' ? null : Number(lng);
  const bad = (la !== null && (!Number.isFinite(la) || Math.abs(la) > 90)) || (lo !== null && (!Number.isFinite(lo) || Math.abs(lo) > 180)) || ((la === null) !== (lo === null));
  const valid = name.trim() && type.trim() && address.trim() && !bad;
  const save = useCallback(() => m.mutate({ id: c?.id, input: { name: name.trim(), type: type.trim(), address: address.trim(), latitude: la, longitude: lo, is_active: active } }, { onSuccess: onClose }), [m, c, name, type, address, la, lo, active, onClose]);
  return <Sheet title={c ? 'تعديل العميل' : 'عميل جديد'} onClose={onClose}><div className="col">
    <label className="f">اسم العميل<input className="input" value={name} onChange={onName} data-testid="input-name" /></label>
    <label className="f">النوع (بقالة، سوبرماركت...)<input className="input" value={type} onChange={onType} data-testid="input-type" /></label>
    <label className="f">العنوان<input className="input" value={address} onChange={onAddr} data-testid="input-address" /></label>
    <div className="row">
      <label className="f grow">خط العرض<input className="input" dir="ltr" inputMode="decimal" value={lat} onChange={onLat} /></label>
      <label className="f grow">خط الطول<input className="input" dir="ltr" inputMode="decimal" value={lng} onChange={onLng} /></label>
    </div>
    <button type="button" className="btn ghost" disabled={locating} onClick={locate}><LocateFixed /> {locating ? 'جاري التحديد...' : 'استخدام موقعي الحالي'}</button>
    {bad && <div className="alert err">الإحداثيات غير صالحة. أدخل القيمتين معا أو اتركهما فارغتين.</div>}
    {c && <label className="row" style={{ minHeight: 44 }}><input type="checkbox" style={{ width: 24, height: 24 }} checked={active} onChange={onActive} /> عميل نشط</label>}
    <button className="btn" disabled={!valid || m.isPending} data-testid="button-save-customer" onClick={save}>{m.isPending ? 'جاري الحفظ...' : 'حفظ'}</button>
  </div></Sheet>;
}
const HistoryRow = memo(function HistoryRow({ v }: { v: VisitRow }) {
  return <div className="s-row"><div className="grow">{fmtDate(v.visit_date)}</div><StatusBadge status={v.status} /></div>;
});
function Detail({ c, onEdit, onClose }: { c: CustomerCardRow; onEdit: (c: Customer) => void; onClose: () => void }) {
  const nav = useNavigate(); const h = useCustomerHistory(c.id); const retry = useRefetch(h.refetch);
  const visit = useCallback(() => nav(`/visits/new?customer=${c.id}`), [nav, c.id]); const edit = useCallback(() => onEdit(c), [onEdit, c]);
  return <Sheet title={c.name} onClose={onClose}><div className="col">
    <div className="muted">{customerTypeLabel(c.customer_type)} · {c.address}</div>
    <div className="row">
      <button className="btn sm grow" onClick={visit}>زيارة جديدة</button>
      <button className="btn sm ghost grow" onClick={edit}><Pencil size={16} /> تعديل</button>
    </div>
    <div className="title">سجل الزيارات</div>
    {h.isPending ? <SkeletonList n={2} /> : h.isError ? <ErrorState error={h.error} onRetry={retry} />
      : h.items.length === 0 ? <div className="muted">لا توجد زيارات سابقة.</div>
      : <>{h.items.map((v) => <HistoryRow key={v.id} v={v} />)}<LoadMore q={h} /></>}
  </div></Sheet>;
}
const Card = memo(function Card({ c, now, onOpen }: { c: CustomerCardRow; now: number; onOpen: (c: CustomerCardRow) => void }) {
  const open = useCallback(() => onOpen(c), [onOpen, c]);
  return <button className="s-row" onClick={open} data-testid={`card-customer-${c.id}`}>
    <div className="grow"><div className="title">{c.name}{!c.is_active && <span className="badge b-gray" style={{ marginInlineStart: 8 }}>غير نشط</span>}</div>
      <div className="muted">{customerTypeLabel(c.customer_type)}</div><div className="muted row" style={{ gap: 4 }}><MapPin size={14} />{c.address}</div>
      <div className="muted" style={{ fontSize: 13 }}>آخر زيارة: {c.last_visit ? relativeArabicTime(c.last_visit, now) : 'لا توجد'}</div></div>
  </button>;
});
const CHIPS: [string, string][] = [['all', 'الكل'], ['بقالة', 'بقالة'], ['سوبر ماركت', 'سوبر ماركت'], ['هايبر ماركت', 'هايبر ماركت'], ['كافيه', 'كافيه'], ['أخرى', 'أخرى']];

export default function CustomersScreen({ embedded = false }: { embedded?: boolean }) {
  const { supervisor } = useAuth(); const settings = useAppSettings(); const now = useMinuteTick();
  const [term, setTerm] = useState(''); const [type, setType] = useState('all');
  const debounced = useDebouncedValue(term, 300);
  const q = useCustomerCards(debounced, type);
  const [edit, setEdit] = useState<Customer | 'new' | null>(null); const [detail, setDetail] = useState<CustomerCardRow | null>(null);
  const onTerm = useInput(setTerm); const onType = useCallback((v: string) => setType(v), []);
  const retry = useRefetch(q.refetch);
  const openDetail = useCallback((c: CustomerCardRow) => setDetail(c), []);
  const startEdit = useCallback((c: Customer) => { setDetail(null); setEdit(c); }, []);
  const newOne = useCallback(() => setEdit('new'), []);
  const closeEdit = useCallback(() => setEdit(null), []); const closeDetail = useCallback(() => setDetail(null), []);
  const list = useMemo(() => q.items, [q.items]);
  const filtered = !!term || type !== 'all';
  return <div className={embedded ? 'col' : 'page'} aria-label={settings.app_name} data-role={supervisor?.role}>
    {!embedded && <PageTitle action={<button className="btn sm" data-testid="button-new-customer" onClick={newOne}><Plus size={18} /> عميل</button>}>العملاء</PageTitle>}
    {embedded && <button className="btn sm" data-testid="button-new-customer" onClick={newOne}><Plus size={18} /> عميل</button>}
    <div style={{ position: 'relative' }}>
      <Search size={18} style={{ position: 'absolute', insetInlineStart: 12, top: 15, color: 'var(--muted)' }} />
      <input className="input" style={{ paddingInlineStart: 38 }} placeholder="بحث بالاسم أو العنوان" value={term} onChange={onTerm} data-testid="input-search" />
    </div>
    <div className="tabs">{CHIPS.map(([k, l]) => <Chip key={k} value={k} label={l} active={type === k} onSelect={onType} />)}</div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : list.length === 0 ? <EmptyState icon={<Store />} title={filtered ? 'لا نتائج' : 'لا يوجد عملاء'} action={filtered ? undefined : { label: 'إضافة عميل', onClick: newOne }} />
      : <>{list.map((c) => <Card key={c.id} c={c} now={now} onOpen={openDetail} />)}<LoadMore q={q} /></>}
    {detail && <Detail c={detail} onEdit={startEdit} onClose={closeDetail} />}
    {edit && <Form c={edit === 'new' ? null : edit} onClose={closeEdit} />}
  </div>;
}

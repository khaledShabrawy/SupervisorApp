import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useScope } from '@/lib/data';
import { Bell, MapPin, Package, Plus, X } from '@/components/Icons';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useCustomerSearch, useSupervisors } from '@/lib/data';
import { useAdminProducts, useSaveSettings, type CatalogProduct } from '@/lib/screen-data';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  ASSET_STATUS, useAssets, useBranches, useBroadcast, useSaveAsset, useSaveBranch, useSaveProduct, useUploadLogo,
  type AssetRow, type Branch,
} from '@/lib/admin-data';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import CustomersScreen from '@/screens/CustomersScreen';
import { AssetTypes, SettingsForm, TargetForm } from '@/screens/AdminPanel';
import { useInput, useRefetch } from '@/screens/shared';
import { t } from '@/i18n';

function Modal({ title, onClose, onSubmit, children }: { title: string; onClose: () => void; onSubmit: (e: FormEvent) => void; children: React.ReactNode }) {
  return <div className="adm-modal-bg" onClick={onClose}>
    <form className="adm-modal col" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
      <div className="row between"><h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        <button type="button" className="icon-btn" aria-label={t('إغلاق')} onClick={onClose}><X /></button></div>
      {children}
    </form>
  </div>;
}
const numOrNull = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/* ---------- Branches ---------- */
function BranchForm({ edit, onClose }: { edit: Branch | null; onClose: () => void }) {
  const m = useSaveBranch(); const sups = useSupervisors();
  const [name, setName] = useState(edit?.name ?? ''); const [region, setRegion] = useState(edit?.region ?? '');
  const [manager, setManager] = useState(edit?.manager_id ?? ''); const [active, setActive] = useState(edit?.is_active ?? true);
  const [lat, setLat] = useState(edit?.latitude?.toString() ?? ''); const [lng, setLng] = useState(edit?.longitude?.toString() ?? '');
  const submit = useCallback((e: FormEvent) => { e.preventDefault();
    m.mutate({ id: edit?.id, name, region, manager_id: manager || null, latitude: numOrNull(lat), longitude: numOrNull(lng), is_active: active }, { onSuccess: onClose });
  }, [m, edit, name, region, manager, lat, lng, active, onClose]);
  return <Modal title={edit ? t('تعديل الفرع') : t('فرع جديد')} onClose={onClose} onSubmit={submit}>
    <label className="f">{t('اسم الفرع *')}<input className="input" required value={name} onChange={useInput(setName)} /></label>
    <label className="f">{t('المنطقة')}<input className="input" value={region} onChange={useInput(setRegion)} /></label>
    <label className="f">{t('مدير الفرع')}<select className="input" value={manager} onChange={useInput(setManager)}>
      <option value="">{t('بدون')}</option>{sups.items.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></label>
    <div className="row"><label className="f grow">{t('خط العرض')}<input className="input" dir="ltr" inputMode="decimal" value={lat} onChange={useInput(setLat)} /></label>
      <label className="f grow">{t('خط الطول')}<input className="input" dir="ltr" inputMode="decimal" value={lng} onChange={useInput(setLng)} /></label></div>
    <label className="row" style={{ minHeight: 44 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 22, height: 22 }} /> {t('فرع نشط')}</label>
    <button className="btn" disabled={m.isPending}>{m.isPending ? t('جاري الحفظ...') : t('حفظ')}</button>
  </Modal>;
}
export function AdminBranches() {
  const q = useBranches(); const sups = useSupervisors(); const retry = useRefetch(q.refetch);
  const [edit, setEdit] = useState<Branch | null | undefined>(undefined);
  const name = (id: string | null) => sups.items.find((s) => s.id === id)?.full_name ?? '—';
  return <>
    <div className="row between"><h2>{t('الفروع')}</h2><button className="btn" onClick={() => setEdit(null)}><Plus size={18} /> {t('فرع جديد')}</button></div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : !q.data.length ? <EmptyState icon={<MapPin />} title={t('لا توجد فروع')} action={{ label: t('إضافة فرع'), onClick: () => setEdit(null) }} />
      : <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr><th>{t('الفرع')}</th><th>{t('المنطقة')}</th><th>{t('المدير')}</th><th>{t('الحالة')}</th><th /></tr></thead>
          <tbody>{q.data.map((b) => <tr key={b.id}><td className="title">{b.name}</td><td>{b.region ?? '—'}</td><td>{name(b.manager_id)}</td>
            <td><span className={`badge ${b.is_active ? 'b-green' : 'b-gray'}`}>{b.is_active ? t('نشط') : t('متوقف')}</span></td>
            <td><button className="btn sm ghost" onClick={() => setEdit(b)}>{t('تعديل')}</button></td></tr>)}</tbody>
        </table></div>}
    {edit !== undefined && <BranchForm edit={edit} onClose={() => setEdit(undefined)} />}
  </>;
}

/* ---------- Customers / Targets (reuse the existing screens) ---------- */
export function AdminCustomers() { return <CustomersScreen />; }
export function AdminTargets() { return <><h2>{t('الأهداف الشهرية')}</h2><div style={{ maxWidth: 560 }}><TargetForm /></div></>; }

/* ---------- Products (catalog only; pricing is out of scope by design) ---------- */
function ProductForm({ edit, onClose }: { edit: CatalogProduct | null; onClose: () => void }) {
  const m = useSaveProduct();
  const [name, setName] = useState(edit?.name ?? ''); const [category, setCategory] = useState(edit?.category ?? '');
  const [sku, setSku] = useState(edit?.sku ?? ''); const [active, setActive] = useState(edit?.is_active ?? true);
  const submit = useCallback((e: FormEvent) => { e.preventDefault();
    m.mutate({ id: edit?.id, name, category, sku, is_active: active }, { onSuccess: onClose }); }, [m, edit, name, category, sku, active, onClose]);
  return <Modal title={edit ? t('تعديل المنتج') : t('منتج جديد')} onClose={onClose} onSubmit={submit}>
    <label className="f">{t('اسم المنتج *')}<input className="input" required value={name} onChange={useInput(setName)} /></label>
    <label className="f">{t('الفئة')}<input className="input" value={category} onChange={useInput(setCategory)} /></label>
    <label className="f">{t('كود SKU')}<input className="input" dir="ltr" value={sku} onChange={useInput(setSku)} /></label>
    <label className="row" style={{ minHeight: 44 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 22, height: 22 }} /> {t('متاح')}</label>
    <button className="btn" disabled={m.isPending}>{m.isPending ? t('جاري الحفظ...') : t('حفظ')}</button>
  </Modal>;
}
export function AdminProducts() {
  const q = useAdminProducts(); const retry = useRefetch(q.refetch);
  const [edit, setEdit] = useState<CatalogProduct | null | undefined>(undefined);
  return <>
    <div className="row between"><h2>{t('المنتجات')}</h2><button className="btn" onClick={() => setEdit(null)}><Plus size={18} /> {t('منتج جديد')}</button></div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : !q.items.length ? <EmptyState icon={<Package />} title={t('لا توجد منتجات')} />
      : <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr><th>{t('المنتج')}</th><th>{t('الفئة')}</th><th>SKU</th><th>{t('الحالة')}</th><th /></tr></thead>
          <tbody>{q.items.map((p) => <tr key={p.id}><td className="title">{p.name}</td><td>{p.category || '—'}</td><td dir="ltr">{p.sku || '—'}</td>
            <td><span className={`badge ${p.is_active ? 'b-green' : 'b-gray'}`}>{p.is_active ? t('متاح') : t('متوقف')}</span></td>
            <td><button className="btn sm ghost" onClick={() => setEdit(p)}>{t('تعديل')}</button></td></tr>)}</tbody>
        </table></div>}
    <LoadMore q={q} />
    {edit !== undefined && <ProductForm edit={edit} onClose={() => setEdit(undefined)} />}
  </>;
}

/* ---------- Assets ---------- */
function AssetForm({ edit, types, onClose }: { edit: AssetRow | null; types: { id: string; name_ar: string; icon: string }[]; onClose: () => void }) {
  const m = useSaveAsset();
  const [code, setCode] = useState(edit?.asset_code ?? ''); const [type, setType] = useState(edit?.asset_type_id ?? types[0]?.id ?? '');
  const [serial, setSerial] = useState(edit?.serial_number ?? ''); const [model, setModel] = useState(edit?.model ?? '');
  const [status, setStatus] = useState(edit?.status ?? 'active'); const [notes, setNotes] = useState(edit?.notes ?? '');
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(edit?.customer_id ? { id: edit.customer_id, name: edit.customers?.name ?? '' } : null);
  const [term, setTerm] = useState(''); const found = useCustomerSearch(useDebouncedValue(term, 300)); const onTerm = useInput(setTerm);
  const submit = useCallback((e: FormEvent) => { e.preventDefault();
    m.mutate({ id: edit?.id, asset_code: code, asset_type_id: type, customer_id: customer?.id ?? '', serial_number: serial, model, status, notes }, { onSuccess: onClose });
  }, [m, edit, code, type, customer, serial, model, status, notes, onClose]);
  return <Modal title={edit ? t('تعديل الأصل') : t('أصل جديد')} onClose={onClose} onSubmit={submit}>
    <label className="f">{t('كود الأصل * (يُطبع كـ QR)')}<input className="input" dir="ltr" required value={code} onChange={useInput(setCode)} data-testid="input-asset-code" /></label>
    <label className="f">{t('النوع *')}<select className="input" required value={type} onChange={useInput(setType)}>
      {types.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name_ar}</option>)}</select></label>
    <label className="f">{t('الحالة')}<select className="input" value={status} onChange={useInput(setStatus)}>
      {Object.entries(ASSET_STATUS).map(([k, [l]]) => <option key={k} value={k}>{t(l)}</option>)}</select></label>
    <div className="row"><label className="f grow">{t('الرقم التسلسلي')}<input className="input" dir="ltr" value={serial} onChange={useInput(setSerial)} /></label>
      <label className="f grow">{t('الموديل')}<input className="input" dir="ltr" value={model} onChange={useInput(setModel)} /></label></div>
    <div className="f"><span>{t('العميل المركّب عنده')}</span>
      {customer ? <div className="row"><span className="alert ok grow">{customer.name}</span><button type="button" className="btn sm ghost" onClick={() => setCustomer(null)}>{t('إزالة')}</button></div>
        : <><input className="input" placeholder={t('ابحث عن عميل...')} value={term} onChange={onTerm} />
          {term && found.data?.slice(0, 5).map((c) => <button key={c.id} type="button" className="chip" style={{ textAlign: 'start' }} onClick={() => { setCustomer(c); setTerm(''); }}>{c.name}</button>)}</>}
    </div>
    <label className="f">{t('ملاحظات')}<textarea className="input" rows={2} value={notes} onChange={useInput(setNotes)} /></label>
    <button className="btn" disabled={m.isPending || !types.length}>{m.isPending ? t('جاري الحفظ...') : t('حفظ')}</button>
  </Modal>;
}
export function AdminAssets() {
  const [search, setSearch] = useState(''); const q = useAssets(useDebouncedValue(search, 300)); const retry = useRefetch(q.refetch);
  const [edit, setEdit] = useState<AssetRow | null | undefined>(undefined);
  return <>
    <h2>{t('إدارة الأصول')}</h2>
    <div className="adm-grid">
      <section className="col"><div className="title">{t('أنواع الأصول')}</div><AssetTypes /></section>
      <section className="col">
        <div className="row between"><div className="title">{t('الأصول')}</div>
          <button className="btn sm" onClick={() => setEdit(null)} data-testid="button-new-asset"><Plus size={18} /> {t('أصل جديد')}</button></div>
        <input className="input" placeholder={t('ابحث بالكود أو الرقم التسلسلي...')} value={search} onChange={useInput(setSearch)} />
        {q.isPending ? <SkeletonList n={3} /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
          : !q.items.length ? <EmptyState icon={<Package />} title={t('لا توجد أصول')} />
          : q.items.map((a) => { const [label, cls] = ASSET_STATUS[a.status] ?? [a.status, 'b-gray'];
              return <div key={a.id} className="card row between">
                <div className="grow"><div className="title" dir="ltr" style={{ textAlign: 'start' }}>{a.asset_types?.icon} {a.asset_code}</div>
                  <div className="muted">{a.asset_types?.name_ar}{a.customers ? ` · ${a.customers.name}` : ''}{a.serial_number ? ` · ${a.serial_number}` : ''}</div></div>
                <span className={`badge ${cls}`}>{t(label)}</span>
                <button className="btn sm ghost" onClick={() => setEdit(a)}>{t('تعديل')}</button></div>; })}
        <LoadMore q={q} />
      </section>
    </div>
    {edit !== undefined && <AssetFormLoader edit={edit} onClose={() => setEdit(undefined)} />}
  </>;
}
/** Loads active asset types for the form (kept separate so the list renders without waiting on them). */
function AssetFormLoader({ edit, onClose }: { edit: AssetRow | null; onClose: () => void }) {
  const q = useAssetTypeOptions();
  if (q.isPending) return null;
  if (!q.data?.length) return <Modal title={t('لا توجد أنواع أصول')} onClose={onClose} onSubmit={(e) => { e.preventDefault(); onClose(); }}>
    <div className="alert warn">{t('أضف نوع أصل واحدًا على الأقل من قسم "أنواع الأصول" أولاً.')}</div><button className="btn">{t('حسنًا')}</button></Modal>;
  return <AssetForm edit={edit} types={q.data} onClose={onClose} />;
}
function useAssetTypeOptions() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'asset-types', 'options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('asset_types').select('id,name_ar,icon').eq('company_id', sc.companyId).eq('is_active', true).order('name_ar');
      if (error) throw new Error(t('تعذر تحميل أنواع الأصول.'));
      return data as { id: string; name_ar: string; icon: string }[];
    },
  });
}

/* ---------- Broadcast notifications ---------- */
export function AdminNotifications() {
  const sups = useSupervisors(); const m = useBroadcast();
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const active = sups.items.filter((s) => s.is_active);
  const togglePick = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const submit = useCallback((e: FormEvent) => { e.preventDefault();
    const ids = all ? active.map((s) => s.id) : [...picked];
    m.mutate({ supervisorIds: ids, title, body }, { onSuccess: () => { setTitle(''); setBody(''); setPicked(new Set()); } });
  }, [m, all, active, picked, title, body]);
  return <>
    <h2>{t('إرسال إشعار')}</h2>
    <form className="card col" style={{ maxWidth: 640 }} onSubmit={submit}>
      <label className="f">{t('العنوان *')}<input className="input" required maxLength={120} value={title} onChange={useInput(setTitle)} /></label>
      <label className="f">{t('النص *')}<textarea className="input" required rows={4} maxLength={1000} value={body} onChange={useInput(setBody)} /></label>
      <div className="row"><label className="row"><input type="radio" checked={all} onChange={() => setAll(true)} /> {t('كل المشرفين النشطين ({n})', { n: active.length })}</label>
        <label className="row"><input type="radio" checked={!all} onChange={() => setAll(false)} /> {t('مشرفون محددون')}</label></div>
      {!all && <div className="row" style={{ flexWrap: 'wrap' }}>{active.map((s) =>
        <button type="button" key={s.id} className={`chip ${picked.has(s.id) ? 'on' : ''}`} aria-pressed={picked.has(s.id)} onClick={() => togglePick(s.id)}>{s.full_name}</button>)}</div>}
      <LoadMore q={sups} />
      <button className="btn" disabled={m.isPending} data-testid="button-broadcast"><Bell size={18} /> {m.isPending ? t('جاري الإرسال...') : t('إرسال')}</button>
    </form>
  </>;
}

/* ---------- Company settings + logo ---------- */
export function AdminSettings() {
  const s = useAppSettings(); const up = useUploadLogo(); const save = useSaveSettings();
  const onLogo = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const url = await up.mutateAsync(file).catch(() => null);
    if (url) save.mutate({ app_name: s.app_name, primary_color: s.primary_color, geofence_radius_m: s.geofence_radius_m,
      target_brand_name: s.target_brand_name, competitor_brands: s.competitor_brands, logo_url: url });
  }, [up, save, s]);
  return <>
    <h2>{t('إعدادات الشركة')}</h2>
    <div className="adm-grid">
      <SettingsForm />
      <div className="card col">
        <div className="title">{t('شعار الشركة')}</div>
        {s.logo_url ? <img src={s.logo_url} alt={t('شعار الشركة')} style={{ maxWidth: 160, maxHeight: 160, objectFit: 'contain' }} /> : <div className="muted">{t('لا يوجد شعار.')}</div>}
        <label className="btn ghost">{up.isPending || save.isPending ? t('جاري الرفع...') : t('رفع شعار جديد')}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={onLogo} data-testid="input-logo" /></label>
        <div className="muted" style={{ fontSize: 13 }}>{t('PNG أو JPG أو WEBP أو SVG · حتى 1 ميجابايت')}</div>
      </div>
    </div>
  </>;
}

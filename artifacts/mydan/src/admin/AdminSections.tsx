import { useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useScope } from '@/lib/data';
import { Bell, Camera, CheckCheck, Download, FileText, MapPin, Package, Plus, ShoppingCart, Store, Trash2, X } from '@/components/Icons';
import { exportToCsv } from '@/lib/csv-export';
import { useAdminOrders, useUpdateOrderStatus, formatOrderWhatsAppMessage, openWhatsAppShare, type OrderRecord } from '@/lib/screen-orders';
import { fmtDate, fmtTime, num } from '@/lib/format';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useCustomerSearch, useSupervisors } from '@/lib/data';
import { useAdminProducts, useSaveSettings, type CatalogProduct } from '@/lib/screen-data';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  ASSET_STATUS, useAdminCustomers, useAdminSurveys, useAssets, useAuditLogs, useBranches, useBroadcast,
  useDeactivateRecord, useSaveAdminCustomer, useSaveAsset, useSaveBranch, useSaveProduct, useSaveSurvey, useUploadLogo,
  useRegions, useSaveRegion,
  type AdminCustomerRow, type AssetRow, type AuditRow, type Branch, type SurveyQuestion, type SurveyRow,
} from '@/lib/admin-data';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import type { Supervisor } from '@/types/database';
import { AssetTypes, SettingsForm, TargetForm } from '@/screens/AdminPanel';
import { useInput, useRefetch } from '@/screens/shared';
import { useAdminProspects, useAdminFieldSurveys, useConvertProspect, type FieldSurveyRecord } from '@/lib/screen-survey';
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

/* ---------- Regions Modal ---------- */
function RegionModal({ onClose }: { onClose: () => void }) {
  const m = useSaveRegion();
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const submit = useCallback((e: FormEvent) => {
    e.preventDefault();
    m.mutate({ name, name_en: nameEn, is_active: true }, { onSuccess: onClose });
  }, [m, name, nameEn, onClose]);
  return <Modal title={t('إضافة إقليم جديد')} onClose={onClose} onSubmit={submit}>
    <label className="f">{t('اسم الإقليم بالعربي *')}<input className="input" required value={name} onChange={useInput(setName)} placeholder={t('مثال: إقليم القاهرة الكبرى')} /></label>
    <label className="f">{t('اسم الإقليم بالإنجليزي')}<input className="input" value={nameEn} onChange={useInput(setNameEn)} placeholder="Greater Cairo" /></label>
    <button className="btn" disabled={m.isPending}>{m.isPending ? t('جاري الحفظ...') : t('حفظ الإقليم')}</button>
  </Modal>;
}

/* ---------- Branches ---------- */
function BranchForm({ edit, onClose }: { edit: Branch | null; onClose: () => void }) {
  const m = useSaveBranch(); const sups = useSupervisors(); const regions = useRegions();
  const [name, setName] = useState(edit?.name ?? '');
  const [regionId, setRegionId] = useState(edit?.region_id ?? '');
  const [region, setRegion] = useState(edit?.region ?? '');
  const [manager, setManager] = useState(edit?.manager_id ?? ''); const [active, setActive] = useState(edit?.is_active ?? true);
  const [lat, setLat] = useState(edit?.latitude?.toString() ?? ''); const [lng, setLng] = useState(edit?.longitude?.toString() ?? '');

  const submit = useCallback((e: FormEvent) => { e.preventDefault();
    m.mutate({
      id: edit?.id, name, region, region_id: regionId || null,
      manager_id: manager || null, latitude: numOrNull(lat), longitude: numOrNull(lng), is_active: active
    }, { onSuccess: onClose });
  }, [m, edit, name, region, regionId, manager, lat, lng, active, onClose]);

  return <Modal title={edit ? t('تعديل الفرع') : t('فرع جديد')} onClose={onClose} onSubmit={submit}>
    <label className="f">{t('اسم الفرع *')}<input className="input" required value={name} onChange={useInput(setName)} /></label>
    <label className="f">{t('الإقليم')}<select className="input" value={regionId} onChange={(e) => {
      setRegionId(e.target.value);
      const found = regions.data?.find((r) => r.id === e.target.value);
      if (found) setRegion(found.name);
    }}>
      <option value="">{t('اختر الإقليم')}</option>
      {regions.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select></label>
    {(!regionId || !regions.data?.length) && (
      <label className="f">{t('اسم المنطقة يدويًا')}<input className="input" value={region} onChange={useInput(setRegion)} placeholder={t('مثال: الدلتا / الصعيد')} /></label>
    )}
    <label className="f">{t('مدير الفرع')}<select className="input" value={manager} onChange={useInput(setManager)}>
      <option value="">{t('بدون')}</option>{sups.items.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></label>
    <div className="row"><label className="f grow">{t('خط العرض')}<input className="input" dir="ltr" inputMode="decimal" value={lat} onChange={useInput(setLat)} /></label>
      <label className="f grow">{t('خط الطول')}<input className="input" dir="ltr" inputMode="decimal" value={lng} onChange={useInput(setLng)} /></label></div>
    <label className="row" style={{ minHeight: 44 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 22, height: 22 }} /> {t('فرع نشط')}</label>
    <button className="btn" disabled={m.isPending}>{m.isPending ? t('جاري الحفظ...') : t('حفظ')}</button>
  </Modal>;
}
export function AdminBranches() {
  const q = useBranches(); const sups = useSupervisors(); const regions = useRegions(); const retry = useRefetch(q.refetch);
  const deactivate = useDeactivateRecord('branches', 'admin-branches');
  const [edit, setEdit] = useState<Branch | null | undefined>(undefined);
  const [showRegionModal, setShowRegionModal] = useState(false);
  const name = (id: string | null) => sups.items.find((s) => s.id === id)?.full_name ?? '—';
  const regionMap = useMemo(() => new Map(regions.data?.map((r) => [r.id, r.name]) ?? []), [regions.data]);

  return <>
    <div className="row between">
      <div>
        <h2 style={{ margin: 0 }}>{t('الفروع والأقاليم')}</h2>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{t('إدارة الفروع الجغرافية وربطها بالأقاليم والمشرفين.')}</p>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={() => setShowRegionModal(true)}><Plus size={16} /> {t('إقليم جديد')}</button>
        <button className="btn" onClick={() => setEdit(null)}><Plus size={18} /> {t('فرع جديد')}</button>
      </div>
    </div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : !q.data.length ? <EmptyState icon={<MapPin />} title={t('لا توجد فروع')} action={{ label: t('إضافة فرع'), onClick: () => setEdit(null) }} />
      : <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr><th>{t('الفرع')}</th><th>{t('الإقليم / المنطقة')}</th><th>{t('المدير')}</th><th>{t('الحالة')}</th><th /></tr></thead>
          <tbody>{q.data.map((b) => <tr key={b.id}><td className="title">{b.name}</td><td>{(b.region_id && regionMap.get(b.region_id)) || b.region || '—'}</td><td>{name(b.manager_id)}</td>
            <td><span className={`badge ${b.is_active ? 'b-green' : 'b-gray'}`}>{b.is_active ? t('نشط') : t('متوقف')}</span></td>
            <td className="row gap-1">
              <button className="btn sm ghost" onClick={() => setEdit(b)}>{t('تعديل')}</button>
              {b.is_active && <button className="btn sm ghost danger" title={t('تعطيل')} onClick={() => { if (confirm(t('تعطيل الفرع؟'))) deactivate.mutate(b.id); }}><Trash2 size={14} /></button>}
            </td></tr>)}</tbody>
        </table></div>}
    {edit !== undefined && <BranchForm edit={edit} onClose={() => setEdit(undefined)} />}
    {showRegionModal && <RegionModal onClose={() => setShowRegionModal(false)} />}
  </>;
}

/* ---------- Customers ---------- */
const CUST_TYPES = ['بقالة', 'سوبرماركت', 'هايبرماركت', 'كيوسك', 'محل جملة', 'منظفات', 'صيدليات', 'ضيافة', 'أخرى'];
function CustomerForm({ edit, sups, onClose }: { edit: AdminCustomerRow | null; sups: Supervisor[]; onClose: () => void }) {
  const m = useSaveAdminCustomer();
  const [customerCode, setCustomerCode] = useState(edit?.customer_code ?? '');
  const [name, setName] = useState(edit?.name ?? ''); const [type, setType] = useState(edit?.type ?? CUST_TYPES[0]);
  const [ownerName, setOwnerName] = useState(edit?.owner_name ?? ''); const [phone, setPhone] = useState(edit?.phone ?? '');
  const [address, setAddress] = useState(edit?.address ?? ''); const [branch, setBranch] = useState(edit?.branch ?? '');
  const [lat, setLat] = useState(edit?.latitude?.toString() ?? ''); const [lng, setLng] = useState(edit?.longitude?.toString() ?? '');
  const [supId, setSupId] = useState(edit?.supervisor_id ?? ''); const [active, setActive] = useState(edit?.is_active ?? true);
  const numOrNull = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const submit = useCallback((e: FormEvent) => { e.preventDefault();
    m.mutate({ id: edit?.id, customer_code: customerCode, name, type, owner_name: ownerName, phone, address,
      latitude: numOrNull(lat), longitude: numOrNull(lng), branch, supervisor_id: supId, is_active: active },
      { onSuccess: onClose });
  }, [m, edit, customerCode, name, type, ownerName, phone, address, lat, lng, branch, supId, active, onClose]);
  return <Modal title={edit ? t('تعديل العميل') : t('عميل جديد')} onClose={onClose} onSubmit={submit}>
    <div className="row">
      <label className="f grow">{t('كود العميل')}<input className="input" dir="ltr" value={customerCode} onChange={useInput(setCustomerCode)} placeholder="CUST-001" /></label>
      <label className="f grow">{t('اسم العميل *')}<input className="input" required value={name} onChange={useInput(setName)} /></label>
    </div>
    <div className="row">
      <label className="f grow">{t('النوع *')}<select className="input" required value={type} onChange={useInput(setType)}>
        {CUST_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}</select></label>
      <label className="f grow">{t('المسؤول')}<input className="input" value={ownerName} onChange={useInput(setOwnerName)} /></label>
    </div>
    <div className="row">
      <label className="f grow">{t('الهاتف')}<input className="input" dir="ltr" inputMode="tel" value={phone} onChange={useInput(setPhone)} /></label>
      <label className="f grow">{t('الفرع')}<input className="input" value={branch} onChange={useInput(setBranch)} /></label>
    </div>
    <label className="f">{t('العنوان *')}<input className="input" required value={address} onChange={useInput(setAddress)} /></label>
    <div className="row">
      <label className="f grow">{t('خط العرض')}<input className="input" dir="ltr" inputMode="decimal" value={lat} onChange={useInput(setLat)} /></label>
      <label className="f grow">{t('خط الطول')}<input className="input" dir="ltr" inputMode="decimal" value={lng} onChange={useInput(setLng)} /></label>
    </div>
    <label className="f">{t('المشرف المسؤول')}<select className="input" value={supId} onChange={useInput(setSupId)}>
      <option value="">{t('بدون')}</option>{sups.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></label>
    <label className="row" style={{ minHeight: 44 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 22, height: 22 }} /> {t('عميل نشط')}</label>
    <button className="btn" disabled={m.isPending}>{m.isPending ? t('جاري الحفظ...') : t('حفظ')}</button>
  </Modal>;
}
export function AdminCustomers() {
  const [search, setSearch] = useState('');
  const [supFilter, setSupFilter] = useState('all');
  const sups = useSupervisors();
  const q = useAdminCustomers(useDebouncedValue(search, 300), supFilter);
  const retry = useRefetch(q.refetch);
  const deactivate = useDeactivateRecord('customers', 'admin-customers');
  const [edit, setEdit] = useState<AdminCustomerRow | null | undefined>(undefined);

  const handleExportCustomers = () => {
    if (!q.items.length) return;
    exportToCsv(
      `Customers_${new Date().toISOString().slice(0, 10)}`,
      [
        { header: t('كود العميل'), accessor: (c) => c.customer_code || '' },
        { header: t('اسم العميل'), accessor: (c) => c.name },
        { header: t('النوع'), accessor: (c) => c.type },
        { header: t('المسؤول'), accessor: (c) => c.owner_name || '' },
        { header: t('الهاتف'), accessor: (c) => c.phone || '' },
        { header: t('الفرع'), accessor: (c) => c.branch || '' },
        { header: t('العنوان'), accessor: (c) => c.address || '' },
        { header: t('خط العرض'), accessor: (c) => c.latitude ?? '' },
        { header: t('خط الطول'), accessor: (c) => c.longitude ?? '' },
        { header: t('المشرف المسؤول'), accessor: (c) => c.supervisors?.full_name || '' },
        { header: t('الحالة'), accessor: (c) => (c.is_active ? t('نشط') : t('متوقف')) },
      ],
      q.items
    );
  };

  return <>
    <div className="row between">
      <h2>{t('العملاء')}</h2>
      <div className="row gap-2">
        <button
          type="button"
          className="btn ghost"
          onClick={handleExportCustomers}
          disabled={!q.items.length}
          title={t('تصدير بيانات العملاء إلى ملف Excel')}
        >
          <Download size={16} /> {t('تصدير Excel')}
        </button>
        <button className="btn" onClick={() => setEdit(null)}>
          <Plus size={18} /> {t('عميل جديد')}
        </button>
      </div>
    </div>
    <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <input className="input grow" placeholder={t('ابحث بالاسم أو الكود أو الهاتف أو العنوان...')} value={search} onChange={useInput(setSearch)} style={{ maxWidth: 380 }} />
      <select className="input" style={{ width: 200 }} value={supFilter} onChange={(e) => setSupFilter(e.target.value)}>
        <option value="all">{t('كل المشرفين')}</option>
        {sups.items.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
      </select>
      {(supFilter !== 'all' || search) && (
        <button className="btn sm ghost" onClick={() => { setSearch(''); setSupFilter('all'); }}>{t('إعادة ضبط')}</button>
      )}
    </div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : !q.items.length ? <EmptyState icon={<Store />} title={t('لا يوجد عملاء')} action={{ label: t('إضافة عميل'), onClick: () => setEdit(null) }} />
      : <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr><th>{t('الكود')}</th><th>{t('الاسم')}</th><th>{t('النوع')}</th><th>{t('الهاتف')}</th><th>{t('المشرف')}</th><th>{t('الحالة')}</th><th /></tr></thead>
          <tbody>{q.items.map((c) => <tr key={c.id}>
            <td dir="ltr" style={{ fontWeight: 600, color: 'var(--color-primary)', fontSize: 13, whiteSpace: 'nowrap' }}>{c.customer_code || '—'}</td>
            <td><div className="title">{c.name}</div><div className="muted" style={{ fontSize: 12 }}>{c.address}</div></td>
            <td>{c.type}</td>
            <td dir="ltr" style={{ textAlign: 'start' }}>{c.phone ?? '—'}</td>
            <td>{c.supervisors?.full_name ?? '—'}</td>
            <td><span className={`badge ${c.is_active ? 'b-green' : 'b-gray'}`}>{c.is_active ? t('نشط') : t('متوقف')}</span></td>
            <td className="row gap-1">
              <button className="btn sm ghost" onClick={() => setEdit(c)}>{t('تعديل')}</button>
              {c.is_active && <button className="btn sm ghost danger" title={t('تعطيل')} onClick={() => { if (confirm(t('تعطيل العميل؟'))) deactivate.mutate(c.id); }}><Trash2 size={14} /></button>}
            </td>
          </tr>)}</tbody>
        </table></div>}
    <LoadMore q={q} />
    {edit !== undefined && <CustomerForm edit={edit} sups={sups.items} onClose={() => setEdit(undefined)} />}
  </>;
}

/* ---------- Targets (reuse AdminPanel form) ---------- */
export function AdminTargets() { return <><h2>{t('الأهداف الشهرية')}</h2><div style={{ maxWidth: 560 }}><TargetForm /></div></>; }

/* ---------- Products (catalog only; pricing is out of scope by design) ---------- */
function ProductForm({ edit, onClose }: { edit: CatalogProduct | null; onClose: () => void }) {
  const m = useSaveProduct();
  const [name, setName] = useState(edit?.name ?? '');
  const [category, setCategory] = useState(edit?.category ?? '');
  const [sku, setSku] = useState(edit?.sku ?? '');
  const [itemCode, setItemCode] = useState(edit?.item_code ?? edit?.sku ?? '');
  const [masterBrand, setMasterBrand] = useState(edit?.master_brand ?? '');
  const [subBrand, setSubBrand] = useState(edit?.sub_brand ?? '');
  const [unit, setUnit] = useState(edit?.unit ?? 'قطعة');
  const [price, setPrice] = useState(edit?.price?.toString() ?? '');
  const [unitsPerCarton, setUnitsPerCarton] = useState(edit?.units_per_carton?.toString() ?? '1');
  const [cartonPrice, setCartonPrice] = useState(edit?.carton_price?.toString() ?? '');
  const [active, setActive] = useState(edit?.is_active ?? true);

  const submit = useCallback((e: FormEvent) => {
    e.preventDefault();
    m.mutate({
      id: edit?.id,
      name,
      category,
      sku: itemCode || sku,
      item_code: itemCode,
      master_brand: masterBrand,
      sub_brand: subBrand,
      unit,
      price: numOrNull(price),
      units_per_carton: numOrNull(unitsPerCarton) ?? 1,
      carton_price: numOrNull(cartonPrice),
      is_active: active,
    }, { onSuccess: onClose });
  }, [m, edit, name, category, sku, itemCode, masterBrand, subBrand, unit, price, unitsPerCarton, cartonPrice, active, onClose]);

  return <Modal title={edit ? t('تعديل المنتج') : t('منتج جديد')} onClose={onClose} onSubmit={submit}>
    <label className="f">{t('اسم المنتج *')}<input className="input" required value={name} onChange={useInput(setName)} /></label>
    <div className="row">
      <label className="f grow">{t('كود الصنف (Item Code / SKU)')}<input className="input" dir="ltr" value={itemCode} onChange={useInput(setItemCode)} placeholder="ITM-001" /></label>
      <label className="f grow">{t('الفئة')}<input className="input" value={category} onChange={useInput(setCategory)} placeholder={t('مثال: مشروبات / شوكولاتة')} /></label>
    </div>
    <div className="row">
      <label className="f grow">{t('Master Brand (العلامة الرئيسية)')}<input className="input" value={masterBrand} onChange={useInput(setMasterBrand)} placeholder={t('مثال: كورونا')} /></label>
      <label className="f grow">{t('Sub Brand (العلامة الفرعية)')}<input className="input" value={subBrand} onChange={useInput(setSubBrand)} placeholder={t('مثال: شوكولاتة')} /></label>
    </div>
    <div className="row">
      <label className="f grow">{t('الوحدة الأساسية')}<input className="input" value={unit} onChange={useInput(setUnit)} placeholder={t('مثال: قطعة / باكو')} /></label>
      <label className="f grow">{t('سعر القطعة (ج.م)')}<input className="input" dir="ltr" inputMode="decimal" value={price} onChange={useInput(setPrice)} placeholder="0.00" /></label>
    </div>
    <div className="row">
      <label className="f grow">{t('عدد القطع في الكرتونة (التعبئة)')}<input className="input" dir="ltr" type="number" min={1} value={unitsPerCarton} onChange={useInput(setUnitsPerCarton)} placeholder="مثال: 12 أو 24" /></label>
      <label className="f grow">{t('سعر الكرتونة (ج.م) [اختياري]')}<input className="input" dir="ltr" inputMode="decimal" value={cartonPrice} onChange={useInput(setCartonPrice)} placeholder={t('يحسب تلقائياً إن ترك فارغاً')} /></label>
    </div>
    <label className="row" style={{ minHeight: 44 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 22, height: 22 }} /> {t('متاح في الكتالوج')}</label>
    <button className="btn" disabled={m.isPending}>{m.isPending ? t('جاري الحفظ...') : t('حفظ المنتج')}</button>
  </Modal>;
}
export function AdminProducts() {
  const [availability, setAvailability] = useState<'all' | 'active' | 'inactive'>('all');
  const q = useAdminProducts(availability);
  const retry = useRefetch(q.refetch);
  const deactivate = useDeactivateRecord('products', 'admin-products');
  const [edit, setEdit] = useState<CatalogProduct | null | undefined>(undefined);

  return <>
    <div className="row between">
      <h2>{t('المنتجات')}</h2>
      <button className="btn" onClick={() => setEdit(null)}><Plus size={18} /> {t('منتج جديد')}</button>
    </div>
    <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 12 }}>
      <span className="muted" style={{ fontSize: 13 }}>{t('حالة الصنف:')}</span>
      <select className="input" style={{ width: 170 }} value={availability} onChange={(e) => setAvailability(e.target.value as any)}>
        <option value="all">{t('كل الأصناف')}</option>
        <option value="active">{t('المتاحة فقط')}</option>
        <option value="inactive">{t('غير المتاحة (المتوقفة)')}</option>
      </select>
    </div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : !q.items.length ? <EmptyState icon={<Package />} title={t('لا توجد منتجات')} />
      : <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr>
            <th>{t('كود الصنف')}</th>
            <th>{t('المنتج')}</th>
            <th>Master Brand</th>
            <th>Sub Brand</th>
            <th>{t('التعبئة والوحدة')}</th>
            <th>{t('الحالة')}</th>
            <th />
          </tr></thead>
          <tbody>{q.items.map((p) => <tr key={p.id}>
            <td dir="ltr" style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{p.item_code || p.sku || '—'}</td>
            <td className="title">{p.name}</td>
            <td>{p.master_brand || '—'}</td>
            <td>{p.sub_brand || '—'}</td>
            <td>{p.units_per_carton && p.units_per_carton > 1 ? `${p.units_per_carton} ${p.unit || 'قطعة'} / كرتونة` : (p.unit || 'قطعة')}</td>
            <td><span className={`badge ${p.is_active ? 'b-green' : 'b-gray'}`}>{p.is_active ? t('متاح') : t('متوقف')}</span></td>
            <td className="row gap-1">
              <button className="btn sm ghost" onClick={() => setEdit(p)}>{t('تعديل')}</button>
              {p.is_active && <button className="btn sm ghost danger" title={t('تعطيل')} onClick={() => { if (confirm(t('تعطيل المنتج؟'))) deactivate.mutate(p.id); }}><Trash2 size={14} /></button>}
            </td></tr>)}</tbody>
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
  const [status, setStatus] = useState(edit?.status ?? 'active');
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(edit?.customer_id ? { id: edit.customer_id, name: edit.customers?.name ?? '' } : null);
  const [term, setTerm] = useState(''); const found = useCustomerSearch(useDebouncedValue(term, 300)); const onTerm = useInput(setTerm);
  const submit = useCallback((e: FormEvent) => { e.preventDefault();
    m.mutate({ id: edit?.id, asset_code: code, asset_type_id: type, customer_id: customer?.id ?? '', serial_number: serial, model, status }, { onSuccess: onClose });
  }, [m, edit, code, type, customer, serial, model, status, onClose]);
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
    <button className="btn" disabled={m.isPending || !types.length}>{m.isPending ? t('جاري الحفظ...') : t('حفظ')}</button>
  </Modal>;
}
export function AdminAssets() {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const q = useAssets(useDebouncedValue(search, 300), dateFrom || undefined, dateTo || undefined);
  const retry = useRefetch(q.refetch);
  const [edit, setEdit] = useState<AssetRow | null | undefined>(undefined);

  const handleExportAssets = () => {
    if (!q.items.length) return;
    exportToCsv(
      `Assets_${new Date().toISOString().slice(0, 10)}`,
      [
        { header: t('كود الأصل'), accessor: (a) => a.asset_code },
        { header: t('نوع الأصل'), accessor: (a) => a.asset_types?.name_ar || '' },
        { header: t('العميل المركّب عنده'), accessor: (a) => a.customers?.name || '' },
        { header: t('الرقم التسلسلي'), accessor: (a) => a.serial_number || '' },
        { header: t('الموديل'), accessor: (a) => a.model || '' },
        { header: t('الحالة'), accessor: (a) => t(ASSET_STATUS[a.status]?.[0] || a.status) },
      ],
      q.items
    );
  };

  return <>
    <h2>{t('إدارة الأصول')}</h2>
    <div className="adm-grid">
      <section className="col"><div className="title">{t('أنواع الأصول')}</div><AssetTypes /></section>
      <section className="col">
        <div className="row between">
          <div className="title">{t('الأصول')}</div>
          <div className="row gap-2">
            <button
              type="button"
              className="btn sm ghost"
              onClick={handleExportAssets}
              disabled={!q.items.length}
              title={t('تصدير الأصول إلى Excel')}
            >
              <Download size={14} /> {t('تصدير Excel')}
            </button>
            <button className="btn sm" onClick={() => setEdit(null)} data-testid="button-new-asset">
              <Plus size={18} /> {t('أصل جديد')}
            </button>
          </div>
        </div>
        <div className="col" style={{ gap: 8 }}>
          <input className="input" placeholder={t('ابحث بالكود أو الرقم التسلسلي...')} value={search} onChange={useInput(setSearch)} />
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 12 }}>{t('تاريخ التركيب/التسجيل:')}</span>
            <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ width: 135 }} />
            <span className="muted" style={{ fontSize: 12 }}>{t('إلى:')}</span>
            <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ width: 135 }} />
            {(dateFrom || dateTo) && (
              <button className="btn sm ghost" onClick={() => { setDateFrom(''); setDateTo(''); }}>{t('إلغاء التصفية')}</button>
            )}
          </div>
        </div>
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

/* ---------- Audit Logs ---------- */
const TABLE_OPTIONS = ['', 'visits', 'supervisors', 'customers', 'products', 'assets', 'branches', 'targets', 'beat_plans', 'shelf_audit', 'notifications'];
const TABLE_LABELS: Record<string, string> = {
  '': 'الكل', visits: 'الزيارات', supervisors: 'المشرفون', customers: 'العملاء', products: 'المنتجات',
  assets: 'الأصول', branches: 'الفروع', targets: 'الأهداف', beat_plans: 'خطة الزيارات',
  shelf_audit: 'مراجعة الرف', notifications: 'الإشعارات',
};
const ACTION_BADGE: Record<string, string> = { INSERT: 'b-green', UPDATE: 'b-blue', DELETE: 'b-red' };
const ACTION_LABEL: Record<string, string> = { INSERT: 'إضافة', UPDATE: 'تعديل', DELETE: 'حذف' };
function AuditDetail({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const data = row.action === 'DELETE' ? row.old_data : row.new_data;
  if (!data) return null;
  return <>
    <button className="btn sm ghost" onClick={() => setOpen(true)}>{t('التفاصيل')}</button>
    {open && <div className="adm-modal-bg" onClick={() => setOpen(false)}>
      <div className="adm-modal col" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <span className="title" style={{ fontSize: 15 }}>{t(TABLE_LABELS[row.table_name] ?? row.table_name)} · {t(ACTION_LABEL[row.action] ?? row.action)}</span>
          <button className="icon-btn" onClick={() => setOpen(false)}><X /></button>
        </div>
        <pre style={{ fontSize: 12, direction: 'ltr', background: 'var(--color-bg)', borderRadius: 8, padding: 10, overflowX: 'auto', maxHeight: 340 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>}
  </>;
}
export function AdminAuditLogs() {
  const [tableFilter, setTableFilter] = useState('');
  const q = useAuditLogs(tableFilter);
  const retry = useRefetch(q.refetch);
  return <>
    <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
      <h2>{t('سجل المراجعة')}</h2>
      <select className="input" style={{ width: 'auto', minWidth: 160, minHeight: 40 }} value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}>
        {TABLE_OPTIONS.map((k) => <option key={k} value={k}>{t(TABLE_LABELS[k] ?? k)}</option>)}
      </select>
    </div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : !q.items.length ? <EmptyState icon={<Bell />} title={t('لا توجد سجلات')} />
      : <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr>
            <th>{t('التاريخ')}</th>
            <th>{t('الجدول')}</th>
            <th>{t('الإجراء')}</th>
            <th>{t('المشرف')}</th>
            <th />
          </tr></thead>
          <tbody>{q.items.map((r) => <tr key={r.id}>
            <td style={{ fontSize: 12, whiteSpace: 'nowrap' }} dir="ltr">{new Date(r.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td style={{ fontSize: 13 }}>{t(TABLE_LABELS[r.table_name] ?? r.table_name)}</td>
            <td><span className={`badge ${ACTION_BADGE[r.action] ?? 'b-gray'}`}>{t(ACTION_LABEL[r.action] ?? r.action)}</span></td>
            <td style={{ fontSize: 13 }}>{r.supervisors?.full_name ?? '—'}</td>
            <td><AuditDetail row={r} /></td>
          </tr>)}</tbody>
        </table></div>}
    <LoadMore q={q} />
  </>;
}

/* ---------- Surveys ---------- */
function SurveyForm({ edit, onClose }: { edit: SurveyRow | null; onClose: () => void }) {
  const m = useSaveSurvey();
  const [title, setTitle] = useState(edit?.title ?? '');
  const [targetType, setTargetType] = useState(edit?.target_customer_type ?? '');
  const [mandatory, setMandatory] = useState(edit?.is_mandatory ?? false);
  const [active, setActive] = useState(edit?.is_active ?? true);
  const [validFrom, setValidFrom] = useState(edit?.valid_from?.slice(0, 10) ?? '');
  const [validTo, setValidTo] = useState(edit?.valid_to?.slice(0, 10) ?? '');
  const [questions, setQuestions] = useState<SurveyQuestion[]>(edit?.questions ?? []);
  const addQ = useCallback(() => setQuestions((q) => [...q, { text: '', type: 'text' }]), []);
  const removeQ = useCallback((i: number) => setQuestions((q) => q.filter((_, idx) => idx !== i)), []);
  const updateQ = useCallback((i: number, field: keyof SurveyQuestion, val: string) =>
    setQuestions((q) => q.map((item, idx) => idx === i ? { ...item, [field]: val } : item)), []);
  const submit = useCallback((e: FormEvent) => { e.preventDefault();
    m.mutate({ id: edit?.id, title, questions, target_customer_type: targetType,
      is_mandatory: mandatory, is_active: active, valid_from: validFrom, valid_to: validTo }, { onSuccess: onClose });
  }, [m, edit, title, questions, targetType, mandatory, active, validFrom, validTo, onClose]);
  return <Modal title={edit ? t('تعديل الاستبيان') : t('استبيان جديد')} onClose={onClose} onSubmit={submit}>
    <label className="f">{t('عنوان الاستبيان *')}<input className="input" required value={title} onChange={useInput(setTitle)} /></label>
    <div className="row">
      <label className="f grow">{t('نوع العميل المستهدف')}<input className="input" placeholder={t('الكل')} value={targetType} onChange={useInput(setTargetType)} /></label>
    </div>
    <div className="row">
      <label className="f grow">{t('من تاريخ')}<input className="input" type="date" value={validFrom} onChange={useInput(setValidFrom)} /></label>
      <label className="f grow">{t('إلى تاريخ')}<input className="input" type="date" value={validTo} onChange={useInput(setValidTo)} /></label>
    </div>
    <div className="row" style={{ gap: 24 }}>
      <label className="row"><input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} style={{ width: 20, height: 20 }} /> {t('إلزامي')}</label>
      <label className="row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 20, height: 20 }} /> {t('نشط')}</label>
    </div>
    <div className="title" style={{ marginTop: 8 }}>{t('الأسئلة')}</div>
    {questions.map((q, i) => <div key={i} className="card col" style={{ gap: 6, padding: '10px 12px' }}>
      <div className="row between">
        <span className="muted" style={{ fontSize: 12 }}>{t('سؤال')} {i + 1}</span>
        <button type="button" className="icon-btn" onClick={() => removeQ(i)}><X size={16} /></button>
      </div>
      <input className="input" placeholder={t('نص السؤال *')} value={q.text}
        onChange={(e) => updateQ(i, 'text', e.target.value)} required />
      <select className="input" value={q.type} onChange={(e) => updateQ(i, 'type', e.target.value)}>
        <option value="text">{t('نص حر')}</option>
        <option value="rating">{t('تقييم (1-5)')}</option>
        <option value="choice">{t('اختيار من متعدد')}</option>
        <option value="checklist">{t('فحص تواجد أصناف ✓ (Checklist مثل زينة)')}</option>
      </select>
      {q.type === 'checklist' && (
        <div className="col" style={{ gap: 6, marginTop: 4 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {t('قائمة الأصناف المطلوب فحص تواجدها (اكتب كل صنف في سطر أو مفصولة بفاصلة):')}
          </span>
          <textarea
            className="input"
            rows={3}
            placeholder={t('مثال:\nمناديل كلاسيك 550 منديل\nمناديل مطبخ سوبر\nمناديل تواليت مضغوط\n...')}
            value={(q.checklist_items || []).join('\n')}
            onChange={(e) => {
              const items = e.target.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
              updateQ(i, 'checklist_items', items as any);
            }}
          />
          {(q.checklist_items?.length ?? 0) > 0 && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              {q.checklist_items!.map((it, idx) => (
                <span key={idx} className="chip" style={{ fontSize: 11, background: '#E0F2FE', color: '#0369A1' }}>
                  ✓ {it}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>)}
    <button type="button" className="btn ghost" onClick={addQ}><Plus size={16} /> {t('إضافة سؤال')}</button>
    <button className="btn" disabled={m.isPending || !questions.length}>
      {m.isPending ? t('جاري الحفظ...') : t('حفظ')}</button>
  </Modal>;
}
export function AdminSurveys() {
  const q = useAdminSurveys(); const retry = useRefetch(q.refetch);
  const [edit, setEdit] = useState<SurveyRow | null | undefined>(undefined);
  return <>
    <div className="row between"><h2>{t('الاستبيانات')}</h2>
      <button className="btn" onClick={() => setEdit(null)}><Plus size={18} /> {t('استبيان جديد')}</button></div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : !q.data?.length ? <EmptyState icon={<FileText />} title={t('لا توجد استبيانات')} action={{ label: t('إنشاء استبيان'), onClick: () => setEdit(null) }} />
      : <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr><th>{t('العنوان')}</th><th>{t('الأسئلة')}</th><th>{t('الفترة')}</th><th>{t('الحالة')}</th><th /></tr></thead>
          <tbody>{q.data.map((s) => <tr key={s.id}>
            <td><div className="title">{s.title}</div>{s.is_mandatory && <span className="badge b-red" style={{ fontSize: 11 }}>{t('إلزامي')}</span>}</td>
            <td>{s.questions.length}</td>
            <td style={{ fontSize: 12, direction: 'ltr', textAlign: 'start' }}>
              {s.valid_from ? `${s.valid_from.slice(0, 10)} → ${s.valid_to?.slice(0, 10) ?? '∞'}` : '—'}</td>
            <td><span className={`badge ${s.is_active ? 'b-green' : 'b-gray'}`}>{s.is_active ? t('نشط') : t('متوقف')}</span></td>
            <td><button className="btn sm ghost" onClick={() => setEdit(s)}>{t('تعديل')}</button></td>
          </tr>)}</tbody>
        </table></div>}
    {edit !== undefined && <SurveyForm edit={edit} onClose={() => setEdit(undefined)} />}
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

/* ---------- Prospects (from field survey) ---------- */
export function AdminProspects() {
  const q = useAdminProspects();
  const convert = useConvertProspect();
  const retry = useRefetch(q.refetch);
  return <>
    <div className="row between">
      <h2>{t('العملاء المحتملون')}</h2>
      {q.data && <span className="badge b-blue">{q.data.length}</span>}
    </div>
    <p className="muted" style={{ marginTop: 0 }}>{t('عملاء اكتُشفوا عبر المسح الميداني بالذكاء الاصطناعي. راجعهم وحوّلهم لعملاء نشطين.')}</p>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : !q.data?.length ? <EmptyState icon={<Store />} title={t('لا يوجد عملاء محتملون')} description={t('استخدم المسح الميداني في التطبيق لاكتشاف عملاء جدد.')} />
      : <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr><th>{t('الاسم')}</th><th>{t('النوع')}</th><th>{t('الموقع')}</th><th>{t('التاريخ')}</th><th /></tr></thead>
          <tbody>{q.data.map((c) => (
            <tr key={c.id}>
              <td className="title">{c.name}</td>
              <td>{c.customer_type ?? '—'}</td>
              <td className="muted" style={{ fontSize: 12 }} dir="ltr">
                {c.latitude && c.longitude ? `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}` : '—'}
              </td>
              <td className="muted" style={{ fontSize: 12 }}>{new Date(c.created_at).toLocaleDateString('ar-EG')}</td>
              <td className="row gap-1">
                <button
                  className="btn sm success"
                  disabled={convert.isPending}
                  onClick={() => convert.mutate({ id: c.id, action: 'activate' })}
                >{t('تفعيل')}</button>
                <button
                  className="btn sm ghost danger"
                  disabled={convert.isPending}
                  onClick={() => { if (confirm(t('رفض العميل المحتمل؟'))) convert.mutate({ id: c.id, action: 'reject' }); }}
                >{t('رفض')}</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>}
  </>;
}

/* ---------- Field Survey History ---------- */
const FS_STATUS: Record<string, { label: string; cls: string }> = {
  pending:    { label: 'في الانتظار',   cls: 'b-gray'  },
  processing: { label: 'قيد المعالجة', cls: 'b-blue'  },
  completed:  { label: 'مكتمل',        cls: 'b-green' },
  failed:     { label: 'فشل',          cls: 'b-red'   },
};
export function AdminFieldSurveys() {
  const q = useAdminFieldSurveys();
  const retry = useRefetch(q.refetch);
  const handleExport = useCallback(() => {
    if (!q.data?.length) return;
    exportToCsv<FieldSurveyRecord>('سجل-المسح-الميداني', [
      { header: 'المشرف',         accessor: (r) => r.supervisors?.full_name ?? '' },
      { header: 'الحالة',         key: 'status' },
      { header: 'محلات مكتشفة',  key: 'stores_found' },
      { header: 'التاريخ',        accessor: (r) => new Date(r.created_at).toLocaleDateString('ar-EG') },
      { header: 'خط العرض',      key: 'latitude' },
      { header: 'خط الطول',      key: 'longitude' },
    ], q.data);
  }, [q.data]);
  return <>
    <div className="row between">
      <h2>{t('سجل المسح الميداني')}</h2>
      <div className="row" style={{ gap: 8 }}>
        {q.data && <span className="badge b-blue">{q.data.length}</span>}
        {!!q.data?.length && <button className="btn sm ghost" onClick={handleExport}><Download size={15} /> {t('تصدير CSV')}</button>}
      </div>
    </div>
    <p className="muted" style={{ marginTop: 0 }}>{t('سجلات المسح الميداني بالذكاء الاصطناعي — اكتشاف المحلات عبر الكاميرا.')}</p>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : !q.data?.length
        ? <EmptyState icon={<Camera />} title={t('لا توجد سجلات مسح')} text={t('استخدم المسح الميداني في التطبيق لاكتشاف عملاء جدد.')} />
        : <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr>
              <th>{t('المشرف')}</th>
              <th>{t('الحالة')}</th>
              <th>{t('المحلات')}</th>
              <th>{t('التاريخ')}</th>
              <th>{t('الموقع')}</th>
            </tr></thead>
            <tbody>{q.data.map((r) => {
              const st = FS_STATUS[r.status] ?? { label: r.status, cls: 'b-gray' };
              return <tr key={r.id}>
                <td className="title">{r.supervisors?.full_name ?? '—'}</td>
                <td><span className={`badge ${st.cls}`}>{t(st.label)}</span></td>
                <td>{r.status === 'completed' ? <strong style={{ color: 'var(--color-success)' }}>{r.stores_found}</strong> : '—'}</td>
                <td className="muted" style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('ar-EG')}</td>
                <td className="muted" style={{ fontSize: 12 }} dir="ltr">
                  {r.latitude && r.longitude ? `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}` : '—'}
                </td>
              </tr>;
            })}</tbody>
          </table></div>}
  </>;
}

/* ---------- Orders (Opportunity / Sales Leads) ---------- */
export function AdminOrders() {
  const sups = useSupervisors();
  const regions = useRegions();
  const branches = useBranches();
  const [status, setStatus] = useState<string>('all');
  const [regionId, setRegionId] = useState<string>('all');
  const [branchId, setBranchId] = useState<string>('all');
  const [supId, setSupId] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  // Cascading branches based on selected region
  const filteredBranches = (branches.data ?? []).filter((b) =>
    regionId === 'all' ? true : b.region_id === regionId
  );

  // Cascading supervisors based on selected branch/region
  const filteredSupervisors = sups.items.filter((s) => {
    if (branchId !== 'all') return s.branch_id === branchId;
    if (regionId !== 'all') {
      const allowedBranchIds = new Set(filteredBranches.map((b) => b.id));
      return s.branch_id && allowedBranchIds.has(s.branch_id);
    }
    return true;
  });

  const q = useAdminOrders({
    status,
    supervisorId: supId,
    branchId: branchId !== 'all' ? branchId : undefined,
    regionId: regionId !== 'all' ? regionId : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search,
  });
  const updateStatus = useUpdateOrderStatus();
  const retry = useRefetch(q.refetch);

  const kpi = q.kpi;

  const handleExportOrders = () => {
    if (!q.data?.length) return;
    exportToCsv(
      `Orders_${new Date().toISOString().slice(0, 10)}`,
      [
        { header: t('تاريخ الأوردر'), accessor: (o) => fmtDate(o.order_date || o.created_at) },
        { header: t('المشرف'), accessor: (o) => o.supervisors?.full_name || '' },
        { header: t('العميل'), accessor: (o) => o.customers?.name || '' },
        { header: t('كود العميل'), accessor: (o) => o.customers?.customer_code || '' },
        { header: t('عنوان العميل'), accessor: (o) => o.customers?.address || '' },
        { header: t('عدد الأصناف'), accessor: (o) => o.items.length },
        { header: t('إجمالي الكمية'), accessor: (o) => o.items.reduce((s, it) => s + it.quantity, 0) },
        {
          header: t('الأصناف والكميات'),
          accessor: (o) =>
            o.items
              .map((it) => `${it.name} (${it.quantity}${it.unit ? ` ${it.unit}` : ''})`)
              .join(' ; '),
        },
        { header: t('الإجمالي (ج.م)'), accessor: (o) => o.total_amount },
        { header: t('الحالة'), accessor: (o) => (o.status === 'delivered' ? t('تم التسليم') : t('قيد المتابعة')) },
        { header: t('تاريخ التسليم'), accessor: (o) => (o.delivered_at ? fmtDate(o.delivered_at) : '') },
        { header: t('ملاحظات'), accessor: (o) => o.notes || '' },
      ],
      q.data
    );
  };

  return <>
    <div className="row between">
      <div>
        <h2>{t('أوردرات الشركة والفرص البيعية')}</h2>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          {t('الأوردرات التي يلتقطها المشرفون أثناء جولاتهم الميدانية لعرضها على المناديب. بمجرد تأكيد التسليم تصبح إنتاجية المشرف 100%.')}
        </p>
      </div>
      <div className="row gap-2 items-center">
        <button
          type="button"
          className="btn ghost"
          onClick={handleExportOrders}
          disabled={!q.data?.length}
          title={t('تصدير قائمة الأوردرات المصفاة إلى Excel')}
        >
          <Download size={16} /> {t('تصدير Excel')}
        </button>
        {q.data && <span className="badge b-blue" style={{ fontSize: 14 }}>{num(q.data.length)} {t('أوردر')}</span>}
      </div>
    </div>

    {/* KPI Summary Cards */}
    <div className="adm-kpis" style={{ marginTop: 12 }}>
      <div className="card col" style={{ padding: 14, gap: 4 }}>
        <span className="muted" style={{ fontSize: 12 }}>{t('إجمالي الأوردرات')}</span>
        <strong style={{ fontSize: 22 }}>{num(kpi.totalOrders)}</strong>
        <span className="muted" style={{ fontSize: 12 }}>{num(kpi.totalAmount)} {t('ج.م')}</span>
      </div>

      <div className="card col" style={{ padding: 14, gap: 4, borderRight: '4px solid #10B981' }}>
        <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>{t('تم التسليم')}</span>
        <strong style={{ fontSize: 22, color: '#10B981' }}>{num(kpi.deliveredOrders)}</strong>
        <span className="muted" style={{ fontSize: 12 }}>{num(kpi.deliveredAmount)} {t('ج.م')}</span>
      </div>

      <div className="card col" style={{ padding: 14, gap: 4, borderRight: '4px solid #F59E0B' }}>
        <span style={{ fontSize: 12, color: '#F59E0B', fontWeight: 600 }}>{t('قيد المتابعة')}</span>
        <strong style={{ fontSize: 22, color: '#F59E0B' }}>{num(kpi.pendingOrders)}</strong>
        <span className="muted" style={{ fontSize: 12 }}>{num(kpi.pendingAmount)} {t('ج.م')}</span>
      </div>

      <div className="card col" style={{ padding: 14, gap: 4, borderRight: '4px solid var(--color-primary)' }}>
        <span className="muted" style={{ fontSize: 12 }}>{t('نسبة التسليم (الإنتاجية)')}</span>
        <strong style={{ fontSize: 22, color: kpi.deliveryRate === 100 ? '#10B981' : 'var(--color-primary)' }}>
          {num(kpi.deliveryRate)}%
        </strong>
        <div style={{ width: '100%', height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
          <div style={{ width: `${kpi.deliveryRate}%`, height: '100%', background: kpi.deliveryRate === 100 ? '#10B981' : 'var(--color-primary)' }} />
        </div>
      </div>
    </div>

    {/* Filters Row */}
    <div className="card col" style={{ marginTop: 12, padding: '12px 14px', gap: 10 }}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>{t('من:')}</span>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ width: 140 }} />
        </div>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>{t('إلى:')}</span>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ width: 140 }} />
        </div>

        <select className="input" style={{ width: 150 }} value={regionId} onChange={(e) => {
          setRegionId(e.target.value);
          setBranchId('all');
          setSupId('all');
        }}>
          <option value="all">{t('كل الأقاليم')}</option>
          {regions.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        <select className="input" style={{ width: 150 }} value={branchId} onChange={(e) => {
          setBranchId(e.target.value);
          setSupId('all');
        }}>
          <option value="all">{t('كل الفروع')}</option>
          {filteredBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <select className="input" style={{ width: 160 }} value={supId} onChange={(e) => setSupId(e.target.value)}>
          <option value="all">{t('كل المشرفين')}</option>
          {filteredSupervisors.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>

        <select className="input" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">{t('كل الحالات')}</option>
          <option value="pending">{t('قيد المتابعة')}</option>
          <option value="delivered">{t('تم التسليم')}</option>
        </select>

        {(status !== 'all' || supId !== 'all' || branchId !== 'all' || regionId !== 'all' || dateFrom || dateTo || search) && (
          <button className="btn sm ghost" onClick={() => {
            setStatus('all');
            setRegionId('all');
            setBranchId('all');
            setSupId('all');
            setDateFrom('');
            setDateTo('');
            setSearch('');
          }}>
            {t('إعادة ضبط')}
          </button>
        )}
      </div>

      <input
        className="input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('بحث باسم العميل أو الكود أو المشرف أو الملاحظات...')}
      />
    </div>

    {/* Table */}
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} /> : !q.data?.length ? (
      <EmptyState
        icon={<ShoppingCart />}
        title={t('لا توجد أوردرات')}
        text={search || status !== 'all' || supId !== 'all' ? t('لا توجد نتائج مطابقة لخيارات التصفية.') : t('لم يسجل أي مشرف أوردرات أو فرص بيعية بعد.')}
      />
    ) : (
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>{t('التاريخ')}</th>
              <th>{t('المشرف')}</th>
              <th>{t('العميل')}</th>
              <th>{t('الأصناف والكميات')}</th>
              <th>{t('الإجمالي')}</th>
              <th>{t('الحالة')}</th>
              <th>{t('تاريخ التسليم')}</th>
              <th>{t('الإجراء')}</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((o) => {
              const isDelivered = o.status === 'delivered';
              const totalUnits = o.items.reduce((s, it) => s + it.quantity, 0);

              return (
                <tr key={o.id} data-testid={`admin-order-row-${o.id}`}>
                  <td className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                    {fmtDate(o.order_date || o.created_at)}
                  </td>
                  <td style={{ fontWeight: 600 }}>{o.supervisors?.full_name ?? '—'}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{o.customers?.name ?? t('عميل غير معروف')}</div>
                    {o.customers?.address && <div className="muted" style={{ fontSize: 11 }}>{o.customers.address}</div>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn sm ghost"
                      style={{ fontSize: 12, padding: '2px 8px' }}
                      onClick={() => setSelectedOrder(o)}
                    >
                      {t('{n} صنف', { n: num(o.items.length) })} ({num(totalUnits)} {t('وحدة')}) 🔍
                    </button>
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                    {num(o.total_amount)} {t('ج.م')}
                  </td>
                  <td>
                    <span className={`badge ${isDelivered ? 'b-green' : 'b-amber'}`} style={{ whiteSpace: 'nowrap' }}>
                      {isDelivered ? `✅ ${t('تم التسليم')}` : `⏳ ${t('قيد المتابعة')}`}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {o.delivered_at ? fmtDate(o.delivered_at) : '—'}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn sm"
                        style={{
                          background: '#25D366',
                          color: '#fff',
                          border: 'none',
                          padding: '3px 8px',
                          fontSize: 12,
                          borderRadius: 6,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          gap: 4,
                        }}
                        onClick={() => {
                          const msg = formatOrderWhatsAppMessage({
                            customerName: o.customers?.name,
                            customerAddress: o.customers?.address,
                            supervisorName: o.supervisors?.full_name,
                            supervisorPhone: o.supervisors?.phone,
                            orderDate: o.order_date || o.created_at,
                            items: o.items,
                            totalAmount: o.total_amount,
                            notes: o.notes,
                            latitude: o.customers?.latitude,
                            longitude: o.customers?.longitude,
                          });
                          openWhatsAppShare(msg);
                        }}
                        title={t('إرسال تفاصيل الفرصة للمندوب عبر واتساب')}
                      >
                        💬 {t('واتساب')}
                      </button>
                      {!isDelivered ? (
                        <button
                          className="btn sm success"
                          style={{ whiteSpace: 'nowrap', gap: 4 }}
                          disabled={updateStatus.isPending}
                          onClick={() => {
                            if (window.confirm(t('تأكيد تسليم الأوردر؟ سيتم رفع إنتاجية المشرف إلى 100%.'))) {
                              updateStatus.mutate({ id: o.id, status: 'delivered' });
                            }
                          }}
                          data-testid={`btn-deliver-order-${o.id}`}
                        >
                          <CheckCheck size={14} /> {t('تأكيد التسليم')}
                        </button>
                      ) : (
                        <button
                          className="btn sm ghost"
                          style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                          disabled={updateStatus.isPending}
                          onClick={() => {
                            if (window.confirm(t('إلغاء حالة التسليم وإعادة الأوردر لقيد المتابعة؟'))) {
                              updateStatus.mutate({ id: o.id, status: 'pending' });
                            }
                          }}
                        >
                          {t('إعادة للمتابعة')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}

    {/* Order Items Modal */}
    {selectedOrder && (
      <div className="adm-modal-bg" onClick={() => setSelectedOrder(null)}>
        <div className="adm-modal col" onClick={(e) => e.stopPropagation()} style={{ gap: 14 }}>
          <div className="row between">
            <h3 style={{ margin: 0 }}>📦 {t('تفاصيل الأوردر')}</h3>
            <button className="icon-btn" onClick={() => setSelectedOrder(null)}><X size={18} /></button>
          </div>

          <div className="card col" style={{ background: '#F8FAFC', padding: 12, gap: 4 }}>
            <div className="row between"><span>{t('العميل')}:</span><strong>{selectedOrder.customers?.name}</strong></div>
            <div className="row between"><span>{t('المشرف')}:</span><strong>{selectedOrder.supervisors?.full_name}</strong></div>
            <div className="row between"><span>{t('التاريخ')}:</span><span>{fmtDate(selectedOrder.order_date || selectedOrder.created_at)}</span></div>
            <div className="row between">
              <span>{t('الحالة')}:</span>
              <span className={`badge ${selectedOrder.status === 'delivered' ? 'b-green' : 'b-amber'}`}>
                {selectedOrder.status === 'delivered' ? t('تم التسليم') : t('قيد المتابعة')}
              </span>
            </div>
            {selectedOrder.delivered_at && (
              <div className="row between"><span>{t('تاريخ التسليم')}:</span><span>{fmtDate(selectedOrder.delivered_at)}</span></div>
            )}
            {selectedOrder.notes && (
              <div style={{ marginTop: 4, borderTop: '1px dashed var(--line)', paddingTop: 4 }}>
                <span className="muted">{t('ملاحظات المندوب')}:</span> {selectedOrder.notes}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('قائمة الأصناف المطلوبة')}:</div>
            <div className="adm-table-wrap">
              <table className="adm-table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>{t('الصنف')}</th>
                    <th>{t('الكمية')}</th>
                    <th>{t('سعر الوحدة')}</th>
                    <th>{t('الإجمالي')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((it, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{it.name}</td>
                      <td>{num(it.quantity)}</td>
                      <td>{num(it.unit_price)} {t('ج.م')}</td>
                      <td style={{ fontWeight: 700 }}>{num(it.unit_price * it.quantity)} {t('ج.م')}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#F8FAFC', fontWeight: 800 }}>
                    <td colSpan={3}>{t('الإجمالي النهائي')}</td>
                    <td style={{ color: 'var(--color-primary)', fontSize: 15 }}>
                      {num(selectedOrder.total_amount)} {t('ج.م')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="row between" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn"
                style={{
                  background: '#25D366',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '8px 14px',
                  borderRadius: 8,
                  gap: 6,
                }}
                onClick={() => {
                  const msg = formatOrderWhatsAppMessage({
                    customerName: selectedOrder.customers?.name,
                    customerAddress: selectedOrder.customers?.address,
                    supervisorName: selectedOrder.supervisors?.full_name,
                    supervisorPhone: selectedOrder.supervisors?.phone,
                    orderDate: selectedOrder.order_date || selectedOrder.created_at,
                    items: selectedOrder.items,
                    totalAmount: selectedOrder.total_amount,
                    notes: selectedOrder.notes,
                    latitude: selectedOrder.customers?.latitude,
                    longitude: selectedOrder.customers?.longitude,
                  });
                  openWhatsAppShare(msg);
                }}
              >
                💬 {t('إرسال للمندوب عبر واتساب')}
              </button>

              {selectedOrder.status !== 'delivered' && (
                <button
                  className="btn success"
                  disabled={updateStatus.isPending}
                  onClick={() => {
                    updateStatus.mutate({ id: selectedOrder.id, status: 'delivered' });
                    setSelectedOrder(null);
                  }}
                >
                  <CheckCheck size={16} /> {t('تأكيد التسليم الآن')}
                </button>
              )}
            </div>
            <button className="btn ghost" onClick={() => setSelectedOrder(null)}>{t('إغلاق')}</button>
          </div>
        </div>
      </div>
    )}
  </>;
}


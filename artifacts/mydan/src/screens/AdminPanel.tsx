import { memo, useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Package, ShieldCheck } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { canAdmin } from '@/lib/policy';
import { useSupervisors, useUpdateSupervisor } from '@/lib/data';
import { useAdminProducts, useSaveMonthlyTarget, useSaveSettings, type CatalogProduct } from '@/lib/screen-data';
import { PageTitle } from '@/components/Layout';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import { MONTHS } from '@/lib/format';
import type { Supervisor } from '@/types/database';
import CustomersScreen from './CustomersScreen';
import { Chip, SelectOption, useInput, useRefetch } from './shared';

const ROLE: Record<string, string> = { admin: 'مدير', supervisor: 'مشرف', super_admin: 'مدير أعلى' };
const TABS = [['sup', 'المشرفون'], ['cus', 'العملاء'], ['pro', 'المنتجات'], ['set', 'الإعدادات'], ['tar', 'الأهداف']] as const;
type Tab = typeof TABS[number][0];

const SupRow = memo(function SupRow({ s, self, onPatch }: { s: Supervisor; self: boolean; onPatch: (s: Supervisor, p: { is_active?: boolean; role?: 'admin' | 'supervisor' }) => void }) {
  const locked = self || s.role === 'super_admin';
  const toggle = useCallback(() => {
    if (!s.is_active || window.confirm(`تعطيل حساب ${s.full_name}؟`)) onPatch(s, { is_active: !s.is_active });
  }, [s, onPatch]);
  const role = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => onPatch(s, { role: e.target.value as 'admin' | 'supervisor' }), [s, onPatch]);
  return <div className="card col" data-testid={`card-supervisor-${s.id}`}>
    <div className="row between"><div className="grow"><div className="title">{s.full_name}{self && ' (أنت)'}</div><div className="muted" dir="ltr" style={{ textAlign: 'start' }}>{s.phone ?? '—'}</div></div>
      <span className={`badge ${s.is_active ? 'b-green' : 'b-red'}`}>{s.is_active ? 'نشط' : 'معطل'}</span></div>
    <div className="row"><span className="badge b-gray row" style={{ gap: 4 }}><ShieldCheck size={14} />{ROLE[s.role]}</span>
      {!locked && <>
        <select className="input grow" aria-label="الدور" value={s.role} onChange={role} data-testid={`select-role-${s.id}`}><option value="supervisor">مشرف</option><option value="admin">مدير</option></select>
        <button className={`btn sm ${s.is_active ? 'danger-ghost' : 'success'}`} onClick={toggle} data-testid={`button-toggle-${s.id}`}>{s.is_active ? 'تعطيل' : 'تفعيل'}</button></>}
    </div>
  </div>;
});
function Supervisors() {
  const { supervisor } = useAuth(); const q = useSupervisors(); const m = useUpdateSupervisor();
  const retry = useRefetch(q.refetch); const mutate = m.mutate; const onPatch = useCallback((target: Supervisor, patch: { is_active?: boolean; role?: 'admin' | 'supervisor' }) => mutate({ target, patch }), [mutate]);
  if (q.isPending) return <SkeletonList />;
  if (q.isError) return <ErrorState error={q.error} onRetry={retry} />;
  if (q.items.length === 0) return <EmptyState icon={<ShieldCheck />} title="لا يوجد مشرفون" />;
  return <>{q.items.map((s) => <SupRow key={s.id} s={s} self={s.id === supervisor?.id} onPatch={onPatch} />)}<LoadMore q={q} /></>;
}
const Product = memo(function Product({ p }: { p: CatalogProduct }) {
  return <div className="s-row"><Package size={20} /><div className="grow"><div className="title">{p.name}</div><div className="muted">{p.category}{p.sku ? ` · ${p.sku}` : ''}</div></div>
    <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}><span className={`badge ${p.is_active ? 'b-green' : 'b-gray'}`}>{p.is_active ? 'متاح' : 'متوقف'}</span></div></div>;
});
function Products() {
  const q = useAdminProducts(); const retry = useRefetch(q.refetch);
  if (q.isPending) return <SkeletonList />;
  if (q.isError) return <ErrorState error={q.error} onRetry={retry} />;
  if (q.items.length === 0) return <EmptyState icon={<Package />} title="لا توجد منتجات" />;
  return <>{q.items.map((p) => <Product key={p.id} p={p} />)}<LoadMore q={q} /></>;
}
function SettingsForm() {
  const s = useAppSettings(); const m = useSaveSettings();
  const [name, setName] = useState(s.app_name); const [color, setColor] = useState(s.primary_color);
  const [radius, setRadius] = useState(String(s.geofence_radius_m)); const [brand, setBrand] = useState(s.target_brand_name);
  const [comp, setComp] = useState(s.competitor_brands.join(', '));
  const onName = useInput(setName); const onColor = useInput(setColor); const onRadius = useInput(setRadius); const onBrand = useInput(setBrand); const onComp = useInput(setComp);
  const r = Number(radius); const okColor = /^#[0-9a-f]{6}$/i.test(color);
  const valid = name.trim() && okColor && radius.trim() !== '' && Number.isFinite(r) && r >= 0 && brand.trim();
  const submit = useCallback((e: FormEvent) => { e.preventDefault(); if (!valid) return;
    m.mutate({ app_name: name.trim(), primary_color: color, geofence_radius_m: r, target_brand_name: brand.trim(), competitor_brands: comp.split(/[,،]/).map((x) => x.trim()).filter(Boolean) }); }, [valid, m, name, color, r, brand, comp]);
  return <form className="card col" onSubmit={submit}>
    <label className="f">اسم التطبيق<input className="input" value={name} onChange={onName} data-testid="input-app-name" /></label>
    <label className="f">اللون الأساسي<div className="row"><input type="color" aria-label="اختيار اللون" value={okColor ? color : '#1A56DB'} onChange={onColor} style={{ width: 52, height: 48 }} /><input className="input" dir="ltr" value={color} onChange={onColor} /></div></label>
    {!okColor && <div className="alert err">اللون بصيغة #RRGGBB</div>}
    <label className="f">نطاق الزيارة (متر)<input className="input" type="number" min="0" value={radius} onChange={onRadius} /></label>
    <label className="f">العلامة المستهدفة<input className="input" value={brand} onChange={onBrand} /></label>
    <label className="f">العلامات المنافسة (مفصولة بفاصلة)<input className="input" value={comp} onChange={onComp} /></label>
    <button className="btn" disabled={!valid || m.isPending} data-testid="button-save-settings">{m.isPending ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</button>
  </form>;
}
function TargetForm() {
  const q = useSupervisors(); const m = useSaveMonthlyTarget(); const now = new Date();
  const [sid, setSid] = useState(''); const [month, setMonth] = useState(now.getMonth() + 1); const [year, setYear] = useState(now.getFullYear());
  const [v, setV] = useState(''); const [o, setO] = useState(''); const [a, setA] = useState('');
  const retry = useRefetch(q.refetch);
  const onSid = useInput(setSid); const onV = useInput(setV); const onO = useInput(setO); const onA = useInput(setA);
  const onMonth = useCallback((e: ChangeEvent<HTMLSelectElement>) => setMonth(Number(e.target.value)), []);
  const onYear = useCallback((e: ChangeEvent<HTMLInputElement>) => setYear(Number(e.target.value)), []);
  const nums = useMemo(() => [v, o, a].map(Number), [v, o, a]); const valid = sid && nums.every((n) => Number.isSafeInteger(n) && n >= 0) && v !== '' && o !== '' && a !== '';
  const submit = useCallback((e: FormEvent) => { e.preventDefault(); if (!valid) return;
    m.mutate({ supervisor_id: sid, month, year, visits_target: nums[0], orders_target: nums[1], audit_target: nums[2] }); }, [valid, m, sid, month, year, nums]);
  if (q.isError) return <ErrorState error={q.error} onRetry={retry} />;
  return <form className="card col" onSubmit={submit}>
    <label className="f">المشرف<select className="input" value={sid} onChange={onSid} disabled={q.isPending} data-testid="select-target-supervisor">
      <option value="">{q.isPending ? 'جاري التحميل...' : 'اختر مشرفا'}</option>{q.items.map((s) => <SelectOption key={s.id} value={s.id} label={s.full_name} />)}</select></label>
    <LoadMore q={q} />
    <div className="row"><label className="f grow">الشهر<select className="input" value={month} onChange={onMonth}>{MONTHS.map((n, i) => <SelectOption key={n} value={i + 1} label={n} />)}</select></label>
      <label className="f grow">السنة<input className="input" type="number" value={year} onChange={onYear} /></label></div>
    <label className="f">هدف الزيارات<input className="input" type="number" min="0" inputMode="numeric" value={v} onChange={onV} /></label>
    <label className="f">هدف أوامر البيع<input className="input" type="number" min="0" step="1" inputMode="numeric" value={o} onChange={onO} /></label>
    <label className="f">هدف مراجعات الرف<input className="input" type="number" min="0" step="1" inputMode="numeric" value={a} onChange={onA} /></label>
    <button className="btn" disabled={!valid || m.isPending} data-testid="button-save-target">{m.isPending ? 'جاري الحفظ...' : 'حفظ الهدف'}</button>
  </form>;
}
export default function AdminPanel() {
  const { supervisor } = useAuth(); const settings = useAppSettings(); const [tab, setTab] = useState<Tab>('sup');
  const onTab = useCallback((v: string) => setTab(v as Tab), []);
  if (!canAdmin(supervisor)) return <div className="page"><div className="alert err">هذه الصفحة للمدراء فقط.</div></div>;
  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle>إدارة الشركة</PageTitle>
    <div className="tabs" role="tablist">{TABS.map(([k, l]) => <Chip key={k} role="tab" value={k} label={l} active={tab === k} onSelect={onTab} testId={`admin-tab-${k}`} />)}</div>
    {tab === 'sup' && <Supervisors />}
    {tab === 'cus' && <CustomersScreen embedded />}
    {tab === 'pro' && <Products />}
    {tab === 'set' && <SettingsForm />}
    {tab === 'tar' && <TargetForm />}
  </div>;
}

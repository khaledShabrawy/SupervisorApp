import { memo, useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useScope } from '@/lib/data';
import { Package, ShieldCheck, Trash2, X } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { canAdmin } from '@/lib/policy';
import { useSupervisors, useUpdateSupervisor } from '@/lib/data';
import { notify } from '@/lib/toast';
import { useAdminProducts, useSaveMonthlyTarget, useSaveSettings, type CatalogProduct } from '@/lib/screen-data';
import { useBranches, useDeleteAssetType } from '@/lib/admin-data';
import { PageTitle } from '@/components/Layout';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import { MONTHS } from '@/lib/format';
import type { Supervisor } from '@/types/database';
import CustomersScreen from './CustomersScreen';
import { Chip, SelectOption, useInput, useRefetch } from './shared';
import { t } from '@/i18n';

export const ROLE: Record<string, string> = { admin: t('مدير'), supervisor: t('مشرف'), senior_supervisor: t('مشرف أول'), branch_manager: t('مدير فرع'), super_admin: t('مدير أعلى') };
type AssetType = { id: string; name_ar: string; name_en: string | null; icon: string; color: string; requires_qr: boolean; is_active: boolean };

function useAssetTypes() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'asset-types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('asset_types').select('id,name_ar,name_en,icon,color,requires_qr,is_active').eq('company_id', sc.companyId).order('name_ar');
      if (error) throw new Error(t('تعذر تحميل أنواع الأصول.'));
      return data as AssetType[];
    },
  });
}

function useSaveAssetType() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; name_ar: string; name_en: string; icon: string; color: string; requires_qr: boolean }) => {
      const values = { name_ar: input.name_ar.trim(), name_en: input.name_en.trim(), icon: input.icon.trim(),
        color: input.color, requires_qr: input.requires_qr };
      if (!values.name_ar || !values.icon || !/^#[0-9a-f]{6}$/i.test(values.color)) throw new Error(t('بيانات نوع الأصل غير صالحة.'));
      if (input.id) {
        const { data, error } = await supabase.from('asset_types').update(values)
          .eq('id', input.id).eq('company_id', sc.companyId).select('id').single();
        if (error || !data) throw new Error(t('لم يتم تحديث نوع الأصل. تحقق من وجوده وصلاحية التعديل.'));
      } else {
        const { error } = await supabase.from('asset_types').insert({ ...values, company_id: sc.companyId });
        if (error) throw new Error(t('تعذر إضافة نوع الأصل.'));
      }
    },
    onSuccess: () => { notify(t('تم حفظ نوع الأصل'), 'success'); qc.invalidateQueries({ queryKey: [...sc.base, 'asset-types'] }); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function AssetTypes() {
  const q = useAssetTypes(); const m = useSaveAssetType(); const retry = useRefetch(q.refetch);
  const del = useDeleteAssetType();
  const [show, setShow] = useState(false); const [edit, setEdit] = useState<AssetType | null>(null);
  const [nameAr, setNameAr] = useState(''); const [nameEn, setNameEn] = useState(''); const [icon, setIcon] = useState('📦'); const [color, setColor] = useState('#1A56DB'); const [qr, setQr] = useState(true);
  const openNew = useCallback(() => { setEdit(null); setNameAr(''); setNameEn(''); setIcon('📦'); setColor('#1A56DB'); setQr(true); setShow(true); }, []);
  const openEdit = useCallback((a: AssetType) => { setEdit(a); setNameAr(a.name_ar); setNameEn(a.name_en ?? ''); setIcon(a.icon); setColor(a.color); setQr(a.requires_qr); setShow(true); }, []);
  const close = useCallback(() => setShow(false), []);
  const onNameAr = useInput(setNameAr); const onNameEn = useInput(setNameEn); const onIcon = useInput(setIcon); const onColor = useInput(setColor);
  const onQr = useCallback((e: ChangeEvent<HTMLInputElement>) => setQr(e.target.checked), []);
  const valid = nameAr.trim() && icon.trim() && /^#[0-9a-f]{6}$/i.test(color);
  const save = useCallback((e: FormEvent) => { e.preventDefault(); if (!valid) return; m.mutate({ id: edit?.id, name_ar: nameAr, name_en: nameEn, icon, color, requires_qr: qr }, { onSuccess: close }); }, [m, edit, nameAr, nameEn, icon, color, qr, valid, close]);
  return <>
    <button className="btn sm" onClick={openNew}>{t('+ إضافة نوع أصل')}</button>
    {show && (
      <div className="adm-modal-bg" onClick={close}>
        <form className="adm-modal col" role="dialog" aria-modal="true" aria-label={edit ? t('تعديل نوع الأصل') : t('نوع أصل جديد')} onClick={(e) => e.stopPropagation()} onSubmit={save}>
          <div className="row between">
            <h2 style={{ margin: 0, fontSize: 18 }}>{edit ? t('تعديل نوع الأصل') : t('نوع أصل جديد')}</h2>
            <button type="button" className="icon-btn" aria-label={t('إغلاق')} onClick={close}><X /></button>
          </div>
          <label className="f">{t('الاسم بالعربي *')}<input className="input" value={nameAr} onChange={onNameAr} placeholder={t('ثلاجة عرض')} /></label>
          <label className="f">{t('الاسم بالإنجليزي')}<input className="input" value={nameEn} onChange={onNameEn} placeholder="Display Cooler" /></label>
          <label className="f">{t('الأيقونة')}<input className="input" value={icon} onChange={onIcon} placeholder="🧊" /></label>
          <label className="f">{t('اللون')}<div className="row"><input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#1A56DB'} onChange={onColor} style={{ width: 52, height: 48 }} /><input className="input" value={color} onChange={onColor} dir="ltr" /></div></label>
          <label className="row" style={{ minHeight: 44 }}><input type="checkbox" checked={qr} onChange={onQr} style={{ width: 24, height: 24 }} /> {t('يتطلب QR Code')}</label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" disabled={!valid || m.isPending}>{m.isPending ? t('جاري الحفظ...') : t('حفظ')}</button>
            <button type="button" className="btn ghost" onClick={close}>{t('إلغاء')}</button>
          </div>
        </form>
      </div>
    )}
    {q.isPending ? <SkeletonList n={3} /> : q.isError ? <ErrorState error={q.error} onRetry={retry} /> : !q.data?.length ? <EmptyState icon={<Package />} title={t('لا توجد أنواع أصول')} action={{ label: t('إضافة نوع'), onClick: openNew }} /> :
      q.data.map((a) => <div key={a.id} className="card col" style={{ borderRight: `4px solid ${a.color}` }}>
        <div className="row between">
          <div className="row" style={{ gap: 12 }}>
            <span style={{ fontSize: 28 }}>{a.icon}</span>
            <div>
              <div className="title">{a.name_ar}</div>
              {a.name_en && <div className="muted" dir="ltr">{a.name_en}</div>}
            </div>
          </div>
          <div className="row gap-1">
            <button className="btn sm ghost" onClick={() => openEdit(a)}>{t('تعديل')}</button>
            <button
              className="btn sm ghost danger"
              title={t('حذف')}
              disabled={del.isPending}
              onClick={() => {
                if (window.confirm(t('هل أنت متأكد من حذف نوع الأصل هذا؟'))) {
                  del.mutate(a.id);
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>{a.requires_qr && <span className="badge b-blue">{t('يتطلب QR')}</span>}<span className={`badge ${a.is_active ? 'b-green' : 'b-gray'}`}>{a.is_active ? t('نشط') : t('متوقف')}</span></div>
      </div>)}
  </>;
}

const TABS = [['sup', t('المشرفون')], ['cus', t('العملاء')], ['pro', t('المنتجات')], ['ast', t('الأصول')], ['set', t('الإعدادات')], ['tar', t('الأهداف')]] as const;
type Tab = typeof TABS[number][0];

const SupRow = memo(function SupRow({ s, self, onPatch }: { s: Supervisor; self: boolean; onPatch: (s: Supervisor, p: { is_active?: boolean; role?: 'admin' | 'supervisor' }) => void }) {
  const locked = self || s.role === 'super_admin';
  const toggle = useCallback(() => {
    if (!s.is_active || window.confirm(t('تعطيل حساب {name}؟', { name: s.full_name }))) onPatch(s, { is_active: !s.is_active });
  }, [s, onPatch]);
  const role = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => onPatch(s, { role: e.target.value as 'admin' | 'supervisor' }), [s, onPatch]);
  return <div className="card col" data-testid={`card-supervisor-${s.id}`}>
    <div className="row between"><div className="grow"><div className="title">{s.full_name}{self && t(' (أنت)')}</div><div className="muted" dir="ltr" style={{ textAlign: 'start' }}>{s.phone ?? '—'}</div></div>
      <span className={`badge ${s.is_active ? 'b-green' : 'b-red'}`}>{s.is_active ? t('نشط') : t('معطل')}</span></div>
    <div className="row"><span className="badge b-gray row" style={{ gap: 4 }}><ShieldCheck size={14} />{ROLE[s.role]}</span>
      {!locked && <>
        <select className="input grow" aria-label={t('الدور')} value={s.role} onChange={role} data-testid={`select-role-${s.id}`}><option value="supervisor">{t('مشرف')}</option><option value="admin">{t('مدير')}</option></select>
        <button className={`btn sm ${s.is_active ? 'danger-ghost' : 'success'}`} onClick={toggle} data-testid={`button-toggle-${s.id}`}>{s.is_active ? t('تعطيل') : t('تفعيل')}</button></>}
    </div>
  </div>;
});
function Supervisors() {
  const { supervisor } = useAuth(); const q = useSupervisors(); const m = useUpdateSupervisor();
  const retry = useRefetch(q.refetch); const mutate = m.mutate; const onPatch = useCallback((target: Supervisor, patch: { is_active?: boolean; role?: 'admin' | 'supervisor' }) => mutate({ target, patch }), [mutate]);
  if (q.isPending) return <SkeletonList />;
  if (q.isError) return <ErrorState error={q.error} onRetry={retry} />;
  if (q.items.length === 0) return <EmptyState icon={<ShieldCheck />} title={t('لا يوجد مشرفون')} />;
  return <>{q.items.map((s) => <SupRow key={s.id} s={s} self={s.id === supervisor?.id} onPatch={onPatch} />)}<LoadMore q={q} /></>;
}
const Product = memo(function Product({ p }: { p: CatalogProduct }) {
  return <div className="s-row"><Package size={20} /><div className="grow"><div className="title">{p.name}</div><div className="muted">{p.category}{p.sku ? ` · ${p.sku}` : ''}</div></div>
    <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}><span className={`badge ${p.is_active ? 'b-green' : 'b-gray'}`}>{p.is_active ? t('متاح') : t('متوقف')}</span></div></div>;
});
function Products() {
  const q = useAdminProducts(); const retry = useRefetch(q.refetch);
  if (q.isPending) return <SkeletonList />;
  if (q.isError) return <ErrorState error={q.error} onRetry={retry} />;
  if (q.items.length === 0) return <EmptyState icon={<Package />} title={t('لا توجد منتجات')} />;
  return <>{q.items.map((p) => <Product key={p.id} p={p} />)}<LoadMore q={q} /></>;
}
export function SettingsForm() {
  const s = useAppSettings(); const m = useSaveSettings();
  const [name, setName] = useState(s.app_name); const [color, setColor] = useState(s.primary_color);
  const [radius, setRadius] = useState(String(s.geofence_radius_m)); const [brand, setBrand] = useState(s.target_brand_name);
  const [comp, setComp] = useState(s.competitor_brands.join(', '));
  const [allowPwChange, setAllowPwChange] = useState(s.allow_password_change ?? true);
  const [allowForgotPw, setAllowForgotPw] = useState(s.allow_forgot_password ?? true);
  const [pwExpiryEnabled, setPwExpiryEnabled] = useState(s.password_expiry_enabled ?? false);
  const [pwExpiryDays, setPwExpiryDays] = useState(String(s.password_expiry_days ?? 90));
  const [branchMode, setBranchMode] = useState(s.branch_lock_mode ?? 'auto_supervisor_branch');

  const onName = useInput(setName); const onColor = useInput(setColor); const onRadius = useInput(setRadius); const onBrand = useInput(setBrand); const onComp = useInput(setComp);
  const r = Number(radius); const okColor = /^#[0-9a-f]{6}$/i.test(color);
  const valid = name.trim() && okColor && radius.trim() !== '' && Number.isFinite(r) && r >= 0 && brand.trim();

  const submit = useCallback((e: FormEvent) => {
    e.preventDefault(); if (!valid) return;
    m.mutate({
      app_name: name.trim(),
      primary_color: color,
      geofence_radius_m: r,
      target_brand_name: brand.trim(),
      competitor_brands: comp.split(/[,،]/).map((x) => x.trim()).filter(Boolean),
      allow_password_change: allowPwChange,
      allow_forgot_password: allowForgotPw,
      password_expiry_enabled: pwExpiryEnabled,
      password_expiry_days: Number(pwExpiryDays) || 90,
      branch_lock_mode: branchMode,
    });
  }, [valid, m, name, color, r, brand, comp, allowPwChange, allowForgotPw, pwExpiryEnabled, pwExpiryDays, branchMode]);

  return <form className="card col" onSubmit={submit}>
    <div className="title" style={{ fontSize: 16 }}>{t('هوية الشركة والمظهر')}</div>
    <label className="f">{t('اسم التطبيق')}<input className="input" value={name} onChange={onName} data-testid="input-app-name" /></label>
    <label className="f">{t('اللون الأساسي')}<div className="row"><input type="color" aria-label={t('اختيار اللون')} value={okColor ? color : '#1A56DB'} onChange={onColor} style={{ width: 52, height: 48 }} /><input className="input" dir="ltr" value={color} onChange={onColor} /></div></label>
    {!okColor && <div className="alert err">{t('اللون بصيغة #RRGGBB')}</div>}
    <label className="f">{t('نطاق الزيارة (متر)')}<input className="input" type="number" min="0" value={radius} onChange={onRadius} /></label>
    <label className="f">{t('العلامة المستهدفة')}<input className="input" value={brand} onChange={onBrand} /></label>
    <label className="f">{t('العلامات المنافسة (مفصولة بفاصلة)')}<input className="input" value={comp} onChange={onComp} /></label>

    <div className="title" style={{ fontSize: 16, marginTop: 14 }}>{t('الأمان وسياسات تسجيل الدخول')}</div>
    <label className="row" style={{ minHeight: 40, gap: 10, cursor: 'pointer' }}>
      <input type="checkbox" checked={allowPwChange} onChange={(e) => setAllowPwChange(e.target.checked)} style={{ width: 20, height: 20 }} />
      <span>{t('السماح للمستخدم بتغيير كلمة السر الخاصة به')}</span>
    </label>
    <label className="row" style={{ minHeight: 40, gap: 10, cursor: 'pointer' }}>
      <input type="checkbox" checked={allowForgotPw} onChange={(e) => setAllowForgotPw(e.target.checked)} style={{ width: 20, height: 20 }} />
      <span>{t('تفعيل خاصية "نسيت كلمة المرور" الذاتية')}</span>
    </label>
    <label className="row" style={{ minHeight: 40, gap: 10, cursor: 'pointer' }}>
      <input type="checkbox" checked={pwExpiryEnabled} onChange={(e) => setPwExpiryEnabled(e.target.checked)} style={{ width: 20, height: 20 }} />
      <span>{t('تفعيل انتهاء صلاحية الباسورد دورياً وإجبار المستخدم على التغيير')}</span>
    </label>
    {pwExpiryEnabled && (
      <label className="f" style={{ marginInlineStart: 28 }}>
        {t('مدة الصلاحية (بالأيام)')}
        <input className="input" type="number" min={15} max={365} value={pwExpiryDays} onChange={(e) => setPwExpiryDays(e.target.value)} />
      </label>
    )}

    <label className="f" style={{ marginTop: 8 }}>
      {t('تحديد الفرع عند الدخول')}
      <select className="input" value={branchMode} onChange={(e) => setBranchMode(e.target.value as 'auto_supervisor_branch' | 'manual_selection')}>
        <option value="auto_supervisor_branch">{t('فتح فرع المشرف تلقائياً (مثل SalesBuzz)')}</option>
        <option value="manual_selection">{t('السماح باختيار الفرع من الخارج')}</option>
      </select>
    </label>

    <button className="btn" disabled={!valid || m.isPending} data-testid="button-save-settings" style={{ marginTop: 12 }}>
      {m.isPending ? t('جاري الحفظ...') : t('حفظ الإعدادات')}
    </button>
  </form>;
}
export function TargetForm() {
  const q = useSupervisors();
  const branches = useBranches();
  const m = useSaveMonthlyTarget();
  const now = new Date();

  const [criteria, setCriteria] = useState<'visits' | 'shelf_audit' | 'orders' | 'new_opportunity'>('visits');
  const [scopeType, setScopeType] = useState<'per_user' | 'general'>('per_user');
  const [targetScope, setTargetScope] = useState<'all_branches' | 'specific_branch'>('all_branches');
  const [branchId, setBranchId] = useState('');
  const [sid, setSid] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [v, setV] = useState('50');
  const [a, setA] = useState('25');
  const [targetAmount, setTargetAmount] = useState('');

  const retry = useRefetch(q.refetch);
  const onSid = useInput(setSid);
  const onV = useInput(setV);
  const onA = useInput(setA);
  const onBranchId = useInput(setBranchId);
  const onTargetAmount = useInput(setTargetAmount);
  const onMonth = useCallback((e: ChangeEvent<HTMLSelectElement>) => setMonth(Number(e.target.value)), []);
  const onYear = useCallback((e: ChangeEvent<HTMLInputElement>) => setYear(Number(e.target.value)), []);

  const valid = (scopeType === 'general' || Boolean(sid)) &&
    (targetScope === 'all_branches' || Boolean(branchId)) &&
    (criteria === 'orders' ? (Number(targetAmount) > 0 || Number(v) > 0) : Number(v) >= 0);

  const submit = useCallback((e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    m.mutate({
      supervisor_id: scopeType === 'per_user' ? sid : null,
      month,
      year,
      visits_target: Number(v) || 0,
      audit_target: Number(a) || 0,
      criteria,
      scope_type: scopeType,
      target_scope: targetScope,
      branch_id: targetScope === 'specific_branch' ? branchId : null,
      target_amount: Number(targetAmount) || 0,
    });
  }, [valid, m, sid, month, year, v, a, criteria, scopeType, targetScope, branchId, targetAmount]);

  if (q.isError) return <ErrorState error={q.error} onRetry={retry} />;

  return (
    <form className="card col" onSubmit={submit} style={{ gap: 12 }}>
      {/* Criteria */}
      <label className="f">
        {t('نوع الهدف (Criteria) *')}
        <select className="input" value={criteria} onChange={(e) => setCriteria(e.target.value as any)}>
          <option value="visits">{t('زيارات ميدانية')}</option>
          <option value="shelf_audit">{t('مراجعات الرف (Shelf Audits)')}</option>
          <option value="orders">{t('فرص بيعية وأوردرات')}</option>
          <option value="new_opportunity">{t('استقطاب عملاء جدد (Prospects)')}</option>
        </select>
      </label>

      {/* Scope Parameters: Role/Target application */}
      <div className="row" style={{ gap: 12 }}>
        <label className="f grow">
          {t('تطبيق الهدف')}
          <select className="input" value={scopeType} onChange={(e) => setScopeType(e.target.value as any)}>
            <option value="per_user">{t('لكل مستخدم على حدة (Individual)')}</option>
            <option value="general">{t('هدف عام مشترك للجميع (General Team)')}</option>
          </select>
        </label>

        <label className="f grow">
          {t('نطاق الفروع')}
          <select className="input" value={targetScope} onChange={(e) => setTargetScope(e.target.value as any)}>
            <option value="all_branches">{t('كل الفروع')}</option>
            <option value="specific_branch">{t('فرع محدد')}</option>
          </select>
        </label>
      </div>

      {targetScope === 'specific_branch' && (
        <label className="f">
          {t('اختر الفرع المستهدف *')}
          <select className="input" value={branchId} onChange={onBranchId} required>
            <option value="">{t('اختر الفرع')}</option>
            {branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      )}

      {scopeType === 'per_user' && (
        <label className="f">
          {t('المستخدم / المشرف المستهدف *')}
          <select className="input" value={sid} onChange={onSid} disabled={q.isPending} required>
            <option value="">{q.isPending ? t('جاري التحميل...') : t('اختر المستخدم')}</option>
            {q.items.map((s) => <SelectOption key={s.id} value={s.id} label={s.full_name} />)}
          </select>
        </label>
      )}

      <div className="row">
        <label className="f grow">{t('الشهر')}<select className="input" value={month} onChange={onMonth}>{MONTHS.map((n, i) => <SelectOption key={n} value={i + 1} label={n} />)}</select></label>
        <label className="f grow">{t('السنة')}<input className="input" type="number" value={year} onChange={onYear} /></label>
      </div>

      <div className="row">
        <label className="f grow">
          {criteria === 'orders' ? t('هدف عدد الأوردرات') : t('هدف الزيارات')}
          <input className="input" type="number" min="0" inputMode="numeric" value={v} onChange={onV} />
        </label>
        <label className="f grow">
          {t('هدف مراجعات الرف')}
          <input className="input" type="number" min="0" step="1" inputMode="numeric" value={a} onChange={onA} />
        </label>
      </div>

      {criteria === 'orders' && (
        <label className="f">
          {t('هدف القيمة البيعية (بالجنيه)')}
          <input className="input" type="number" min="0" value={targetAmount} onChange={onTargetAmount} placeholder="مثال: 50000" />
        </label>
      )}

      <button className="btn" disabled={!valid || m.isPending} data-testid="button-save-target" style={{ marginTop: 6 }}>
        {m.isPending ? t('جاري الحفظ...') : t('حفظ الهدف')}
      </button>
    </form>
  );
}
export default function AdminPanel() {
  const { supervisor } = useAuth(); const settings = useAppSettings(); const [tab, setTab] = useState<Tab>('sup');
  const onTab = useCallback((v: string) => setTab(v as Tab), []);
  if (!canAdmin(supervisor)) return <div className="page"><div className="alert err">{t('هذه الصفحة للمدراء فقط.')}</div></div>;
  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle>{t('إدارة الشركة')}</PageTitle>
    <div className="tabs" role="tablist">{TABS.map(([k, l]) => <Chip key={k} role="tab" value={k} label={l} active={tab === k} onSelect={onTab} testId={`admin-tab-${k}`} />)}</div>
    {tab === 'sup' && <Supervisors />}
    {tab === 'cus' && <CustomersScreen embedded />}
    {tab === 'pro' && <Products />}
    {tab === 'ast' && <AssetTypes />}
    {tab === 'set' && <SettingsForm />}
    {tab === 'tar' && <TargetForm />}
  </div>;
}

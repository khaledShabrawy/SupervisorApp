import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { supabase } from './supabase';
import { usePaged, useScope, type VisitRow } from './data';
import { CUSTOMER_COLUMNS, SETTINGS_COLUMNS, VISIT_JOIN } from './columns';
import { CUSTOMER_TYPES, dateKey, progressPercent, visitDateRange } from './screen-helpers';
import { canAdmin, validateSettings } from './policy';
import { readAllRows, readExactCount } from './read-count';
import { notify } from './toast';
import { countTargetRecord } from './execution-records';
import type { AppSettings, Customer, Target } from '@/types/database';
export { useUploadAudit, useRequestAuditAnalysis, useAuditResult, useVisitAudits } from './screen-audit';

export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  sku?: string;
  item_code?: string;
  master_brand?: string;
  sub_brand?: string;
  units_per_carton?: number;
  carton_price?: number;
  unit?: string;
  price?: number;
  is_active: boolean;
};
export type SettingsInput = Pick<AppSettings, 'app_name' | 'primary_color' | 'geofence_radius_m' | 'target_brand_name' | 'competitor_brands'> &
  Partial<Pick<AppSettings, 'logo_url' | 'allow_password_change' | 'allow_forgot_password' | 'password_expiry_enabled' | 'password_expiry_days' | 'branch_lock_mode'>>;
export type MonthlyTargetInput = {
  supervisor_id?: string | null;
  month: number;
  year: number;
  visits_target: number;
  audit_target: number;
  criteria?: string;
  scope_type?: 'per_user' | 'general';
  target_scope?: 'all_branches' | 'specific_branch';
  branch_id?: string | null;
  target_amount?: number;
};
type Scope = ReturnType<typeof useScope>;
const errorMessage = (message: string, error: { message: string } | null) => {
  if (error) throw new Error(message);
};
async function countRows(sc: Scope, table: string, signal: AbortSignal, build: (q: any) => any) {
  return readExactCount(head => build(sc.scope(supabase.from(table).select('id', { count: 'exact', head }))),
    signal, 'تعذر حساب الإحصائيات. تحقق من الاتصال والصلاحيات.');
}
function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1), end = new Date(year, month, 1);
  return { start: dateKey(start), end: dateKey(end), startIso: start.toISOString(), endIso: end.toISOString() };
}
type TargetValues = Pick<Target, 'visits_target' | 'audit_target'>;
const targetSum = (rows: TargetValues[], field: keyof TargetValues) =>
  rows.reduce((sum, row) => sum + Number(row[field]), 0);
function targetsFor(sc: Scope, month: number, year: number, signal: AbortSignal) {
  return readAllRows<TargetValues & { id: string }>(() => sc.scope(supabase.from('targets').select('id,visits_target,audit_target'))
    .eq('month', month).eq('year', year), signal, 'تعذر تحميل الأهداف. تحقق من الاتصال والصلاحيات.');
}

export function useScreenDashboard() {
  const sc = useScope(), day = visitDateRange('today'), now = new Date();
  const month = now.getMonth() + 1, year = now.getFullYear(), mr = monthRange(year, month);
  return useQuery({
    queryKey: [...sc.base, 'dashboard', 'task-execution', day.start], retry: 1, gcTime: 300_000,
    queryFn: async ({ signal }) => {
      const [visits, audits, actualVisits, targets, recent] = await Promise.all([
        countRows(sc, 'visits', signal, q => q.eq('visit_date', day.start)),
        countRows(sc, 'shelf_audit', signal, q => q.gte('created_at', day.startIso).lt('created_at', day.endIso)),
        countRows(sc, 'visits', signal, q => q.eq('status', 'completed').gte('visit_date', mr.start).lt('visit_date', mr.end)),
        targetsFor(sc, month, year, signal),
        sc.scope(supabase.from('visits').select(VISIT_JOIN)).order('visit_date', { ascending: false })
          .order('check_in_time', { ascending: false, nullsFirst: false }).order('id').limit(5).abortSignal(signal),
      ]);
      errorMessage('تعذر تحميل أحدث الزيارات.', recent.error);
      return { visits, audits, visitsProgress: progressPercent(actualVisits, targetSum(targets, 'visits_target')),
        recent: recent.data as VisitRow[] };
    },
  });
}
export function useVisitsRange(period: 'today' | 'week' | 'month') {
  const sc = useScope(), dates = visitDateRange(period);
  return usePaged<VisitRow>(sc, 'visits', ['period', period, dates.start], async (from, to, signal) => {
    const r = await sc.scope(supabase.from('visits').select(VISIT_JOIN))
      .gte('visit_date', dates.start).lt('visit_date', dates.end)
      .order('visit_date', { ascending: false }).order('check_in_time', { ascending: false, nullsFirst: false })
      .order('id').range(from, to).abortSignal(signal);
    errorMessage('تعذر تحميل الزيارات.', r.error);
    return r.data as VisitRow[];
  });
}
export function useCustomerCards(search: string, type: string) {
  const sc = useScope(), term = search.trim().replace(/[%,()]/g, ' ');
  return usePaged<CustomerCardRow>(sc, 'customers', ['cards', term, type], async (from, to, signal) => {
    let q = sc.scope(supabase.from('customers').select(`${CUSTOMER_COLUMNS},visits(check_in_time)`));
    if (term) q = q.or(`name.ilike.%${term}%,customer_code.ilike.%${term}%,address.ilike.%${term}%`);
    if (type === 'أخرى') {
      const known = Object.entries(CUSTOMER_TYPES).filter(([key]) => key !== 'أخرى').flatMap(([, values]) => values);
      q = q.not('customer_type', 'in', `(${known.map(value => `"${value}"`).join(',')})`);
    } else if (type && type !== 'all') q = q.in('customer_type', CUSTOMER_TYPES[type] ?? [type]);
    const r = await q.order('name').order('id').order('check_in_time', { referencedTable: 'visits', ascending: false })
      .limit(1, { referencedTable: 'visits' }).range(from, to).abortSignal(signal);
    errorMessage('تعذر تحميل العملاء.', r.error);
    return (r.data as (Customer & { visits: { check_in_time: string }[] })[])
      .map(({ visits, ...c }) => ({ ...c, last_visit: visits?.[0]?.check_in_time ?? null }));
  });
}
export function useCustomerHistory(id: string | null) {
  const sc = useScope();
  return usePaged<VisitRow>(sc, 'visits', ['customer-history', id], async (from, to, signal) => {
    const r = await sc.scope(supabase.from('visits').select(VISIT_JOIN)).eq('customer_id', id!)
      .order('visit_date', { ascending: false }).order('id').range(from, to).abortSignal(signal);
    errorMessage('تعذر تحميل سجل زيارات العميل.', r.error);
    return r.data as VisitRow[];
  }, !!id);
}
export function useCustomerById(id: string | null) {
  const sc = useScope();
  return useQuery({ queryKey: [...sc.base, 'customers', 'selected', id], enabled: !!id, retry: 1,
    queryFn: async ({ signal }) => {
      const r = await sc.scope(supabase.from('customers').select(CUSTOMER_COLUMNS)).eq('id', id!)
        .eq('is_active', true).abortSignal(signal).single();
      errorMessage('تعذر تحميل العميل المحدد.', r.error);
      return r.data as Customer;
    } });
}
export function useMonthlyTargets() {
  const sc = useScope(), now = new Date(), month = now.getMonth() + 1, year = now.getFullYear();
  return useQuery({
    queryKey: [...sc.base, 'targets', 'task-progress', month, year], retry: 1, staleTime: 60_000, gcTime: 300_000,
    queryFn: async ({ signal }) => Promise.all(Array.from({ length: 4 }, async (_, index): Promise<MonthProgress> => {
      const d = new Date(year, month - 1 - index, 1), m = d.getMonth() + 1, y = d.getFullYear(), range = monthRange(y, m);
      const [targets, actual_visits, actual_audits] = await Promise.all([
        targetsFor(sc, m, y, signal),
        countRows(sc, 'visits', signal, q => q.eq('status', 'completed').gte('visit_date', range.start).lt('visit_date', range.end)),
        countRows(sc, 'shelf_audit', signal, q => q.eq('status', 'completed').gte('audited_at', range.startIso).lt('audited_at', range.endIso)),
      ]);
      return { month: m, year: y, visits_target: targetSum(targets, 'visits_target'),
        audit_target: targetSum(targets, 'audit_target'), actual_visits, actual_audits };
    })),
  });
}
export function useAdminProducts(availability: 'all' | 'active' | 'inactive' = 'all') {
  const sc = useScope();
  return usePaged<CatalogProduct>(sc, 'products', [availability], async (from, to, signal) => {
    let q = supabase.from('products').select('id,name,category,sku:sku_code,item_code,master_brand,sub_brand,is_active').eq('company_id', sc.companyId);
    if (availability === 'active') q = q.eq('is_active', true);
    if (availability === 'inactive') q = q.eq('is_active', false);
    const r = await q.order('name').order('id').range(from, to).abortSignal(signal);
    errorMessage('تعذر تحميل المنتجات. تحقق من جدول المنتجات وصلاحياته.', r.error);
    return r.data as CatalogProduct[];
  });
}
export function useSaveSettings() {
  const sc = useScope(), settings = useAppSettings(), qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SettingsInput) => {
      if (!canAdmin(sc.supervisor)) throw new Error('تعديل الإعدادات للمدراء فقط.');
      const clean = { ...input, app_name: input.app_name.trim(), target_brand_name: input.target_brand_name.trim(),
        competitor_brands: [...new Set(input.competitor_brands.map(v => v.trim()).filter(Boolean))] };
      validateSettings({ ...settings, ...clean }, sc.companyId);
      const r = await supabase.from('app_settings').update(clean).eq('id', settings.id).eq('company_id', sc.companyId)
        .select(SETTINGS_COLUMNS).single();
      errorMessage('تعذر حفظ إعدادات الشركة. تحقق من صلاحيات الإدارة.', r.error);
      return validateSettings(r.data as AppSettings, sc.companyId);
    },
    onSuccess: data => { qc.setQueryData(['company-settings', sc.companyId], data); notify('تم حفظ إعدادات الشركة', 'success'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
export function useSaveMonthlyTarget() {
  const sc = useScope(), qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MonthlyTargetInput) => {
      if (!sc.isAdmin) throw new Error('تحديد الأهداف للمدراء فقط.');
      if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12
        || !Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) throw new Error('الشهر أو السنة غير صالحة.');

      const values: Record<string, any> = {
        month: input.month,
        year: input.year,
        visits_target: Number(input.visits_target) || 0,
        audit_target: Number(input.audit_target) || 0,
        criteria: input.criteria || 'visits',
        scope_type: input.scope_type || 'per_user',
        target_scope: input.target_scope || 'all_branches',
        branch_id: input.branch_id || null,
        target_amount: Number(input.target_amount) || 0,
      };

      if (input.scope_type === 'per_user' && input.supervisor_id) {
        values.supervisor_id = input.supervisor_id;
      } else {
        values.supervisor_id = null;
      }

      let query = supabase.from('targets').select('id').eq('company_id', sc.companyId)
        .eq('month', input.month).eq('year', input.year).eq('criteria', values.criteria);
      if (values.supervisor_id) {
        query = query.eq('supervisor_id', values.supervisor_id);
      } else {
        query = query.is('supervisor_id', null);
      }
      if (values.branch_id) {
        query = query.eq('branch_id', values.branch_id);
      }

      const existing = await query.maybeSingle();

      const r = existing.data
        ? await supabase.from('targets').update(values).eq('id', existing.data.id).eq('company_id', sc.companyId).select('id').single()
        : await supabase.from('targets').insert({
            ...values,
            company_id: sc.companyId,
            target_date: `${input.year}-${String(input.month).padStart(2, '0')}-01`,
            actual_visits: 0,
            actual_audits: 0,
          }).select('id').single();
      errorMessage('تعذر حفظ الهدف الشهري.', r.error);
    },
    onSuccess: () => {
      notify('تم حفظ الأهداف بنجاح', 'success');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'targets'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'dashboard'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
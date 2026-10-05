import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { supabase } from './supabase';
import { usePaged, useScope, type VisitRow } from './data';
import { CUSTOMER_COLUMNS, SETTINGS_COLUMNS, VISIT_JOIN } from './columns';
import { CUSTOMER_TYPES, dateKey, progressPercent, visitDateRange } from './screen-helpers';
import { canAdmin, requireExactCount, validateSettings } from './policy';
import { notify } from './toast';
import { countTargetRecord } from './execution-records';
import type { AppSettings, Customer, Target } from '@/types/database';
export { useUploadAudit, useRequestAuditAnalysis, useAuditResult } from './screen-audit';

export type CustomerCardRow = Customer & { last_visit: string | null };
export type CatalogProduct = { id: string; name: string; category: string; sku?: string; is_active: boolean };
export type MonthProgress = Pick<Target, 'month' | 'year' | 'visits_target' | 'audit_target'
  | 'actual_visits' | 'actual_audits'>;
export type SettingsInput = Pick<AppSettings, 'app_name' | 'primary_color' | 'geofence_radius_m' | 'target_brand_name' | 'competitor_brands'>;
export type MonthlyTargetInput = Pick<Target, 'supervisor_id' | 'month' | 'year' | 'visits_target' | 'audit_target'>;
type Scope = ReturnType<typeof useScope>;
const errorMessage = (message: string, error: { message: string } | null) => {
  if (error) throw new Error(message);
};
// All row queries are bounded; exact count prevents assuming a server's row cap.
async function collect<T>(make: () => any, signal: AbortSignal): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const result = await make().range(rows.length, rows.length + 199).abortSignal(signal);
    errorMessage('تعذر تحميل البيانات. تحقق من الصلاحيات وأعد المحاولة.', result.error);
    const count = requireExactCount(result.count);
    const page = result.data as T[] | null;
    if (!Array.isArray(page)) throw new Error('استجابة البيانات غير مكتملة.');
    rows.push(...page);
    if (rows.length >= count) return rows;
    if (!page.length) throw new Error('لم تُحمّل جميع البيانات المطلوبة.');
  }
}
async function countRows(sc: Scope, table: string, signal: AbortSignal, build: (q: any) => any) {
  const r = await build(sc.scope(supabase.from(table).select('id', { count: 'exact', head: true }))).abortSignal(signal);
  errorMessage('تعذر حساب الإحصائيات.', r.error);
  return requireExactCount(r.count);
}
function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1), end = new Date(year, month, 1);
  return { start: dateKey(start), end: dateKey(end), startIso: start.toISOString(), endIso: end.toISOString() };
}
type TargetValues = Pick<Target, 'visits_target' | 'audit_target'>;
const targetSum = (rows: TargetValues[], field: keyof TargetValues) =>
  rows.reduce((sum, row) => sum + Number(row[field]), 0);
function targetsFor(sc: Scope, month: number, year: number, signal: AbortSignal) {
  return collect<TargetValues>(() => sc.scope(supabase.from('targets').select('visits_target,audit_target', { count: 'exact' }))
    .eq('month', month).eq('year', year).order('id'), signal);
}

export function useScreenDashboard() {
  const sc = useScope(), day = visitDateRange('today'), now = new Date();
  const month = now.getMonth() + 1, year = now.getFullYear(), mr = monthRange(year, month);
  return useQuery({
    queryKey: [...sc.base, 'dashboard', 'task-execution', day.start], retry: 1, gcTime: 300_000,
    queryFn: async ({ signal }) => {
      const [visits, audits, actualVisits, targets, recent] = await Promise.all([
        countRows(sc, 'visits', signal, q => q.eq('visit_date', day.start)),
        countRows(sc, 'shelf_audits', signal, q => q.gte('audited_at', day.startIso).lt('audited_at', day.endIso)),
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
    let q: ReturnType<typeof sc.scope> = supabase.from('customers').select(`${CUSTOMER_COLUMNS},visits(check_in_time)`).eq('company_id', sc.companyId);
    if (term) q = q.or(`name.ilike.%${term}%,address.ilike.%${term}%`);
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
      const r = await supabase.from('customers').select(CUSTOMER_COLUMNS).eq('company_id', sc.companyId).eq('id', id!)
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
        countRows(sc, 'shelf_audits', signal, q => q.eq('status', 'completed').gte('audited_at', range.startIso).lt('audited_at', range.endIso)),
      ]);
      return { month: m, year: y, visits_target: targetSum(targets, 'visits_target'),
        audit_target: targetSum(targets, 'audit_target'), actual_visits, actual_audits };
    })),
  });
}
export function useAdminProducts() {
  const sc = useScope();
  // Existing native product contract is a global catalog without company_id.
  // Tenant/administrator access must be enforced by the existing server RLS.
  return usePaged<CatalogProduct>(sc, 'products', [false], async (from, to, signal) => {
    let q = supabase.from('products').select('id,name,category,sku,is_active');
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
      const values = countTargetRecord(input);
      if (!sc.isAdmin) throw new Error('تحديد الأهداف للمدراء فقط.');
      if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12
        || !Number.isInteger(input.year) || input.year < 2000 || input.year > 2100
        || ![input.visits_target, input.audit_target].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('قيم الأهداف غير صالحة.');
      const member = await supabase.from('supervisors').select('id').eq('id', input.supervisor_id).eq('company_id', sc.companyId).single();
      errorMessage('المشرف المحدد لا ينتمي لشركتك أو غير متاح.', member.error);
      const existing = await supabase.from('targets').select('id').eq('company_id', sc.companyId)
        .eq('supervisor_id', input.supervisor_id).eq('month', input.month).eq('year', input.year).maybeSingle();
      errorMessage('تعذر التحقق من الهدف الشهري الحالي.', existing.error);
      let actuals: Pick<Target, 'actual_visits' | 'actual_audits'> | undefined;
      if (!existing.data) {
        const signal = new AbortController().signal, range = monthRange(input.year, input.month);
        const [actual_visits, actual_audits] = await Promise.all([
          countRows(sc, 'visits', signal, q => q.eq('supervisor_id', input.supervisor_id).eq('status', 'completed')
            .gte('visit_date', range.start).lt('visit_date', range.end)),
          countRows(sc, 'shelf_audits', signal, q => q.eq('supervisor_id', input.supervisor_id).eq('status', 'completed')
            .gte('audited_at', range.startIso).lt('audited_at', range.endIso)),
        ]);
        actuals = { actual_visits, actual_audits };
      }
      const r = existing.data
        ? await supabase.from('targets').update(values).eq('id', existing.data.id).eq('company_id', sc.companyId).select('id').single()
        : await supabase.from('targets').insert({ ...values, company_id: sc.companyId, ...actuals }).select('id').single();
      errorMessage('تعذر حفظ الهدف الشهري.', r.error);
    },
    onSuccess: () => { notify('تم حفظ الأهداف الشهرية', 'success');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'targets'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'dashboard'] }); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
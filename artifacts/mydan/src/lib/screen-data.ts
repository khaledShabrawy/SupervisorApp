import type { Customer, AppSettings, Target, Attendance } from '@/types/database';
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
export type CustomerCardRow = Customer & { last_visit: string | null };
export interface MonthProgress {
  month: number;
  year: number;
  visits_target: number;
  audit_target: number;
  orders_target: number;
  actual_visits: number;
  actual_audits: number;
  actual_orders: number;
}
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
  unit?: string;
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
};
type Scope = ReturnType<typeof useScope>;
const errorMessage = (message: string, error: { message: string; details?: string; hint?: string } | null) => {
  if (error) {
    const detail = (error as any).details || (error as any).hint || error.message;
    throw new Error(detail ? `${message} (${detail})` : message);
  }
};
async function countRows(sc: Scope, table: string, signal: AbortSignal, build: (q: any) => any) {
  return readExactCount(head => build(sc.scope(supabase.from(table).select('id', { count: 'exact', head }))),
    signal, 'تعذر حساب الإحصائيات. تحقق من الاتصال والصلاحيات.');
}
function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1), end = new Date(year, month, 1);
  return { start: dateKey(start), end: dateKey(end), startIso: start.toISOString(), endIso: end.toISOString() };
}
type TargetValues = Pick<Target, 'visits_target' | 'audit_target' | 'orders_target'>;
const targetSum = (rows: TargetValues[], field: keyof TargetValues) =>
  rows.reduce((sum, row) => sum + Number(row[field]), 0);
function targetsFor(sc: Scope, month: number, year: number, signal: AbortSignal) {
  return readAllRows<TargetValues & { id: string }>(() => sc.scope(supabase.from('targets').select('id,visits_target,audit_target,orders_target'))
    .eq('month', month).eq('year', year), signal, 'تعذر تحميل الأهداف. تحقق من الاتصال والصلاحيات.');
}

export function useScreenDashboard() {
  const sc = useScope(), day = visitDateRange('today'), now = new Date();
  const month = now.getMonth() + 1, year = now.getFullYear(), mr = monthRange(year, month);
  return useQuery({
    queryKey: [...sc.base, 'dashboard', 'task-execution', day.start], retry: 1, gcTime: 300_000,
    queryFn: async ({ signal }) => {
      const [visits, audits, actualVisits, targets, recentRes] = await Promise.all([
        countRows(sc, 'visits', signal, q => q.gte('visit_date', day.start).lt('visit_date', day.end)),
        countRows(sc, 'shelf_audit', signal, q => q.gte('created_at', day.startIso).lt('created_at', day.endIso)),
        countRows(sc, 'visits', signal, q => q.eq('status', 'completed').gte('visit_date', mr.start).lt('visit_date', mr.end)),
        targetsFor(sc, month, year, signal),
        sc.scope(supabase.from('visits').select(VISIT_JOIN)).order('visit_date', { ascending: false })
          .order('check_in_time', { ascending: false, nullsFirst: false }).order('id').limit(5).abortSignal(signal),
      ]);
      if (recentRes.error || !Array.isArray(recentRes.data)) throw new Error('تعذر تحميل الزيارات.');
      const recent = recentRes.data as VisitRow[];

      return {
        visits,
        audits,
        visitsProgress: progressPercent(actualVisits, targetSum(targets, 'visits_target')),
        recent,
      };
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
    let q: any = supabase.from('customers').select(`${CUSTOMER_COLUMNS},visits(check_in_time)`).eq('company_id', sc.companyId);
    if (!sc.isAdmin) q = q.eq('is_active', true).or(`supervisor_id.eq.${sc.supervisorId},supervisor_id.is.null`);
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
        .abortSignal(signal).maybeSingle();
      if (r.error) errorMessage('تعذر تحميل العميل المحدد.', r.error);
      return r.data as Customer | null;
    } });
}
export function useMonthlyTargets() {
  const sc = useScope(), now = new Date(), month = now.getMonth() + 1, year = now.getFullYear();
  return useQuery({
    queryKey: [...sc.base, 'targets', 'task-progress', month, year], retry: 1, staleTime: 60_000, gcTime: 300_000,
    queryFn: async ({ signal }) => Promise.all(Array.from({ length: 4 }, async (_, index): Promise<MonthProgress> => {
      const d = new Date(year, month - 1 - index, 1), m = d.getMonth() + 1, y = d.getFullYear(), range = monthRange(y, m);
      const [targets, actual_visits, actual_audits, actual_orders] = await Promise.all([
        targetsFor(sc, m, y, signal),
        countRows(sc, 'visits', signal, q => q.eq('status', 'completed').gte('visit_date', range.start).lt('visit_date', range.end)),
        countRows(sc, 'shelf_audit', signal, q => q.eq('status', 'completed').gte('audited_at', range.startIso).lt('audited_at', range.endIso)),
        countRows(sc, 'orders', signal, q => q.gte('created_at', range.startIso).lt('created_at', range.endIso)),
      ]);
      return { month: m, year: y, visits_target: targetSum(targets, 'visits_target'),
        audit_target: targetSum(targets, 'audit_target'), orders_target: targetSum(targets, 'orders_target'),
        actual_visits, actual_audits, actual_orders };
    })),
  });
}
export function useAdminProducts(availability: 'all' | 'active' | 'inactive' = 'all') {
  const sc = useScope();
  return usePaged<CatalogProduct>(sc, 'products', [availability], async (from, to, signal) => {
    let q = supabase.from('products').select('id,name,category,sku:sku_code,item_code,master_brand,sub_brand,unit,units_per_carton,is_active').eq('company_id', sc.companyId);
    if (availability === 'active') q = q.eq('is_active', true);
    if (availability === 'inactive') q = q.or('is_active.eq.false,is_active.is.null');
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
        competitor_brands: [...new Set(input.competitor_brands.map((v: string) => v.trim()).filter(Boolean))] };
      const isDefault = !settings.id || settings.id.startsWith('default-');
      const r = isDefault
        ? await supabase.from('app_settings').upsert({ ...clean, company_id: sc.companyId }, { onConflict: 'company_id' })
            .select(SETTINGS_COLUMNS).single()
        : await supabase.from('app_settings').update(clean).eq('id', settings.id).eq('company_id', sc.companyId)
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

      if (input.criteria && !['visits','shelf_audit','new_opportunity'].includes(input.criteria)) throw new Error('نوع الهدف غير مدعوم.');
      const targetDate = `${input.year}-${String(input.month).padStart(2, '0')}-01`;
      const targetMonthPrefix = targetDate.slice(0, 7);
      const supervisorId = input.scope_type === 'per_user' && input.supervisor_id ? input.supervisor_id : null;
      const branchId = input.target_scope === 'specific_branch' ? (input.branch_id || null) : null;

      const corePayload: Record<string, any> = {
        company_id: sc.companyId,
        supervisor_id: supervisorId,
        target_date: targetDate,
        visits_target: Number(input.visits_target) || 0,
        audit_target: Number(input.audit_target) || 0,
      };

      const fullPayload: Record<string, any> = {
        ...corePayload,
        criteria: input.criteria || 'visits',
        scope_type: input.scope_type || 'per_user',
        target_scope: input.target_scope || 'all_branches',
        branch_id: branchId,
      };

      const lastDay = new Date(input.year, input.month, 0).getDate();
      const rangeStart = `${targetMonthPrefix}-01`;
      const rangeEnd = `${targetMonthPrefix}-${String(lastDay).padStart(2, '0')}`;

      const findExisting = async (byCriteria: boolean, useBranchFilter: boolean): Promise<string | null> => {
        let q = supabase.from('targets').select('id').eq('company_id', sc.companyId)
          .gte('target_date', rangeStart).lte('target_date', rangeEnd);
        if (supervisorId) {
          q = q.eq('supervisor_id', supervisorId);
        } else {
          q = q.is('supervisor_id', null);
          if (useBranchFilter) {
            q = branchId ? q.eq('branch_id', branchId) : q.is('branch_id', null);
          }
        }
        if (byCriteria) {
          q = q.eq('criteria', fullPayload.criteria);
        }
        const res = await q.limit(1);
        if (res.error) return null;
        return res.data?.[0]?.id ?? null;
      };

      let existingId = await findExisting(true, true);

      const writeTarget = async (idToUpdate: string | null, data: Record<string, any>) => {
        return idToUpdate
          ? await (supabase.from('targets') as any).update(data).eq('id', idToUpdate).eq('company_id', sc.companyId).select('id').limit(1)
          : await (supabase.from('targets') as any).insert({ ...data, actual_visits: 0, actual_audits: 0 }).select('id').limit(1);
      };

      let activePayload: Record<string, any> = { ...fullPayload };
      let r = await writeTarget(existingId, activePayload);

      // Graceful fallback if optional Phase 3 columns (criteria/scope_type/target_scope/branch_id) do not exist on DB yet
      if (r.error && (r.error.code === '42703' || r.error.code === 'PGRST204' || /does not exist|schema cache/i.test(r.error.message || ''))) {
        if (!existingId) {
          existingId = await findExisting(false, false);
        }
        activePayload = { ...corePayload };
        r = await writeTarget(existingId, activePayload);
      }

      // If the table requires explicit month/year columns (not generated)
      if (r.error && (r.error.message?.includes('null value in column "month"') || (r.error.message?.includes('column "month" of relation "targets" does not exist') === false && r.error.message?.includes('month')))) {
        activePayload = { ...activePayload, month: input.month, year: input.year };
        r = await writeTarget(existingId, activePayload);
      }

      // If insert failed due to duplicate key (legacy unique constraint on (supervisor_id, target_date)), fall back to update
      if (r.error && (r.error.code === '23505' || r.error.message?.includes('duplicate key') || r.error.message?.includes('unique constraint'))) {
        const fallbackId = await findExisting(false, false);
        if (fallbackId) {
          r = await writeTarget(fallbackId, activePayload);
        }
      }

      if (r.error && r.error.code === '23502' && /supervisor_id/i.test(r.error.message || '')) {
        throw new Error('تعذر حفظ هدف عام بدون مشرف. يرجى تشغيل ترحيل قاعدة البيانات أو اختيار مشرف محدد.');
      }

      errorMessage('تعذر حفظ الهدف الشهري.', r.error);
      if (!r.data?.length) {
        throw new Error('تعذر حفظ الهدف الشهري. تحقق من صلاحيات المدير على جدول الأهداف.');
      }

      if (supervisorId) {
        void (supabase.from('notifications') as any).insert({
          company_id: sc.companyId,
          supervisor_id: supervisorId,
          type: 'target_update',
          title_ar: 'تم تحديد أهداف بيعية جديدة 🎯',
          body_ar: `تم تعيين هدفك الشهري (${activePayload.visits_target || 0} زيارة، ${activePayload.audit_target || 0} تدقيق رف).`,
          is_read: false,
        });
        void supabase.functions.invoke('push-notify', {
          body: {
            supervisorIds: [supervisorId],
            title: 'تم تحديد أهداف بيعية جديدة 🎯',
            body: `تم تعيين هدفك الشهري (${activePayload.visits_target || 0} زيارة).`,
          },
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      notify('تم حفظ الأهداف بنجاح', 'success');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'admin-targets'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'targets'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'dashboard'] });
      void qc.invalidateQueries({ queryKey: ['targets'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function useAttendanceToday() {
  const sc = useScope(), today = visitDateRange('today').start;
  return useQuery({
    queryKey: [...sc.base, 'attendance-today', today],
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('attendance')
        .select('id,attendance_date,check_in_time,check_out_time,check_in_lat,check_in_lng')
        .eq('company_id', sc.companyId)
        .eq('supervisor_id', sc.supervisorId)
        .eq('attendance_date', today)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw new Error('تعذر تحميل سجل الحضور.');
      return (data ?? null) as Attendance | null;
    },
  });
}
/** Sanitizes an email string by removing invisible unicode marks, extracting from angle brackets, and trimming */
export function cleanEmail(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u00A0\u202A-\u202E]/g, '')
    .replace(/^.*<([^>]+)>.*$/, '$1')
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 1632))
    .trim()
    .toLowerCase();
}

/** Validates email format strictly ensuring valid domain */
export function isValidEmail(email: string): boolean {
  const cleaned = cleanEmail(email);
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(cleaned);
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Supervisor } from '@/types/database';
import { supabase } from './supabase';
import { useScope, usePaged } from './data';
import { useAuth } from '@/contexts/AuthContext';
import { readExactCount } from './read-count';
import { notify } from './toast';
import { todayStr } from './format';
import { SCREENS, type ScreenKey } from './permissions';
import { t } from '@/i18n';

type Scope = ReturnType<typeof useScope>;
const fail = (message: string, error: { message?: string } | null): never => {
  throw new Error(error?.message ? `${message} (${error.message})` : message);
};
const requireAdmin = (sc: Scope) => { if (!sc.isAdmin) throw new Error('هذه العملية للمدراء فقط.'); };
const invalidate = (qc: ReturnType<typeof useQueryClient>, sc: Scope, ...names: string[]) =>
  Promise.all(names.map((n) => qc.invalidateQueries({ queryKey: [...sc.base, n] })));

/* ---------- Dashboard ---------- */
export interface AdminKpiFilters {
  dateFrom?: string;
  dateTo?: string;
  regionId?: string;
  branchId?: string;
  supervisorId?: string;
}

export function useAdminKpis(filters?: AdminKpiFilters) {
  const sc = useScope();
  const dateFrom = filters?.dateFrom || todayStr().slice(0, 8) + '01';
  const dateTo = filters?.dateTo || todayStr();
  const regionId = filters?.regionId || 'all';
  const branchId = filters?.branchId || 'all';
  const supervisorId = filters?.supervisorId || 'all';

  return useQuery({
    queryKey: [...sc.base, 'admin-kpis', dateFrom, dateTo, regionId, branchId, supervisorId],
    enabled: sc.isAdmin,
    retry: 1,
    queryFn: async ({ signal }) => {
      // 1. Resolve supervisor IDs matching branch/region filters
      let supervisorIds: string[] | null = null;
      if (supervisorId !== 'all') {
        supervisorIds = [supervisorId];
      } else if (branchId !== 'all') {
        const { data: sups } = await supabase.from('supervisors')
          .select('id').eq('company_id', sc.companyId).eq('branch_id', branchId).abortSignal(signal);
        supervisorIds = (sups ?? []).map((s) => s.id);
      } else if (regionId !== 'all') {
        const { data: branches, error: bErr } = await supabase.from('branches')
          .select('id').eq('company_id', sc.companyId).eq('region_id', regionId).abortSignal(signal);
        if (!bErr && branches) {
          const bIds = branches.map((b) => b.id);
          if (bIds.length > 0) {
            const { data: sups } = await supabase.from('supervisors')
              .select('id').eq('company_id', sc.companyId).in('branch_id', bIds).abortSignal(signal);
            supervisorIds = (sups ?? []).map((s) => s.id);
          } else {
            supervisorIds = [];
          }
        } else {
          supervisorIds = null;
        }
      }

      const hasEmptySupFilter = supervisorIds !== null && supervisorIds.length === 0;

      // 2. Fetch Active Supervisors count
      let supsCount = 0;
      if (!hasEmptySupFilter) {
        let supQ = supabase.from('supervisors').select('id', { count: 'exact', head: true })
          .eq('company_id', sc.companyId).eq('is_active', true);
        if (supervisorIds) supQ = supQ.in('id', supervisorIds);
        const countRes = await supQ.abortSignal(signal);
        supsCount = countRes.count ?? 0;
      }

      // 3. Fetch Visits in Date Range
      let visitsCount = 0;
      let onBeatCount = 0;
      let oorCount = 0;
      let totalGeoCount = 0;
      if (!hasEmptySupFilter) {
        let vQ = supabase.from('visits').select('id,on_beat,geo_distance')
          .eq('company_id', sc.companyId)
          .gte('visit_date', dateFrom)
          .lte('visit_date', dateTo);
        if (supervisorIds) vQ = vQ.in('supervisor_id', supervisorIds);
        const { data: visitsData } = await vQ.limit(2000).abortSignal(signal);
        const vList = visitsData ?? [];
        visitsCount = vList.length;
        const geoList = vList.filter((r) => r.on_beat != null);
        totalGeoCount = geoList.length;
        onBeatCount = geoList.filter((r) => r.on_beat === true).length;
        oorCount = totalGeoCount - onBeatCount;
      }
      const geofenceRate = totalGeoCount ? Math.round((onBeatCount / totalGeoCount) * 100) : null;

      // 4. Fetch Targets for Target vs Achieved
      let visitsTarget = 0;
      const visitsAchieved = visitsCount;
      let auditsTarget = 0;
      let auditsAchieved = 0;

      if (!hasEmptySupFilter) {
        let tQ = supabase.from('targets').select('visits_target,audit_target,actual_visits,actual_audits')
          .eq('company_id', sc.companyId);
        if (supervisorIds) tQ = tQ.in('supervisor_id', supervisorIds);
        const { data: targetsData } = await tQ.limit(500).abortSignal(signal);
        for (const t of targetsData ?? []) {
          visitsTarget += Number(t.visits_target) || 0;
          auditsTarget += Number(t.audit_target) || 0;
        }
      }

      const achievementRate = visitsTarget > 0
        ? Math.round((visitsAchieved / visitsTarget) * 100)
        : (visitsAchieved > 0 ? 100 : 0);

      // 5. Shelf audit PSS average in period
      let avgPss: number | null = null;
      let auditsCount = 0;
      if (!hasEmptySupFilter) {
        let auditQ = supabase.from('shelf_audit').select('audit_score')
          .eq('company_id', sc.companyId)
          .eq('status', 'completed')
          .gte('created_at', `${dateFrom}T00:00:00`)
          .lte('created_at', `${dateTo}T23:59:59`)
          .not('audit_score', 'is', null);
        if (supervisorIds) auditQ = auditQ.in('supervisor_id', supervisorIds);
        const { data: scoresData } = await auditQ.limit(1000).abortSignal(signal);
        const sList = (scoresData ?? []).map((r) => Number(r.audit_score)).filter(Number.isFinite);
        auditsCount = sList.length;
        auditsAchieved = auditsCount;
        avgPss = sList.length ? Math.round(sList.reduce((a, b) => a + b, 0) / sList.length) : null;
      }

      // 6. Assets & open tickets
      const [assetsRes, ticketsRes] = await Promise.all([
        supabase.from('assets').select('id', { count: 'exact', head: true }).eq('company_id', sc.companyId).eq('is_active', true).abortSignal(signal),
        supabase.from('asset_tickets').select('id', { count: 'exact', head: true }).eq('company_id', sc.companyId).in('status', ['open', 'dispatched', 'in_progress']).abortSignal(signal),
      ]);

      return {
        supervisors: supsCount,
        visitsToday: visitsCount,
        assets: assetsRes.count ?? 0,
        openTickets: ticketsRes.count ?? 0,
        avgPss,
        audits30d: auditsCount,
        geofenceRate,
        onBeatVisits: onBeatCount,
        oorVisits: oorCount,
        totalGeoVisits: totalGeoCount,
        visitsTarget,
        visitsAchieved,
        achievementRate,
        auditsTarget,
        auditsAchieved,
      };
    },
  });
}

/* ---------- Branches ---------- */
export type RegionRow = { id: string; name: string; name_en: string | null; is_active: boolean };
export function useRegions() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'regions'], retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('regions').select('id,name,name_en,is_active')
        .eq('company_id', sc.companyId).order('name').abortSignal(signal);
      if (error) return [];
      return data as RegionRow[];
    },
  });
}
export function useSaveRegion() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { id?: string; name: string; name_en?: string; is_active: boolean }) => {
      requireAdmin(sc);
      if (!r.name.trim()) throw new Error('اسم الإقليم مطلوب.');
      const values = { name: r.name.trim(), name_en: r.name_en?.trim() || null, is_active: r.is_active };
      const res = r.id
        ? await supabase.from('regions').update(values).eq('id', r.id).eq('company_id', sc.companyId).select('id')
        : await supabase.from('regions').insert({ ...values, company_id: sc.companyId }).select('id');
      if (res.error) fail('تعذر حفظ الإقليم.', res.error);
    },
    onSuccess: () => { notify('تم حفظ الإقليم', 'success'); void invalidate(qc, sc, 'regions'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export type Branch = { id: string; name: string; region: string | null; region_id?: string | null; manager_id: string | null; latitude: number | null; longitude: number | null; is_active: boolean };
export function useBranches() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'branches'], retry: 1,
    queryFn: async ({ signal }) => {
      let res: any = await supabase.from('branches').select('id,name,region,region_id,manager_id,latitude,longitude,is_active')
        .eq('company_id', sc.companyId).order('name').abortSignal(signal);
      if (res.error && res.error.message.includes('region_id')) {
        res = await supabase.from('branches').select('id,name,region,manager_id,latitude,longitude,is_active')
          .eq('company_id', sc.companyId).order('name').abortSignal(signal);
      }
      if (res.error) fail('تعذر تحميل الفروع.', res.error);
      return res.data as Branch[];
    },
  });
}
export function useSaveBranch() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: Omit<Branch, 'id'> & { id?: string }) => {
      requireAdmin(sc);
      const values: Record<string, unknown> = {
        name: b.name.trim(),
        region: b.region?.trim() || null,
        manager_id: b.manager_id || null,
        latitude: b.latitude,
        longitude: b.longitude,
        is_active: b.is_active,
      };
      if (b.region_id) values.region_id = b.region_id;
      if (!values.name) throw new Error('اسم الفرع مطلوب.');
      let r = b.id
        ? await supabase.from('branches').update(values).eq('id', b.id).eq('company_id', sc.companyId).select('id')
        : await supabase.from('branches').insert({ ...values, company_id: sc.companyId }).select('id');
      if (r.error && r.error.message.includes('region_id')) {
        delete values.region_id;
        r = b.id
          ? await supabase.from('branches').update(values).eq('id', b.id).eq('company_id', sc.companyId).select('id')
          : await supabase.from('branches').insert({ ...values, company_id: sc.companyId }).select('id');
      }
      if (r.error) fail('تعذر حفظ الفرع.', r.error);
      if (!r.data?.length) throw new Error('لم يتم الحفظ. قد لا تملك الصلاحية.');
    },
    onSuccess: () => { notify('تم حفظ الفرع', 'success'); void invalidate(qc, sc, 'branches'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Supervisors: invite + permissions ---------- */
export type InviteRole = 'supervisor' | 'senior_supervisor' | 'branch_manager' | 'admin';
export function useInviteSupervisor() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; full_name: string; phone: string; role: InviteRole; branch_id?: string;
      company_id?: string; permissions?: Record<ScreenKey, boolean> }) => {
      requireAdmin(sc);
      if (((sc.supervisor.role as string) === 'branch_manager' || (sc.supervisor.role as string) === 'manager') && input.role === 'admin') {
        throw new Error(t('مدير الفرع لا يملك صلاحية دعوة رتبة مدير.'));
      }
      const targetCompanyId = (sc.supervisor.role === 'super_admin' && input.company_id)
        ? input.company_id
        : sc.companyId;

      const effectiveBranchId = ((sc.supervisor.role as string) === 'branch_manager' || (sc.supervisor.role as string) === 'manager') && sc.supervisor.branch_id
        ? sc.supervisor.branch_id
        : (input.branch_id || null);

      const email = input.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('البريد الإلكتروني غير صالح.');
      if (!input.full_name.trim()) throw new Error('الاسم مطلوب.');
      const { data, error } = await supabase.functions.invoke('invite-supervisor', {
        body: { ...input, company_id: targetCompanyId, email, full_name: input.full_name.trim(), phone: input.phone.trim() || null,
          branch_id: effectiveBranchId, redirect_to: `${window.location.origin}${import.meta.env.BASE_URL}set-password` },
      });
      if (error) {
        // FunctionsHttpError carries the function's JSON body in context.
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(body?.error_ar ?? 'تعذر إرسال الدعوة. تأكد من نشر وظيفة invite-supervisor.');
      }
      return data as { supervisor_id: string };
    },
    onSuccess: () => { notify('✅ تم إرسال الدعوة بالبريد', 'success'); void invalidate(qc, sc, 'admin-supervisors', 'admin-kpis'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function useResendInvite() {
  const sc = useScope();
  return useMutation({
    mutationFn: async (supervisorId: string) => {
      requireAdmin(sc);
      const { data, error } = await supabase.functions.invoke('invite-supervisor', {
        body: {
          action: 'resend_invite',
          supervisor_id: supervisorId,
          redirect_to: `${window.location.origin}${import.meta.env.BASE_URL}set-password`,
        },
      });
      if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(body?.error_ar ?? 'تعذر إعادة إرسال رابط الدعوة.');
      }
      return data as { message?: string; link?: string };
    },
    onSuccess: (res) => {
      notify(res?.message || '✅ تم إعادة إرسال رابط التفعيل بنجاح', 'success');
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function useSetUserPassword() {
  const sc = useScope();
  return useMutation({
    mutationFn: async ({ supervisorId, newPassword, forceChange }: { supervisorId: string; newPassword: string; forceChange: boolean }) => {
      requireAdmin(sc);
      const { data, error } = await supabase.functions.invoke('invite-supervisor', {
        body: {
          action: 'set_password',
          supervisor_id: supervisorId,
          new_password: newPassword,
          force_change: forceChange,
        },
      });
      if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(body?.error_ar ?? 'تعذر تعيين كلمة المرور.');
      }
      return data as { message?: string };
    },
    onSuccess: (res) => {
      notify(res?.message || '✅ تم تعيين كلمة المرور بنجاح', 'success');
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
export function useSupervisorPermissions(supervisorId: string | null) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'permissions', supervisorId], enabled: !!supervisorId, retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('supervisor_permissions').select('screen_key,is_enabled')
        .eq('supervisor_id', supervisorId!).eq('company_id', sc.companyId).abortSignal(signal);
      if (error) fail('تعذر تحميل الصلاحيات.', error);
      return data as { screen_key: string; is_enabled: boolean }[];
    },
  });
}
export function useSavePermissions() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ supervisorId, values }: { supervisorId: string; values: Record<ScreenKey, boolean> }) => {
      requireAdmin(sc);
      const now = new Date().toISOString();
      const rows = SCREENS.map((s) => ({ supervisor_id: supervisorId, company_id: sc.companyId, screen_key: s.key,
        is_enabled: values[s.key], updated_at: now }));
      const { error } = await supabase.from('supervisor_permissions').upsert(rows, { onConflict: 'supervisor_id,screen_key' });
      if (error) fail('تعذر حفظ الصلاحيات.', error);
    },
    onSuccess: (_d, v) => { notify('تم حفظ الصلاحيات', 'success');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'permissions', v.supervisorId] }); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Products (catalog only — no pricing) ---------- */
export function useSaveProduct() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      id?: string;
      name: string;
      category?: string;
      sku?: string;
      item_code?: string;
      master_brand?: string;
      sub_brand?: string;
      units_per_carton?: number;
      carton_price?: number;
      price?: number;
      unit?: string;
      is_active: boolean;
    }) => {
      requireAdmin(sc);
      const values = {
        name: p.name.trim(),
        category: p.category?.trim() || null,
        sku_code: p.sku?.trim() || null,
        item_code: p.item_code?.trim() || p.sku?.trim() || null,
        master_brand: p.master_brand?.trim() || null,
        sub_brand: p.sub_brand?.trim() || null,
        units_per_carton: p.units_per_carton != null ? Math.max(1, Number(p.units_per_carton)) : 1,
        carton_price: p.carton_price != null ? Number(p.carton_price) : null,
        price: p.price != null ? Number(p.price) : null,
        unit: p.unit?.trim() || 'قطعة',
        is_active: p.is_active,
      };
      if (!values.name) throw new Error('اسم المنتج مطلوب.');
      const r = p.id
        ? await supabase.from('products').update(values).eq('id', p.id).eq('company_id', sc.companyId).select('id')
        : await supabase.from('products').insert({ ...values, company_id: sc.companyId }).select('id');
      if (r.error) fail('تعذر حفظ المنتج.', r.error);
      if (!r.data?.length) throw new Error('لم يتم الحفظ. قد لا تملك الصلاحية.');
    },
    onSuccess: () => { notify('تم حفظ المنتج', 'success'); void invalidate(qc, sc, 'products'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Assets ---------- */
export const ASSET_STATUS: Record<string, [string, string]> = {
  active: ['يعمل', 'b-green'], defective: ['معطل', 'b-red'], under_maintenance: ['تحت الصيانة', 'b-amber'], retired: ['خارج الخدمة', 'b-gray'],
};
export type AssetRow = { id: string; asset_code: string; asset_type_id: string; customer_id: string | null; serial_number: string | null;
  model: string | null; status: string; is_active: boolean; created_at?: string; installed_at?: string;
  asset_types: { name_ar: string; icon: string } | null; customers: { name: string } | null };
export function useAssets(search: string, dateFrom?: string, dateTo?: string) {
  const sc = useScope();
  return usePaged<AssetRow>(sc, 'assets', [search, dateFrom ?? '', dateTo ?? ''], async (from, to, signal) => {
    let q = supabase.from('assets').select('id,asset_code,asset_type_id,customer_id,serial_number,model,status,is_active,created_at,installed_at,asset_types(name_ar,icon),customers(name)')
      .eq('company_id', sc.companyId);
    const s = search.trim().replace(/[%,()]/g, '');
    if (s) q = q.or(`asset_code.ilike.%${s}%,serial_number.ilike.%${s}%`);
    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59`);
    let { data, error }: { data: any; error: any } = await q.order('asset_code').range(from, to).abortSignal(signal);
    if (error && error.message.includes('installed_at')) {
      let fallbackQ = supabase.from('assets').select('id,asset_code,asset_type_id,customer_id,serial_number,model,status,is_active,created_at,asset_types(name_ar,icon),customers(name)')
        .eq('company_id', sc.companyId);
      if (s) fallbackQ = fallbackQ.or(`asset_code.ilike.%${s}%,serial_number.ilike.%${s}%`);
      if (dateFrom) fallbackQ = fallbackQ.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) fallbackQ = fallbackQ.lte('created_at', `${dateTo}T23:59:59`);
      const fallbackRes = await fallbackQ.order('asset_code').range(from, to).abortSignal(signal);
      data = fallbackRes.data;
      error = fallbackRes.error;
    }
    if (error) fail('تعذر تحميل الأصول.', error);
    return data as unknown as AssetRow[];
  }, sc.isAdmin);
}
export function useSaveAsset() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id?: string; asset_code: string; asset_type_id: string; customer_id: string; serial_number: string; model: string; status: string; is_active?: boolean }) => {
      requireAdmin(sc);
      const values: Record<string, unknown> = {
        asset_code: a.asset_code.trim(),
        asset_type_id: a.asset_type_id,
        customer_id: a.customer_id || null,
        serial_number: a.serial_number.trim() || null,
        model: a.model.trim() || null,
        status: a.status,
      };
      if (typeof a.is_active === 'boolean') {
        values.is_active = a.is_active;
      }
      if (!values.asset_code || !values.asset_type_id) throw new Error('كود الأصل ونوعه مطلوبان.');
      if (typeof values.status !== 'string' || !(values.status in ASSET_STATUS)) throw new Error('حالة الأصل غير صالحة.');
      const r = a.id
        ? await supabase.from('assets').update(values).eq('id', a.id).eq('company_id', sc.companyId).select('id')
        : await supabase.from('assets').insert({ ...values, company_id: sc.companyId }).select('id');
      if (r.error) fail(r.error.code === '23505' ? 'كود الأصل مستخدم من قبل.' : 'تعذر حفظ الأصل.', r.error.code === '23505' ? null : r.error);
      if (!r.data?.length) throw new Error('لم يتم الحفظ. قد لا تملك الصلاحية.');
    },
    onSuccess: () => { notify('تم حفظ الأصل', 'success'); void invalidate(qc, sc, 'assets', 'admin-kpis'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
export function useDeleteAsset() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      requireAdmin(sc);
      const { error } = await supabase.from('assets').delete().eq('id', id).eq('company_id', sc.companyId);
      if (error) {
        const { error: deactErr } = await supabase.from('assets').update({ is_active: false }).eq('id', id).eq('company_id', sc.companyId);
        if (deactErr) fail(t('تعذر حذف الأصل.'), deactErr);
        notify(t('تم تعطيل الأصل نظراً لوجود سجلات مرتبطة به.'), 'info');
        return;
      }
      notify(t('تم حذف الأصل بنجاح.'), 'success');
    },
    onSuccess: () => { void invalidate(qc, sc, 'assets', 'admin-kpis'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
export function useDeleteAssetType() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      requireAdmin(sc);
      const { error } = await supabase.from('asset_types').delete().eq('id', id).eq('company_id', sc.companyId);
      if (error) {
        const { error: deactErr } = await supabase.from('asset_types').update({ is_active: false }).eq('id', id).eq('company_id', sc.companyId);
        if (deactErr) fail(t('تعذر حذف نوع الأصل.'), deactErr);
        notify(t('تم تعطيل نوع الأصل نظراً لوجود أصول مرتبطة به.'), 'info');
        return;
      }
      notify(t('تم حذف نوع الأصل بنجاح.'), 'success');
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [...sc.base, 'asset-types'] }); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Broadcast notifications ---------- */
export function useBroadcast() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ supervisorIds, title, body }: { supervisorIds: string[]; title: string; body: string }) => {
      requireAdmin(sc);
      if (!title.trim() || !body.trim()) throw new Error('العنوان والنص مطلوبان.');
      if (!supervisorIds.length) throw new Error('اختر مشرفًا واحدًا على الأقل.');
      const rows = supervisorIds.map((id) => ({ supervisor_id: id, company_id: sc.companyId, type: 'admin_message',
        title_ar: title.trim(), body_ar: body.trim(), is_read: false }));
      const { error } = await supabase.from('notifications').insert(rows);
      if (error) fail('تعذر إرسال الإشعار.', error);
      // also trigger Web Push (best-effort, non-blocking)
      supabase.functions.invoke('push-notify', {
        body: { supervisorIds, title: title.trim(), body: body.trim() },
      }).catch(() => {/* silent — push is optional */});
      return rows.length;
    },
    onSuccess: (n) => { notify(t('✅ تم إرسال الإشعار إلى {n} مشرف', { n }), 'success'); void invalidate(qc, sc, 'notifications'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Audit Logs ---------- */
export type AuditRow = {
  id: string;
  table_name: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  performed_by: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  supervisors: { full_name: string } | null;
};
export function useAuditLogs(tableFilter: string) {
  const sc = useScope();
  return usePaged<AuditRow>(sc, 'audit-logs', [tableFilter], async (from, to, signal) => {
    let q = supabase.from('audit_logs')
      .select('id,table_name,action,performed_by,old_data,new_data,created_at,supervisors!performed_by(full_name)')
      .eq('company_id', sc.companyId);
    if (tableFilter) q = q.eq('table_name', tableFilter);
    const { data, error } = await q.order('created_at', { ascending: false }).range(from, to).abortSignal(signal);
    if (error) fail('تعذر تحميل سجل المراجعة.', error);
    return data as unknown as AuditRow[];
  }, sc.isAdmin);
}

/* ---------- Admin Customers ---------- */
export type AdminCustomerRow = {
  id: string; customer_code?: string | null; name: string; type: string; customer_type: string | null;
  owner_name: string | null; phone: string | null; address: string;
  latitude: number | null; longitude: number | null; branch: string | null;
  supervisor_id: string | null; is_active: boolean;
  supervisors: { full_name: string } | null;
};
export function useAdminCustomers(search: string, supervisorId?: string, branch?: string) {
  const sc = useScope();
  return usePaged<AdminCustomerRow>(sc, 'admin-customers', [search, supervisorId ?? 'all', branch ?? 'all'], async (from, to, signal) => {
    const term = search.trim().replace(/[%,()]/g, '');
    let q = supabase.from('customers')
      .select('id,customer_code,name,type,customer_type,owner_name,phone,address,latitude,longitude,branch,supervisor_id,is_active,supervisors!supervisor_id(full_name)')
      .eq('company_id', sc.companyId);
    if (supervisorId && supervisorId !== 'all') {
      q = q.eq('supervisor_id', supervisorId);
    }
    if (branch && branch !== 'all') {
      q = q.eq('branch', branch);
    }
    if (term) q = q.or(`name.ilike.%${term}%,customer_code.ilike.%${term}%,phone.ilike.%${term}%,address.ilike.%${term}%`);
    const { data, error } = await q.order('name').order('id').range(from, to).abortSignal(signal);
    if (error) fail('تعذر تحميل العملاء.', error);
    return data as unknown as AdminCustomerRow[];
  }, sc.isAdmin);
}
export function useSaveAdminCustomer() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: { id?: string; customer_code?: string; name: string; type: string; owner_name: string; phone: string;
      address: string; latitude: number | null; longitude: number | null;
      branch: string; supervisor_id: string; is_active: boolean }) => {
      requireAdmin(sc);
      if (!c.name.trim() || !c.type.trim() || !c.address.trim()) throw new Error('الاسم والنوع والعنوان مطلوبة.');
      const values = {
        name: c.name.trim(),
        customer_code: c.customer_code?.trim() || null,
        type: c.type.trim(),
        owner_name: c.owner_name.trim() || null,
        phone: c.phone.trim() || null,
        address: c.address.trim(),
        latitude: c.latitude,
        longitude: c.longitude,
        branch: c.branch.trim() || null,
        supervisor_id: c.supervisor_id || null,
        is_active: c.is_active,
      };
      const r = c.id
        ? await supabase.from('customers').update(values).eq('id', c.id).eq('company_id', sc.companyId).select('id')
        : await supabase.from('customers').insert({ ...values, company_id: sc.companyId }).select('id');
      if (r.error) fail('تعذر حفظ العميل.', r.error);
      if (!r.data?.length) throw new Error('لم يتم الحفظ. قد لا تملك الصلاحية.');
    },
    onSuccess: () => { notify('تم حفظ العميل', 'success'); void invalidate(qc, sc, 'admin-customers', 'customers'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Surveys ---------- */
export type SurveyQuestion = { text: string; type: 'text' | 'rating' | 'choice' | 'checklist'; options?: string[]; checklist_items?: string[] };
export type SurveyRow = { id: string; title: string; questions: SurveyQuestion[];
  target_customer_type: string | null; is_mandatory: boolean; is_active: boolean;
  valid_from: string | null; valid_to: string | null };
export function useAdminSurveys() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'surveys'], enabled: sc.isAdmin, retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('surveys')
        .select('id,title,questions,target_customer_type,is_mandatory,is_active,valid_from,valid_to')
        .eq('company_id', sc.companyId).order('created_at', { ascending: false }).abortSignal(signal);
      if (error) fail('تعذر تحميل الاستبيانات.', error);
      return data as SurveyRow[];
    },
  });
}
export function useSaveSurvey() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: { id?: string; title: string; questions: SurveyQuestion[];
      target_customer_type: string; is_mandatory: boolean; is_active: boolean;
      valid_from: string; valid_to: string }) => {
      requireAdmin(sc);
      if (!s.title.trim()) throw new Error('عنوان الاستبيان مطلوب.');
      if (!s.questions.length) throw new Error('أضف سؤالاً واحداً على الأقل.');
      if (s.questions.some((q) => !q.text.trim())) throw new Error('يجب أن يكون لكل سؤال نص.');
      const values = { title: s.title.trim(), questions: s.questions,
        target_customer_type: s.target_customer_type || null, is_mandatory: s.is_mandatory,
        is_active: s.is_active, valid_from: s.valid_from || null, valid_to: s.valid_to || null };
      const r = s.id
        ? await supabase.from('surveys').update(values).eq('id', s.id).eq('company_id', sc.companyId).select('id')
        : await supabase.from('surveys').insert({ ...values, company_id: sc.companyId }).select('id');
      if (r.error) fail('تعذر حفظ الاستبيان.', r.error);
      if (!r.data?.length) throw new Error('لم يتم الحفظ. قد لا تملك الصلاحية.');
    },
    onSuccess: () => { notify('تم حفظ الاستبيان', 'success'); void invalidate(qc, sc, 'surveys'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Company logo ---------- */
export const LOGO_BUCKET = 'company-logos';
export function useUploadLogo() {
  const sc = useScope();
  return useMutation({
    mutationFn: async (file: File) => {
      requireAdmin(sc);
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) throw new Error('الشعار يجب أن يكون PNG أو JPG أو WEBP أو SVG.');
      if (file.size > 1024 * 1024) throw new Error('حجم الشعار أكبر من 1 ميجابايت.');
      const ext = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1].replace('jpeg', 'jpg');
      const uid = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      const path = `${sc.companyId}/logo-${uid}.${ext}`;
      const up = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) fail(t('تعذر رفع الشعار. تأكد من إنشاء الحاوية "{bucket}".', { bucket: LOGO_BUCKET }), up.error);
      return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Companies (super_admin only) ---------- */
export type CompanyRow = {
  id: string; name: string; name_en: string | null; license_type: string | null;
  max_supervisors: number | null; is_active: boolean; expires_at: string | null;
  country: string | null; city: string | null;
};
export function useCompanies() {
  const { supervisor } = useAuth();
  return useQuery({
    queryKey: ['mydan', 'super-admin', 'companies'],
    enabled: supervisor?.role === 'super_admin',
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('companies')
        .select('id,name,name_en,license_type,max_supervisors,is_active,expires_at,country,city')
        .order('name')
        .abortSignal(signal);
      if (error) fail('تعذر تحميل الشركات.', error);
      return data as CompanyRow[];
    },
  });
}
export function useSaveCompany() {
  const { supervisor } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<CompanyRow> & { name: string }) => {
      if (supervisor?.role !== 'super_admin') throw new Error('هذه العملية للمدير الأعلى فقط.');
      const values = {
        name: c.name.trim(), name_en: c.name_en?.trim() || null,
        license_type: c.license_type || 'basic',
        max_supervisors: c.max_supervisors ?? 10,
        is_active: c.is_active ?? true,
        expires_at: c.expires_at || null,
        country: c.country?.trim() || null,
        city: c.city?.trim() || null,
      };
      if (!values.name) throw new Error('اسم الشركة مطلوب.');
      const r = c.id
        ? await supabase.from('companies').update(values).eq('id', c.id).select('id')
        : await supabase.from('companies').insert(values).select('id');
      if (r.error) fail('تعذر حفظ الشركة.', r.error);
      if (!r.data?.length) throw new Error('لم يتم الحفظ. تحقق من الصلاحيات.');
      const newCompanyId = r.data[0].id as string;
      if (!c.id) {
        // Automatically initialize default app_settings for the new company
        try {
          await supabase.from('app_settings').insert({
            company_id: newCompanyId,
            app_name: values.name,
            primary_color: '#1A56DB',
            success_color: '#10B981',
            danger_color: '#EF4444',
            background_color: '#F8FAFC',
            geofence_radius_m: 100,
            target_brand_name: values.name,
            competitor_brands: [],
            ai_audit_enabled: true,
          });
        } catch {
          // Non-blocking if trigger handles it
        }
      }
      return newCompanyId;
    },
    onSuccess: () => { notify(t('تم حفظ الشركة'), 'success'); void qc.invalidateQueries({ queryKey: ['mydan', 'super-admin', 'companies'] }); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Generic activate / deactivate record ---------- */
export function useToggleActiveRecord(table: 'branches' | 'customers' | 'products' | 'assets', queryKey: string) {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      requireAdmin(sc);
      const { error } = await supabase.from(table).update({ is_active }).eq('id', id).eq('company_id', sc.companyId);
      if (error) fail(t('تعذر التحديث.'), error);
    },
    onSuccess: (_, vars) => {
      notify(vars.is_active ? t('تم التفعيل بنجاح') : t('تم التعطيل بنجاح'), 'success');
      void invalidate(qc, sc, queryKey);
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function useDeactivateRecord(table: 'branches' | 'customers' | 'products' | 'assets', queryKey: string) {
  const toggle = useToggleActiveRecord(table, queryKey);
  return {
    ...toggle,
    mutate: (id: string) => toggle.mutate({ id, is_active: false }),
    mutateAsync: (id: string) => toggle.mutateAsync({ id, is_active: false }),
  };
}

/* ---------- Edit supervisor profile (admin-side, full fields) ---------- */
export function useEditSupervisorProfile() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, full_name, phone, role, branch_id }: { id: string; full_name: string; phone: string; role: InviteRole; branch_id: string }) => {
      requireAdmin(sc);
      const { data: existing } = await supabase.from('supervisors').select('role,branch_id').eq('id', id).eq('company_id', sc.companyId).single();
      if (existing?.role === 'super_admin') throw new Error(t('لا يمكن تعديل المدير الأعلى.'));
      if ((sc.supervisor.role as string) === 'branch_manager' || (sc.supervisor.role as string) === 'manager') {
        if ((role as string) === 'admin' || (role as string) === 'super_admin') {
          throw new Error(t('مدير الفرع لا يملك صلاحية تعيين رتبة مدير.'));
        }
        if (existing?.branch_id && existing.branch_id !== sc.supervisor.branch_id) {
          throw new Error(t('لا يمكنك تعديل مشرفين تابعين لفروع أخرى.'));
        }
      }
      const effectiveBranchId = ((sc.supervisor.role as string) === 'branch_manager' || (sc.supervisor.role as string) === 'manager') && sc.supervisor.branch_id
        ? sc.supervisor.branch_id
        : (branch_id || null);

      const patch = { full_name: full_name.trim(), phone: phone.trim() || null, role, branch_id: effectiveBranchId };
      if (!patch.full_name) throw new Error(t('الاسم مطلوب.'));

      // Use privileged admin_update_supervisor RPC exclusively (no direct update fallback)
      const { error: rpcErr } = await supabase.rpc('admin_update_supervisor', {
        p_supervisor_id: id,
        p_role: role,
        p_branch_id: effectiveBranchId || null,
        p_full_name: patch.full_name,
        p_phone: patch.phone,
        p_clear_branch: !effectiveBranchId,
      });

      if (rpcErr) {
        fail(t('تعذر تعديل بيانات المشرف.') + ' ' + (rpcErr.message || ''), rpcErr);
      }
    },
    onSuccess: () => { notify(t('تم تحديث بيانات المشرف'), 'success'); void invalidate(qc, sc, 'admin-supervisors'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function useDeleteSupervisor() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (target: Supervisor) => {
      requireAdmin(sc);
      if (target.id === sc.supervisorId) throw new Error(t('لا يمكنك حذف حسابك الشخصي.'));
      if (target.role === 'super_admin') throw new Error(t('لا يمكن حذف المدير الأعلى للنظام.'));
      
      // Strict server-side deletion via delete_supervisor_cascade RPC (no direct delete bypass)
      const { error: rpcErr } = await supabase.rpc('delete_supervisor_cascade', { p_supervisor_id: target.id });
      if (rpcErr) {
        fail(t('تعذر حذف المستخدم. قد يكون مرتبطاً ببيانات أخرى أو تفتقر للصلاحية المطلوبة.'), rpcErr);
      }
    },
    onSuccess: () => {
      notify(t('تم حذف المستخدم بنجاح'), 'success');
      void invalidate(qc, sc, 'admin-supervisors', 'admin-summary');
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

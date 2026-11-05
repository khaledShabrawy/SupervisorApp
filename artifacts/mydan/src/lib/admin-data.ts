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
import { useScope, usePaged, PHOTO_BUCKET } from './data';
import { useAuth } from '@/contexts/AuthContext';
import { signedMedia } from './private-media';
import { shelfMetrics, isMeasuredAudit } from './shelf-metrics';
import { readAllRows, readExactCount } from './read-count';
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
  const dateFrom = filters?.dateFrom || todayStr().slice(0, 8) + '01', dateTo = filters?.dateTo || todayStr();
  return useQuery({
    queryKey: [...sc.base, 'admin-kpis', dateFrom, dateTo, filters], enabled: sc.isAdmin, retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('mdn_admin_kpis_v1', {
        p_date_from: dateFrom, p_date_to: dateTo,
        p_region_id: filters?.regionId && filters.regionId !== 'all' ? filters.regionId : null,
        p_branch_id: filters?.branchId && filters.branchId !== 'all' ? filters.branchId : null,
        p_supervisor_id: filters?.supervisorId && filters.supervisorId !== 'all' ? filters.supervisorId : null,
      }).abortSignal(signal);
      if (error || !data) throw new Error('تعذر تحميل مؤشرات الفترة من الخادم.');
      return data as { supervisors: number; visitsToday: number; assets: number; openTickets: number; avgPss: number | null;
        audits30d: number; geofenceRate: number | null; onBeatVisits: number; oorVisits: number; totalGeoVisits: number;
        visitsTarget: number; visitsAchieved: number; achievementRate: number; auditsTarget: number; auditsAchieved: number };
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

export function useDeleteBranch() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (branch: Branch) => {
      requireAdmin(sc);
      // Check for any supervisors linked to this branch
      const { count: supCount, error: supErr } = await supabase
        .from('supervisors')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', sc.companyId)
        .eq('branch_id', branch.id);
      if (supErr) fail(t('تعذر التحقق من ارتباطات الفرع.'), supErr);
      if ((supCount ?? 0) > 0) {
        throw new Error(
          t('لا يمكن حذف هذا الفرع لأنه يحتوي على {n} مشرف/مشرفين مرتبطين به. يرجى نقل هؤلاء المشرفين إلى فرع آخر أو إلغاء ارتباطهم بالفرع أولاً ثم إعادة المحاولة.', { n: supCount ?? 0 })
        );
      }
      // Check for customers with matching branch name
      const { count: custCount, error: custErr } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', sc.companyId)
        .eq('branch', branch.name);
      if (custErr) fail(t('تعذر التحقق من ارتباطات الفرع.'), custErr);
      if ((custCount ?? 0) > 0) {
        throw new Error(
          t('لا يمكن حذف هذا الفرع لأنه مرتبط بـ {n} عميل في النظام. يرجى تحديث بيانات العملاء المعنيين أولاً.', { n: custCount ?? 0 })
        );
      }
      // Safe to delete
      const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', branch.id)
        .eq('company_id', sc.companyId);
      if (error) fail(t('تعذر حذف الفرع. قد يكون مرتبطاً ببيانات أخرى في النظام.'), error);
    },
    onSuccess: () => { notify(t('تم حذف الفرع بنجاح'), 'success'); void invalidate(qc, sc, 'branches'); },
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

export function useDeleteAdminCustomer() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      requireAdmin(sc);
      const role = sc.supervisor.role as string;
      if (!['admin', 'super_admin', 'branch_manager', 'manager'].includes(role)) {
        throw new Error(t('حذف العملاء نهائياً متاح للمدراء ومسؤولي النظام فقط.'));
      }
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id)
        .eq('company_id', sc.companyId);
      if (error) fail(t('تعذر حذف العميل. قد يكون مرتبطاً بزيارات أو طلبات سابقة.'), error);
    },
    onSuccess: () => { notify(t('تم حذف العميل بنجاح'), 'success'); void invalidate(qc, sc, 'admin-customers', 'customers'); },
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
    mutationFn: async ({ id, full_name, phone, role, branch_id, supervisor_code }: { id: string; full_name: string; phone: string; role: InviteRole; branch_id: string; supervisor_code?: string }) => {
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

      if (!full_name.trim()) throw new Error(t('الاسم مطلوب.'));

      const { data, error } = await supabase.rpc('mdn_admin_update_supervisor_v1', {
        p_supervisor_id: id,
        p_patch: { full_name: full_name.trim(), phone: phone.trim() || null, role,
          branch_id: effectiveBranchId, ...(supervisor_code !== undefined ? { supervisor_code: supervisor_code.trim() || null } : {}) },
      });
      if (error || !data) fail(t('تعذر تعديل بيانات المشرف.'), error);

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
      
      const { data, error } = await supabase.rpc('delete_supervisor_cascade', { p_supervisor_id: target.id });
      if (error || data !== true) fail('تعذر حذف المستخدم. تُحفظ السجلات التاريخية؛ يمكن تعطيل الحساب بدلاً من حذفها.', error);

    },
    onSuccess: () => {
      notify(t('تم حذف المستخدم بنجاح'), 'success');
      void invalidate(qc, sc, 'admin-supervisors', 'admin-summary');
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function useUpdateAdminTarget() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      id: string;
      visits_target: number;
      audit_target: number;
      target_amount?: number;
      criteria: string;
      scope_type: string;
      target_scope: string;
      supervisor_id?: string | null;
      branch_id?: string | null;
    }) => {
      requireAdmin(sc);
      const { error } = await supabase.from('targets').update({
        visits_target: row.visits_target,
        audit_target: row.audit_target,
        criteria: row.criteria,
        scope_type: row.scope_type,
        target_scope: row.target_scope,
        supervisor_id: row.supervisor_id ?? null,
        branch_id: row.branch_id ?? null,
      }).eq('id', row.id).eq('company_id', sc.companyId);
      if (error) fail(t('تعذر تحديث الهدف.'), error);

      if (row.supervisor_id) {
        void supabase.functions.invoke('push-notify', {
          body: {
            supervisorIds: [row.supervisor_id],
            title: 'تم تحديث أهدافك البيعية 🎯',
            body: `تم تعديل هدفك الشهري (${row.visits_target || 0} زيارة).`,
          },
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      notify(t('تم تحديث الهدف بنجاح'), 'success');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'admin-targets'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'targets'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'dashboard'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Admin Targets Queries & Mutations ---------- */
export interface AdminTargetRow {
  id: string;
  company_id: string;
  supervisor_id?: string | null;
  target_date: string;
  month?: number | null;
  year?: number | null;
  criteria?: string | null;
  visits_target?: number | null;
  audit_target?: number | null;
  target_amount?: number | null;
  actual_visits?: number | null;
  actual_audits?: number | null;
  scope_type?: string | null;
  target_scope?: string | null;
  branch_id?: string | null;
  created_at?: string | null;
  supervisors?: { id: string; full_name: string; phone?: string | null; supervisor_code?: string | null } | null;
  branches?: { id: string; name: string } | null;
}

export function useAdminTargets(month: number, year: number) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'admin-targets', month, year],
    enabled: sc.isAdmin,
    queryFn: async ({ signal }) => {
      const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('targets')
        .select(`
          id, company_id, supervisor_id, target_date, criteria,
          visits_target, audit_target, actual_visits, actual_audits,
          scope_type, target_scope, branch_id, created_at,
          supervisors(id, full_name, phone, supervisor_code),
          branches(id, name)
        `)
        .eq('company_id', sc.companyId)
        .or('criteria.is.null,criteria.neq.orders')
        .gte('target_date', `${monthPrefix}-01`)
        .lte('target_date', `${monthPrefix}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`)
        .order('created_at', { ascending: false })
        .abortSignal(signal);

      if (error) fail('تعذر تحميل الأهداف الشهرية.', error);
      return (data ?? []) as unknown as AdminTargetRow[];
    },
  });
}

export function useDeleteTarget() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      requireAdmin(sc);
      const { error } = await supabase.from('targets').delete().eq('id', id).eq('company_id', sc.companyId);
      if (error) fail('تعذر حذف الهدف.', error);
    },
    onSuccess: () => {
      notify(t('تم حذف الهدف بنجاح'), 'success');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'admin-targets'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'targets'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'dashboard'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}


export interface AdminShelfAuditRow {
  id: string;
  visit_id: string;
  supervisor_id: string;
  company_id: string;
  photo_url: string | null;
  signed_photo_url?: string | null;
  audit_summary_ar: string | null;
  audit_score: number | null;
  ai_detailed_report: any;
  status: string;
  audited_at: string | null;
  created_at?: string;
  supervisor_name?: string;
  supervisor_code?: string;
  customer_name?: string;
  branch_name?: string;
  our_facings?: number | null;
  competitor_facings?: number | null;
  shelf_share_pct?: number | null;
  [key: string]: any;
}

export function useAdminShelfAudits(filters: { branchId?: string; supervisorId?: string; dateFrom?: string; dateTo?: string } = {}) {
  const sc = useScope();
  return useQuery({
    queryKey: ['admin-shelf-audits', sc.companyId, filters],
    queryFn: async ({ signal }) => {
      requireAdmin(sc);
      const data = await readAllRows<any>(() => {
        let q = supabase.from('shelf_audit').select(`
          id,visit_id,supervisor_id,company_id,photo_url,audit_summary_ar,audit_score,ai_detailed_report,status,audited_at,created_at,
          supervisors(id,full_name,supervisor_code,branch_id,branches(id,name)),visits(id,customer_id,customers(id,name,customer_code))
        `).eq('company_id',sc.companyId).eq('status','completed');
        if (filters.supervisorId) q=q.eq('supervisor_id',filters.supervisorId);
        if (filters.dateFrom) q=q.gte('audited_at',filters.dateFrom);
        if (filters.dateTo) q=q.lte('audited_at',filters.dateTo+'T23:59:59.999Z');
        return q;
      }, signal, 'تعذر تحميل جميع مراجعات الرف.');
      const rows: AdminShelfAuditRow[] = await Promise.all((data ?? []).filter((row:any)=>isMeasuredAudit(row.ai_detailed_report)).sort((a:any,b:any)=>String(b.audited_at).localeCompare(String(a.audited_at))).map(async (row: any) => {
        const sup = row.supervisors;
        const visit = row.visits;
        const cust = visit?.customers;

        // Extract facings from ai_detailed_report if available
        const report = row.ai_detailed_report;
        const { ourFacings, competitorFacings, share } = shelfMetrics(report);
        const our = ourFacings, comp = competitorFacings;

        const signedUrl = await signedMedia(PHOTO_BUCKET,row.photo_url);

        return {
          ...row,
          audit_score: isMeasuredAudit(report) ? row.audit_score : null,
          signed_photo_url: signedUrl,
          supervisor_name: sup?.full_name || '—',
          supervisor_code: sup?.supervisor_code || '',
          customer_name: cust?.name || '—',
          branch_name: sup?.branches?.name || '',
          our_facings: our,
          competitor_facings: comp,
          shelf_share_pct: share,
        };
      }));

      // Filter by branch if requested
      if (filters.branchId) {
        return rows.filter((r: any) => r.supervisors?.branch_id === filters.branchId);
      }

      return rows;
    },
    enabled: !!sc.companyId,
  });
}


/* ---------- Admin Operations Alerts Hub ---------- */
export interface AdminAlertRow {
  id: string;
  company_id: string;
  supervisor_id: string;
  type: string;
  title_ar: string;
  body_ar: string;
  is_read: boolean;
  created_at: string;
  supervisors?: { id: string; full_name: string; phone?: string | null; supervisor_code?: string | null } | null;
}

export function useAdminAlerts(filterType?: string) {
  const sc = useScope();
  return useQuery({
    queryKey: ['admin-alerts', sc.companyId, filterType],
    queryFn: async () => {
      requireAdmin(sc);
      let q = (supabase.from('notifications') as any)
        .select(`
          id, company_id, supervisor_id, type, title_ar, body_ar, is_read, created_at,
          supervisors(id, full_name, phone, supervisor_code)
        `)
        .eq('company_id', sc.companyId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (filterType && filterType !== 'all') {
        q = q.eq('type', filterType);
      }

      const { data, error } = await q;
      if (error) {
        let fallback = (supabase.from('notifications') as any)
          .select('*')
          .eq('company_id', sc.companyId)
          .order('created_at', { ascending: false })
          .limit(100);
        if (filterType && filterType !== 'all') fallback = fallback.eq('type', filterType);
        const fbRes = await fallback;
        if (fbRes.error) throw fbRes.error;
        return (fbRes.data ?? []) as AdminAlertRow[];
      }
      return (data ?? []) as AdminAlertRow[];
    },
    enabled: !!sc.companyId,
    refetchInterval: 10000,
  });
}

export function useMarkAdminAlertRead() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | 'all') => {
      requireAdmin(sc);
      if (id === 'all') {
        const { error } = await supabase.from('notifications').update({ is_read: true }).eq('company_id', sc.companyId);
        if (error) fail(t('تعذر تحديث حالة التنبيهات.'), error);
      } else {
        const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id).eq('company_id', sc.companyId);
        if (error) fail(t('تعذر تحديث حالة التنبيه.'), error);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useScope, usePaged } from './data';
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
export function useAdminKpis() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'admin-kpis', todayStr()], enabled: sc.isAdmin, retry: 1,
    queryFn: async ({ signal }) => {
      const count = (table: string, build: (q: any) => any = (q) => q) => // eslint-disable-line @typescript-eslint/no-explicit-any
        readExactCount((head) => build(supabase.from(table).select('id', { count: 'exact', head }).eq('company_id', sc.companyId)),
          signal, 'تعذر حساب مؤشرات الإدارة.');
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [supervisors, visitsToday, assets, openTickets, scores] = await Promise.all([
        count('supervisors', (q) => q.eq('is_active', true)),
        count('visits', (q) => q.gte('visit_date', todayStr())),
        count('assets', (q) => q.eq('is_active', true)),
        count('asset_tickets', (q) => q.in('status', ['open', 'dispatched', 'in_progress'])),
        supabase.from('shelf_audit').select('audit_score').eq('company_id', sc.companyId).eq('status', 'completed')
          .gte('created_at', since).not('audit_score', 'is', null).limit(1000).abortSignal(signal),
      ]);
      if (scores.error) fail('تعذر حساب متوسط PSS.', scores.error);
      const list = (scores.data ?? []).map((r) => Number(r.audit_score));
      const avgPss = list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
      return { supervisors, visitsToday, assets, openTickets, avgPss, audits30d: list.length };
    },
  });
}

/* ---------- Branches ---------- */
export type Branch = { id: string; name: string; region: string | null; manager_id: string | null; latitude: number | null; longitude: number | null; is_active: boolean };
export function useBranches() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'branches'], retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('branches').select('id,name,region,manager_id,latitude,longitude,is_active')
        .eq('company_id', sc.companyId).order('name').abortSignal(signal);
      if (error) fail('تعذر تحميل الفروع.', error);
      return data as Branch[];
    },
  });
}
export function useSaveBranch() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: Omit<Branch, 'id'> & { id?: string }) => {
      requireAdmin(sc);
      const values = { name: b.name.trim(), region: b.region?.trim() || null, manager_id: b.manager_id || null,
        latitude: b.latitude, longitude: b.longitude, is_active: b.is_active };
      if (!values.name) throw new Error('اسم الفرع مطلوب.');
      const r = b.id
        ? await supabase.from('branches').update(values).eq('id', b.id).eq('company_id', sc.companyId).select('id')
        : await supabase.from('branches').insert({ ...values, company_id: sc.companyId }).select('id');
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
    mutationFn: async (input: { email: string; full_name: string; phone: string; role: InviteRole; branch_id: string;
      permissions: Record<ScreenKey, boolean> }) => {
      requireAdmin(sc);
      const email = input.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('البريد الإلكتروني غير صالح.');
      if (!input.full_name.trim()) throw new Error('الاسم مطلوب.');
      const { data, error } = await supabase.functions.invoke('invite-supervisor', {
        body: { ...input, email, full_name: input.full_name.trim(), phone: input.phone.trim() || null,
          branch_id: input.branch_id || null, redirect_to: `${window.location.origin}${import.meta.env.BASE_URL}set-password` },
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
    mutationFn: async (p: { id?: string; name: string; category: string; sku: string; is_active: boolean }) => {
      requireAdmin(sc);
      const values = { name: p.name.trim(), category: p.category.trim() || null, sku_code: p.sku.trim() || null, is_active: p.is_active };
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
  active: ['يعمل', 'b-green'], defective: ['معطل', 'b-red'], under_maintenance: ['تحت الصيانة', 'b-yellow'], retired: ['خارج الخدمة', 'b-gray'],
};
export type AssetRow = { id: string; asset_code: string; asset_type_id: string; customer_id: string | null; serial_number: string | null;
  model: string | null; status: string; is_active: boolean;
  asset_types: { name_ar: string; icon: string } | null; customers: { name: string } | null };
export function useAssets(search: string) {
  const sc = useScope();
  return usePaged<AssetRow>(sc, 'assets', [search], async (from, to, signal) => {
    let q = supabase.from('assets').select('id,asset_code,asset_type_id,customer_id,serial_number,model,status,is_active,asset_types(name_ar,icon),customers(name)')
      .eq('company_id', sc.companyId);
    const s = search.trim().replace(/[%,()]/g, '');
    if (s) q = q.or(`asset_code.ilike.%${s}%,serial_number.ilike.%${s}%`);
    const { data, error } = await q.order('asset_code').range(from, to).abortSignal(signal);
    if (error) fail('تعذر تحميل الأصول.', error);
    return data as unknown as AssetRow[];
  }, sc.isAdmin);
}
export function useSaveAsset() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id?: string; asset_code: string; asset_type_id: string; customer_id: string; serial_number: string; model: string; status: string }) => {
      requireAdmin(sc);
      const values = { asset_code: a.asset_code.trim(), asset_type_id: a.asset_type_id, customer_id: a.customer_id || null,
        serial_number: a.serial_number.trim() || null, model: a.model.trim() || null, status: a.status };
      if (!values.asset_code || !values.asset_type_id) throw new Error('كود الأصل ونوعه مطلوبان.');
      if (!(values.status in ASSET_STATUS)) throw new Error('حالة الأصل غير صالحة.');
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
      .select('id,table_name,action,performed_by,old_data,new_data,created_at,supervisors(full_name)')
      .eq('company_id', sc.companyId);
    if (tableFilter) q = q.eq('table_name', tableFilter);
    const { data, error } = await q.order('created_at', { ascending: false }).range(from, to).abortSignal(signal);
    if (error) fail('تعذر تحميل سجل المراجعة.', error);
    return data as unknown as AuditRow[];
  }, sc.isAdmin);
}

/* ---------- Admin Customers ---------- */
export type AdminCustomerRow = {
  id: string; name: string; type: string; customer_type: string | null;
  owner_name: string | null; phone: string | null; address: string;
  latitude: number | null; longitude: number | null; branch: string | null;
  supervisor_id: string | null; is_active: boolean;
  supervisors: { full_name: string } | null;
};
export function useAdminCustomers(search: string) {
  const sc = useScope();
  return usePaged<AdminCustomerRow>(sc, 'admin-customers', [search], async (from, to, signal) => {
    const term = search.trim().replace(/[%,()]/g, '');
    let q = supabase.from('customers')
      .select('id,name,type,customer_type,owner_name,phone,address,latitude,longitude,branch,supervisor_id,is_active,supervisors(full_name)')
      .eq('company_id', sc.companyId);
    if (term) q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%,address.ilike.%${term}%`);
    const { data, error } = await q.order('name').order('id').range(from, to).abortSignal(signal);
    if (error) fail('تعذر تحميل العملاء.', error);
    return data as unknown as AdminCustomerRow[];
  }, sc.isAdmin);
}
export function useSaveAdminCustomer() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: { id?: string; name: string; type: string; owner_name: string; phone: string;
      address: string; latitude: number | null; longitude: number | null;
      branch: string; supervisor_id: string; is_active: boolean }) => {
      requireAdmin(sc);
      if (!c.name.trim() || !c.type.trim() || !c.address.trim()) throw new Error('الاسم والنوع والعنوان مطلوبة.');
      const values = { name: c.name.trim(), type: c.type.trim(), owner_name: c.owner_name.trim() || null,
        phone: c.phone.trim() || null, address: c.address.trim(), latitude: c.latitude, longitude: c.longitude,
        branch: c.branch.trim() || null, supervisor_id: c.supervisor_id || null, is_active: c.is_active };
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
export type SurveyQuestion = { text: string; type: 'text' | 'rating' | 'choice'; options?: string[] };
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

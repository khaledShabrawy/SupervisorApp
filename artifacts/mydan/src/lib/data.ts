import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { customerRecord, type CustomerInput } from './customer-record';
export type { CustomerInput } from './customer-record';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { canAdmin } from '@/lib/policy';
import { readExactCount } from './read-count';
import { notify } from '@/lib/toast';
import { todayStr } from '@/lib/format';
import type { Attendance, BeatPlan, Customer, Notification, ShelfAudit, Supervisor, Target, Visit } from '@/types/database';
import type { VisitOutcome } from './visit-geo';
import { t } from '@/i18n';
import { AUDIT_COLUMNS, CUSTOMER_COLUMNS, NOTIFICATION_COLUMNS, TARGET_COLUMNS, VISIT_COLUMNS, VISIT_JOIN } from './columns';

export const PAGE = 20;
export const PHOTO_BUCKET = 'shelf-photos';
// No presumed external AI service: configure the deployed function explicitly.
export const AUDIT_FUNCTION = import.meta.env.VITE_SHELF_AUDIT_FUNCTION as string | undefined;
export type VisitRow = Visit & { customers: Pick<Customer, 'name' | 'address' | 'latitude' | 'longitude'> | null };
export type BeatRow = BeatPlan & { customers: Customer | null };

function fail(message: string, e: { message?: string } | null): never {
  throw new Error(e?.message ? `${message} (${e.message})` : message);
}
const nowIso = () => new Date().toISOString();

export function useScope() {
  const { supervisor } = useAuth();
  const s = supervisor as Supervisor;
  return useMemo(() => {
    if (!s) throw new Error('بيانات المشرف غير جاهزة. أعد تسجيل الدخول.');
    const isAdmin = canAdmin(s);
    const base = ['mydan', s.company_id, s.id, s.role] as const;
    const scope = (q: any, field = 'supervisor_id') => { q = q.eq('company_id', s.company_id); return isAdmin ? q : q.eq(field, s.id); };
    return { supervisor: s, companyId: s.company_id, supervisorId: s.id, isAdmin, base, scope };
  }, [s]);
}
type Scope = ReturnType<typeof useScope>;
const inv = (qc: QueryClient, sc: Scope, ...names: string[]) =>
  Promise.all(names.map((n) => qc.invalidateQueries({ queryKey: [...sc.base, n] })));

export function usePaged<T>(sc: Scope, name: string, params: unknown[],
  load: (from: number, to: number, signal: AbortSignal) => Promise<T[]>, enabled = true) {
  const q = useInfiniteQuery({
    queryKey: [...sc.base, name, ...params], enabled, initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => load(pageParam, pageParam + PAGE - 1, signal),
    getNextPageParam: (last, all) => last.length === PAGE ? all.length * PAGE : undefined,
    retry: 1,
    refetchInterval: (query) => name === 'audits'
      && query.state.data?.pages.some(page => page.some(row => (row as ShelfAudit).status === 'processing'))
      ? 5000 : false,
  });
  const items = useMemo(() => (q.data?.pages.flat() ?? []) as T[], [q.data]);
  return { ...q, items };
}

async function exact(sc: Scope, table: string, signal: AbortSignal,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (q: any) => any = (q) => q, field = 'supervisor_id') {
  return readExactCount(head => build(sc.scope(supabase.from(table).select('id', { count: 'exact', head }), field)),
    signal, 'تعذر حساب الإحصائيات. تحقق من الاتصال والصلاحيات.');
}

/* ---------- Dashboard ---------- */
export function useDashboard() {
  const sc = useScope(); const today = todayStr();
  return useQuery({
    queryKey: [...sc.base, 'dashboard', today], retry: 1,
    queryFn: async ({ signal }) => {
      const byDate = (q: any) => q.eq('visit_date', today); // eslint-disable-line @typescript-eslint/no-explicit-any
      const [visits, completed, inProgress, pending, customers, att, live] = await Promise.all([
        exact(sc, 'visits', signal, byDate),
        exact(sc, 'visits', signal, (q) => byDate(q).eq('status', 'completed')),
        exact(sc, 'visits', signal, (q) => byDate(q).eq('status', 'in_progress')),
        exact(sc, 'visits', signal, (q) => byDate(q).eq('status', 'pending')),
        exact(sc, 'customers', signal, (q) => q.eq('is_active', true)),
        supabase.from('attendance').select('id,supervisor_id,date,check_in,check_out,company_id').eq('company_id', sc.companyId).eq('supervisor_id', sc.supervisorId)
          .eq('date', today).abortSignal(signal).maybeSingle(),
        sc.scope(supabase.from('visits').select(VISIT_JOIN)).eq('status', 'in_progress')
          .order('check_in_time', { ascending: false }).limit(5).abortSignal(signal),
      ]);
      if (att.error) fail('تعذر تحميل الحضور.', att.error);
      if (live.error) fail('تعذر تحميل الزيارات الجارية.', live.error);
      return { visits, completed, inProgress, pending, customers,
        attendance: (att.data ?? null) as Attendance | null, live: (live.data ?? []) as VisitRow[] };
    },
  });
}
export function useAttendanceAction() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { kind: 'in' | 'out'; row: Attendance | null }) => {
      if (a.kind === 'in') {
        const { error } = await supabase.from('attendance').insert({ supervisor_id: sc.supervisorId, company_id: sc.companyId, date: todayStr(), check_in: nowIso() });
        if (error) fail('تعذر تسجيل الحضور.', error);
      } else {
        const { error } = await supabase.from('attendance').update({ check_out: nowIso() }).eq('id', a.row!.id)
          .eq('company_id', sc.companyId).eq('supervisor_id', sc.supervisorId).select('id').single();
        if (error) fail('تعذر تسجيل الانصراف.', error);
      }
    },
    onSuccess: (_d, v) => { notify(v.kind === 'in' ? 'تم تسجيل الحضور' : 'تم تسجيل الانصراف', 'success'); void inv(qc, sc, 'dashboard'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Visits ---------- */
export function useVisits(status: string) {
  const sc = useScope();
  return usePaged<VisitRow>(sc, 'visits', [status], async (from, to, signal) => {
    let q = sc.scope(supabase.from('visits').select(VISIT_JOIN));
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q.order('visit_date', { ascending: false }).order('id', { ascending: false }).range(from, to).abortSignal(signal);
    if (error) fail('تعذر تحميل الزيارات.', error);
    return data as VisitRow[];
  });
}
export function useVisitOptions() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'visit-options'], retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await sc.scope(supabase.from('visits').select(VISIT_JOIN))
        .neq('status', 'skipped').order('visit_date', { ascending: false }).limit(50).abortSignal(signal);
      if (error) fail('تعذر تحميل الزيارات.', error);
      return data as VisitRow[];
    },
  });
}
export function useUpdateVisitStatus() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'completed' | 'skipped' }) => {
      const patch: Partial<Visit> = { status };
      if (status === 'completed') patch.check_out_time = nowIso();
      const { data, error } = await sc.scope(supabase.from('visits').update(patch).eq('id', id)).select('id');
      if (error) fail('تعذر تحديث الزيارة.', error);
      if (!data?.length) throw new Error('لم يتم تحديث الزيارة. قد لا تملك الصلاحية.');
    },
    onSuccess: () => { notify('تم تحديث حالة الزيارة', 'success'); void inv(qc, sc, 'visits', 'visit-options', 'customers', 'dashboard', 'targets'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
export function useCreateVisit() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { customer_id: string; latitude: number; longitude: number; notes: string; existingId?: string;
      geo_distance: number | null; on_beat: boolean }) => {
      // geo_distance/on_beat feed the OOR (out-of-route) KPIs in the reporting views.
      const geo = { geo_distance: v.geo_distance, on_beat: v.on_beat };
      if (v.existingId) {
        const { data, error } = await sc.scope(supabase.from('visits').update({
          status: 'in_progress', check_in_time: nowIso(), latitude: v.latitude,
          longitude: v.longitude, notes: v.notes.trim() || null, ...geo,
        }).eq('id', v.existingId).eq('customer_id', v.customer_id).eq('status', 'pending'))
          .select('id').single();
        if (error || !data) fail('تعذر بدء الزيارة. ربما تغيّرت حالتها أو صلاحياتها.', error);
        return data as { id: string };
      }
      const { data, error } = await supabase.from('visits').insert({
        supervisor_id: sc.supervisorId, company_id: sc.companyId, customer_id: v.customer_id, visit_date: todayStr(),
        status: 'in_progress', check_in_time: nowIso(), latitude: v.latitude, longitude: v.longitude, notes: v.notes.trim() || null, ...geo,
      }).select('id').single();
      if (error) fail('تعذر إنشاء الزيارة.', error);
      return data as { id: string };
    },
    onSuccess: () => { notify('تم بدء الزيارة وتسجيل الدخول', 'success'); void inv(qc, sc, 'visits', 'visit-options', 'customers', 'dashboard', 'beat'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function useSetVisitOutcome() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, outcome }: { id: string; outcome: VisitOutcome }) => {
      const { data, error } = await sc.scope(supabase.from('visits').update({ visit_outcome: outcome }).eq('id', id)).select('id');
      if (error) fail('تعذر حفظ نتيجة الزيارة.', error);
      if (!data?.length) throw new Error('لم يتم حفظ النتيجة. قد لا تملك الصلاحية.');
    },
    onSuccess: () => { notify('تم حفظ نتيجة الزيارة', 'success'); void inv(qc, sc, 'visit-detail', 'visits', 'dashboard'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
/** Active customers that have coordinates — ranked client-side by distance from the supervisor. */
export function useLocatedCustomers() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'customers', 'located'], retry: 1, staleTime: 120_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('customers').select(CUSTOMER_COLUMNS).eq('company_id', sc.companyId)
        .eq('is_active', true).not('latitude', 'is', null).not('longitude', 'is', null).limit(2000).abortSignal(signal);
      if (error) fail('تعذر تحميل العملاء القريبين.', error);
      return data as Customer[];
    },
  });
}
export function useVisitToStart(id: string | null) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'visit-to-start', id], enabled: !!id, retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await sc.scope(supabase.from('visits').select(`${VISIT_COLUMNS},customers(${CUSTOMER_COLUMNS})`))
        .eq('id', id!).eq('status', 'pending').abortSignal(signal).single();
      if (error) fail('تعذر تحميل الزيارة المعلقة. ربما بدأت بالفعل.', error);
      return data as Visit & { customers: Customer | null };
    },
  });
}

/* ---------- Customers ---------- */
export function useCustomers(search: string) {
  const sc = useScope(); const term = search.trim().replace(/[%,()]/g, ' ');
  return usePaged<Customer>(sc, 'customers', [term], async (from, to, signal) => {
    let q = supabase.from('customers').select(CUSTOMER_COLUMNS).eq('company_id', sc.companyId);
    if (term) q = q.or(`name.ilike.%${term}%,address.ilike.%${term}%`);
    const { data, error } = await q.order('name').order('id').range(from, to).abortSignal(signal);
    if (error) fail('تعذر تحميل العملاء.', error);
    return data as Customer[];
  });
}
export function useCustomerSearch(search: string) {
  const sc = useScope(); const term = search.trim().replace(/[%,()]/g, ' ');
  return useQuery({
    queryKey: [...sc.base, 'customer-search', term], retry: 1,
    queryFn: async ({ signal }) => {
      let q = supabase.from('customers').select(CUSTOMER_COLUMNS).eq('company_id', sc.companyId).eq('is_active', true);
      if (term) q = q.ilike('name', `%${term}%`);
      const { data, error } = await q.order('name').limit(15).abortSignal(signal);
      if (error) fail('تعذر البحث عن العملاء.', error);
      return data as Customer[];
    },
  });
}
export function useSaveCustomer() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CustomerInput }) => {
      const values = customerRecord(input);
      if (id) {
        const { data, error } = await sc.scope(supabase.from('customers').update(values).eq('id', id)).select('id');
        if (error) fail('تعذر حفظ العميل.', error);
        if (!data?.length) throw new Error('لم يتم حفظ التعديل. قد لا تملك الصلاحية.');
      } else {
        const { error } = await supabase.from('customers').insert({ ...values, company_id: sc.companyId, supervisor_id: sc.supervisorId });
        if (error) fail('تعذر إضافة العميل.', error);
      }
    },
    onSuccess: () => { notify('تم حفظ العميل', 'success'); void inv(qc, sc, 'customers', 'customer-search', 'beat', 'dashboard'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Shelf audits ---------- */
export function useShelfAudits() {
  const sc = useScope();
  return usePaged<ShelfAudit>(sc, 'audits', [], async (from, to, signal) => {
    const { data, error } = await sc.scope(supabase.from('shelf_audit').select(AUDIT_COLUMNS))
      .order('created_at', { ascending: false, nullsFirst: true }).order('id').range(from, to).abortSignal(signal);
    if (error) fail('تعذر تحميل سجلات الرف.', error);
    return Promise.all((data as ShelfAudit[]).map(async (audit) => {
      if (!audit.photo_url || /^https:\/\//.test(audit.photo_url)) return audit;
      const { data: photo, error: photoError } = await supabase.storage.from(PHOTO_BUCKET)
        .createSignedUrl(audit.photo_url, 600);
      if (photoError || !photo) fail('تعذر تحميل صورة الرف الخاصة.', photoError);
      return { ...audit, photo_url: photo.signedUrl };
    }));
  });
}
export function useSubmitAudit() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visit, file }: { visit: VisitRow; file: File }) => {
      if (!file.type.startsWith('image/')) throw new Error('الملف المختار ليس صورة.');
      if (file.size > 10 * 1024 * 1024) throw new Error('حجم الصورة أكبر من 10 ميجابايت.');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${sc.companyId}/${sc.supervisorId}/${visit.id}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) fail(t('تعذر رفع الصورة. تأكد من وجود الحاوية "{bucket}" وصلاحياتها.', { bucket: PHOTO_BUCKET }), up.error);
      const { error, status } = await supabase.from('shelf_audit').insert({
        visit_id: visit.id, supervisor_id: sc.supervisorId, company_id: sc.companyId, photo_url: path, status: 'pending',
      });
      if (error) {
        // Only remove an object after a definite rejection. A timeout or lost
        // response can occur after a successful insert; preserve its photo.
        if (status >= 400 && status < 500 && status !== 408) {
          const cleanup = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
          if (cleanup.error) fail('تعذر حفظ سجل المراجعة وتعذر حذف الصورة غير المرتبطة.', cleanup.error);
          fail('تعذر حفظ سجل المراجعة؛ أزيلت الصورة غير المرتبطة.', error);
        }
        fail('تم رفع الصورة لكن لم يتأكد حفظ سجل المراجعة. احتُفظ بالصورة لتجنب حذف ملف قد يكون مرتبطًا بسجل محفوظ.', error);
      }
    },
    onSuccess: () => { notify('تم حفظ صورة الرف', 'success'); void inv(qc, sc, 'audits'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
export function useAnalyzeAudit() {
  const sc = useScope(); const qc = useQueryClient(); const settings = useAppSettings();
  return useMutation({
    mutationFn: async (audit: ShelfAudit) => {
      if (!settings.ai_audit_enabled) throw new Error('تحليل الرف غير مفعّل لشركتك.');
      if (!AUDIT_FUNCTION) throw new Error('وظيفة تحليل الرف غير مُعدّة. يلزم ضبط VITE_SHELF_AUDIT_FUNCTION باسم الوظيفة المنشورة.');
      const { error } = await supabase.functions.invoke(AUDIT_FUNCTION, {
        body: { audit_id: audit.id },
      });
      if (error) fail(t('تعذر تشغيل دالة التحليل "{fn}". قد تكون غير منشورة.', { fn: AUDIT_FUNCTION }), error);
    },
    onSuccess: () => { notify('اكتمل طلب التحليل', 'success'); void inv(qc, sc, 'audits'); },
    onError: (e: Error) => { notify(e.message, 'error'); void inv(qc, sc, 'audits'); },
  });
}

/* ---------- Targets ---------- */
export function useTargets(month: number, year: number) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'targets', month, year], retry: 1,
    queryFn: async ({ signal }) => {
      const t = await sc.scope(supabase.from('targets').select(TARGET_COLUMNS))
        .eq('month', month).eq('year', year).limit(1000).abortSignal(signal);
      if (t.error) fail('تعذر تحميل الأهداف.', t.error);
      return { targets: (t.data ?? []) as Target[] };
    },
  });
}

/* ---------- Beat plan ---------- */

/** الأيام التي فيها زيارات مخططة للمشرف الحالي — ديناميكية من DB */
export function useBeatPlanDays() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'beat-days'],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await sc.scope(
        supabase.from('beat_plans').select('day_of_week')
      ).abortSignal(signal);
      if (error) fail('تعذر تحميل أيام الخطة.', error);
      const unique = [...new Set((data as { day_of_week: number }[]).map((r) => r.day_of_week))];
      return unique.sort((a, b) => a - b); // 0=أحد → 6=سبت
    },
  });
}

export function useBeatPlan(day: number) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'beat', day], retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await sc.scope(supabase.from('beat_plans').select(`id,supervisor_id,day_of_week,customer_id,company_id,customers(${CUSTOMER_COLUMNS})`))
        .eq('day_of_week', day).limit(300).abortSignal(signal);
      if (error) fail('تعذر تحميل خطة الزيارات.', error);
      const visits = await sc.scope(supabase.from('visits').select('customer_id,status')).eq('visit_date', todayStr()).limit(1000).abortSignal(signal);
      if (visits.error) fail('تعذر تحميل زيارات اليوم.', visits.error);
      return { plan: data as BeatRow[], visited: new Map((visits.data as Visit[]).map((v) => [v.customer_id, v.status])) };
    },
  });
}

/* ---------- Notifications ---------- */
export function useNotifications(unreadOnly: boolean) {
  const sc = useScope();
  return usePaged<Notification>(sc, 'notifications', ['list', unreadOnly], async (from, to, signal) => {
    let q = supabase.from('notifications').select(NOTIFICATION_COLUMNS).eq('supervisor_id', sc.supervisorId);
    if (unreadOnly) q = q.eq('is_read', false);
    const { data, error } = await q.order('created_at', { ascending: false }).order('id').range(from, to).abortSignal(signal);
    if (error) fail('تعذر تحميل الإشعارات.', error);
    return data as Notification[];
  });
}
export function useUnreadCount() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'notifications', 'unread'], retry: 1, refetchInterval: 120_000,
    queryFn: async ({ signal }) => {
      return readExactCount(head => supabase.from('notifications').select('id', { count: 'exact', head })
        .eq('supervisor_id', sc.supervisorId).eq('is_read', false), signal, 'تعذر عد الإشعارات.');
    },
  });
}
export function useMarkRead() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | 'all') => {
      let q = supabase.from('notifications').update({ is_read: true }).eq('supervisor_id', sc.supervisorId);
      q = id === 'all' ? q.eq('is_read', false) : q.eq('id', id);
      const { error } = await q;
      if (error) fail('تعذر تحديث الإشعارات.', error);
    },
    onSuccess: (_d, id) => { if (id === 'all') notify('تم تعليم الكل كمقروء', 'success'); void inv(qc, sc, 'notifications'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

/* ---------- Admin ---------- */
export function useSupervisors() {
  const sc = useScope();
  return usePaged<Supervisor>(sc, 'admin-supervisors', [], async (from, to, signal) => {
    const { data, error } = await supabase.from('supervisors').select('id,user_id,full_name,phone,role,branch_id,company_id,is_active')
      .eq('company_id', sc.companyId).order('full_name').order('id').range(from, to).abortSignal(signal);
    if (error) fail('تعذر تحميل المشرفين.', error);
    return data as Supervisor[];
  }, sc.isAdmin);
}
export function useAdminSummary() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'admin-summary'], enabled: sc.isAdmin, retry: 1,
    queryFn: async ({ signal }) => {
      const c = async (onlyActive: boolean) => {
        return readExactCount(head => {
          let q = supabase.from('supervisors').select('id', { count: 'exact', head }).eq('company_id', sc.companyId);
          if (onlyActive) q = q.eq('is_active', true);
          return q;
        }, signal, 'تعذر حساب المشرفين.');
      };
      const [total, active] = await Promise.all([c(false), c(true)]);
      return { total, active };
    },
  });
}
export function useUpdateSupervisor() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ target, patch }: { target: Supervisor; patch: { is_active?: boolean; role?: 'admin' | 'supervisor' } }) => {
      if (!sc.isAdmin) throw new Error('هذه العملية للمدراء فقط.');
      if (target.id === sc.supervisorId) throw new Error('لا يمكنك تعديل حسابك.');
      if (target.role === 'super_admin') throw new Error('لا يمكن تعديل المدير الأعلى.');
      if (patch.role && !['admin', 'supervisor'].includes(patch.role)) throw new Error('دور غير مسموح.');
      const { data, error } = await supabase.from('supervisors').update(patch).eq('id', target.id).eq('company_id', sc.companyId).select('id');
      if (error) fail('تعذر تحديث المشرف.', error);
      if (!data?.length) throw new Error('لم يتم التحديث. قد لا تملك الصلاحية.');
    },
    onSuccess: () => { notify('تم تحديث المشرف', 'success'); void inv(qc, sc, 'admin-supervisors', 'admin-summary'); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

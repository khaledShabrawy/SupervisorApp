import { newMutationId, isRetryableMutationError } from './mutation-receipt';
import { insertScopedOnce, finishAttendanceOnce } from './persistent-mutation';
import { finishVisitOnce } from './visit-task-completion';
import { getOfflineQueue } from './offline-sync';
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

import { enqueueOfflineAction } from './offline-sync';

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

  try {

    return await readExactCount(head => build(sc.scope(supabase.from(table).select('id', { count: 'exact', head }), field)),

      signal, 'تعذر حساب الإحصائيات. تحقق من الاتصال والصلاحيات.');

  } catch {

    return 0;

  }

}



/* ---------- Dashboard ---------- */

export function useDashboard() {

  const sc = useScope(); const today = todayStr();

  return useQuery({

    queryKey: [...sc.base, 'dashboard', today], retry: 1, refetchInterval: 60_000,

    queryFn: async ({ signal }) => {

      const byDate = (q: any) => q.eq('visit_date', today); // eslint-disable-line @typescript-eslint/no-explicit-any

      const [visits, completed, inProgress, pending, customers, att, live] = await Promise.all([

        exact(sc, 'visits', signal, byDate),

        exact(sc, 'visits', signal, (q) => byDate(q).eq('status', 'completed')),

        exact(sc, 'visits', signal, (q) => byDate(q).eq('status', 'in_progress')),

        exact(sc, 'visits', signal, (q) => byDate(q).eq('status', 'pending')),

        exact(sc, 'customers', signal, (q) => q.eq('is_active', true)),

        supabase.from('attendance').select('id,supervisor_id,company_id,attendance_date,check_in_time,check_out_time,check_in_lat,check_in_lng,selfie_url,notes').eq('company_id', sc.companyId).eq('supervisor_id', sc.supervisorId)

          .eq('attendance_date', today).abortSignal(signal).maybeSingle(),

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

    mutationFn: async (a: { kind: 'in' | 'out'; row: Attendance | null; lat?: number | null; lng?: number | null }) => {

      const timestamp = nowIso(); const today = todayStr();
      const payload = a.kind === 'in'
        ? { id: newMutationId(), kind: 'in', attendance_date: today, check_in_time: timestamp, check_in_lat: a.lat ?? null, check_in_lng: a.lng ?? null }
        : { id: a.row?.id, kind: 'out', attendance_date: today, check_out_time: timestamp };
      const saveLocally = () => {
        enqueueOfflineAction({ type: 'attendance_action', companyId: sc.companyId, supervisorId: sc.supervisorId, payload });
        return { queued: true };
      };
      if (!navigator.onLine) return saveLocally();
      try {
        const { kind: _, ...values } = payload;
        const row = { ...values, company_id: sc.companyId, supervisor_id: sc.supervisorId };
        if (a.kind === 'in') await insertScopedOnce('attendance', row);
        else await finishAttendanceOnce(row);
        return { queued: false };
      } catch (error) {
        if (!isRetryableMutationError(error)) throw error;
        return saveLocally();
      }
    },

    onSuccess: (result, v) => {

      const online = !result.queued;

      const msg = v.kind === 'in'

        ? (online ? t('تم تسجيل الحضور') : t('📶 تم حفظ الحضور محلياً. اضغط رفع البيانات عند توفر الشبكة'))

        : (online ? t('تم تسجيل الانصراف') : t('📶 تم حفظ الانصراف محلياً. اضغط رفع البيانات عند توفر الشبكة'));

      notify(msg, 'success');

      void inv(qc, sc, 'dashboard', 'attendance-today');

    },

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
    mutationFn: async ({id,status}:{id:string;status:'completed'|'skipped'}) => {
      const existing=getOfflineQueue(sc.companyId,sc.supervisorId).find(row=>row.type==='update_visit_status'&&row.payload.id===id&&row.payload.status===status);
      if(existing)return {queued:true};
      const checkOut=status==='completed'?nowIso():null;
      try {
        if(!navigator.onLine)throw new Error('Offline');
        await finishVisitOnce(supabase,{companyId:sc.companyId,supervisorId:sc.supervisorId},id,status,checkOut);
        return {queued:false};
      } catch(error) {
        if(!isRetryableMutationError(error))throw error;
        enqueueOfflineAction({type:'update_visit_status',companyId:sc.companyId,supervisorId:sc.supervisorId,payload:{id,status,check_out_time:checkOut}});
        return {queued:true};
      }
    },
    onSuccess: result => {
      notify(t(result.queued?'📶 تم حفظ حالة الزيارة دون اتصال. اضغط "رفع البيانات" عند توفر الشبكة':'تم تحديث حالة الزيارة'),'success');
      void inv(qc,sc,'visits','visit-options','customers','dashboard','targets');
    },
    onError:(error:Error)=>notify(error.message,'error'),
  });
}

export function useCreateVisit() {

  const sc = useScope(); const qc = useQueryClient();

  return useMutation({

    mutationFn: async (v: { customer_id: string; latitude: number; longitude: number; notes: string; existingId?: string;

      geo_distance: number | null; on_beat: boolean }) => {

      const id = v.existingId || newMutationId();
      const timestamp = nowIso();
      const payload = { ...v, id, check_in_time: timestamp, visit_date: todayStr() };
      const saveLocally = () => {
        enqueueOfflineAction({ type: 'create_visit', companyId: sc.companyId, supervisorId: sc.supervisorId, payload });
        return { id, queued: true };
      };
      if (!navigator.onLine) return saveLocally();
      try {
        if (v.existingId) {
          const { data, error } = await sc.scope(supabase.from('visits').update({
            status: 'in_progress', check_in_time: timestamp, latitude: v.latitude, longitude: v.longitude,
            notes: v.notes.trim() || null, geo_distance: v.geo_distance, on_beat: v.on_beat,
          }).eq('id', id).eq('customer_id', v.customer_id).eq('status', 'pending')).select('id').single();
          if (error || !data) throw error ?? new Error('Missing visit receipt');
        } else {
          await insertScopedOnce('visits', {
            id, supervisor_id: sc.supervisorId, company_id: sc.companyId, customer_id: v.customer_id,
            visit_date: payload.visit_date, status: 'in_progress', check_in_time: timestamp,
            latitude: v.latitude, longitude: v.longitude, notes: v.notes.trim() || null,
            geo_distance: v.geo_distance, on_beat: v.on_beat,
          });
        }
        if (v.on_beat === false) {
          const distance = v.geo_distance == null ? 'غير محددة' : String(Math.round(v.geo_distance)) + 'م';
          void supabase.from('notifications').insert({
            id, company_id: sc.companyId, supervisor_id: sc.supervisorId, type: 'oor_visit',
            title_ar: 'تنبيه: زيارة خارج النطاق الجغرافي ⚠️',
            body_ar: `تم تسجيل زيارة خارج نطاق السياج الجغرافي المعتمد (المسافة: ${distance}).`, is_read: false,
          }).then(({ error }) => { if (error && error.code !== '23505') console.warn('Visit alert could not be saved', { code: error.code }); });
        }
        return { id, queued: false };
      } catch (error) {
        if (!isRetryableMutationError(error)) throw error;
        return saveLocally();
      }
    },

    onSuccess: (result) => {

      const msg = !result.queued ? t('تم بدء الزيارة وتسجيل الدخول') : t('📶 تم بدء الزيارة دون اتصال. اضغط "رفع البيانات" عند توفر الشبكة');

      notify(msg, 'success');

      void inv(qc, sc, 'visits', 'visit-options', 'customers', 'dashboard', 'beat');

    },

    onError: (e: Error) => notify(e.message, 'error'),

  });

}



export function useSetVisitOutcome() {

  const sc = useScope(); const qc = useQueryClient();

  return useMutation({

    mutationFn: async ({ id, outcome }: { id: string; outcome: VisitOutcome }) => {

      if (!navigator.onLine) {

        enqueueOfflineAction({

          type: 'set_visit_outcome',

          companyId: sc.companyId,

          supervisorId: sc.supervisorId,

          payload: { id, outcome },

        });

        return;

      }

      const { data, error } = await sc.scope(supabase.from('visits').update({ visit_outcome: outcome }).eq('id', id)).select('id');

      if (error) {

        enqueueOfflineAction({

          type: 'set_visit_outcome',

          companyId: sc.companyId,

          supervisorId: sc.supervisorId,

          payload: { id, outcome },

        });

        return;

      }

      if (!data?.length) throw new Error('لم يتم حفظ النتيجة. قد لا تملك الصلاحية.');

    },

    onSuccess: () => {

      const msg = navigator.onLine ? t('تم حفظ نتيجة الزيارة') : t('📶 تم حفظ نتيجة الزيارة دون اتصال. اضغط "رفع البيانات" عند توفر الشبكة');

      notify(msg, 'success');

      void inv(qc, sc, 'visit-detail', 'visits', 'dashboard');

    },

    onError: (e: Error) => notify(e.message, 'error'),

  });

}

/** Active customers that have coordinates — ranked client-side by distance from the supervisor. */

export function useLocatedCustomers() {

  const sc = useScope();

  return useQuery({

    queryKey: [...sc.base, 'customers', 'located'], retry: 1, staleTime: 120_000,

    queryFn: async ({ signal }) => {

      let qLoc: any = supabase.from('customers').select(CUSTOMER_COLUMNS).eq('company_id', sc.companyId)

        .eq('is_active', true).not('latitude', 'is', null).not('longitude', 'is', null).limit(2000);

      if (!sc.isAdmin) qLoc = qLoc.or(`supervisor_id.eq.${sc.supervisorId},supervisor_id.is.null`);

      const { data, error } = await qLoc.abortSignal(signal);

      if (error) fail('تعذر تحميل العملاء القريبين.', error);

      return data as Customer[];

    },

  });

}



/** Nearest customers via server-side Haversine RPC (mdn_nearest_customers_v1).

 *  Replaces the 2,000-row client-side download; DB returns only the N closest rows. */

export function useNearestCustomers(lat: number | null, lng: number | null, limit: number | 'all') {

  const sc = useScope();

  return useQuery({

    queryKey: [...sc.base, 'customers', 'nearest', lat, lng, limit],

    enabled: lat != null && lng != null,

    staleTime: 30_000,

    retry: 1,

    queryFn: async ({ signal }) => {
      // Primary: Server-side Haversine RPC
      try {
        const { data, error } = await supabase.rpc('mdn_nearest_customers_v1', {
          p_lat:   lat!,
          p_lng:   lng!,
          p_limit: limit === 'all' ? 0 : limit,
        }).abortSignal(signal);

        if (!error && Array.isArray(data)) {
          return data as (Customer & { distance_km: number })[];
        }
      } catch {
        // Fall through to client fallback
      }

      // Resilient Fallback: Query active customers and calculate distance locally
      try {
        const { data, error } = await sc.scope(
          supabase.from('customers').select(CUSTOMER_COLUMNS).eq('is_active', true)
        ).limit(100).abortSignal(signal);

        if (error || !data) return [];

        const rad = Math.PI / 180;
        const withDistance = data.map((cust: any) => {
          let distance_km = 9999;
          if (cust.latitude != null && cust.longitude != null && lat != null && lng != null) {
            const dLat = (cust.latitude - lat) * rad;
            const dLng = (cust.longitude - lng) * rad;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(cust.latitude * rad) * Math.sin(dLng / 2) ** 2;
            const cVal = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            distance_km = 6371 * cVal;
          }
          return { ...cust, distance_km };
        }).sort((a: any, b: any) => a.distance_km - b.distance_km);

        return (limit === 'all' ? withDistance : withDistance.slice(0, limit)) as (Customer & { distance_km: number })[];
      } catch {
        return [];
      }
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

    let q: any = supabase.from('customers').select(CUSTOMER_COLUMNS).eq('company_id', sc.companyId);

    if (!sc.isAdmin) q = q.eq('is_active', true).or(`supervisor_id.eq.${sc.supervisorId},supervisor_id.is.null`);

    if (term) q = q.or(`name.ilike.%${term}%,customer_code.ilike.%${term}%,address.ilike.%${term}%`);

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

      let q: any = supabase.from('customers').select(CUSTOMER_COLUMNS).eq('company_id', sc.companyId).eq('is_active', true);
      if (!sc.isAdmin) q = q.or(`supervisor_id.eq.${sc.supervisorId},supervisor_id.is.null`);

      if (term) q = q.or(`name.ilike.%${term}%,customer_code.ilike.%${term}%,address.ilike.%${term}%`);

      const { data, error } = await q.order('name').limit(20).abortSignal(signal);

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

    const rows = data as ShelfAudit[];

    const paths = rows.map(a => a.photo_url).filter((p): p is string => !!p && !/^https:\/\//.test(p));

    const signedMap: Record<string, string> = {};

    if (paths.length) {

      const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 600);

      (signed ?? []).forEach(({ path, signedUrl }) => { if (path && signedUrl) signedMap[path] = signedUrl; });

    }

    return rows.map(audit => {

      if (!audit.photo_url || /^https:\/\//.test(audit.photo_url)) return audit;

      return { ...audit, photo_url: signedMap[audit.photo_url] ?? audit.photo_url };

    });

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

    queryKey: [...sc.base, 'beat', day], retry: 1, refetchInterval: 60_000,

    queryFn: async ({ signal }) => {

      // Fetch the single beat plan row for this day_of_week (UNIQUE per supervisor+plan_date)
      const { data: planRows, error } = await sc.scope(
        supabase.from('beat_plans').select(`id,supervisor_id,day_of_week,customer_id,company_id,customer_ids_ordered,customers(${CUSTOMER_COLUMNS})`)
      ).eq('day_of_week', day).limit(10).abortSignal(signal);

      if (error) fail('تعذر تحميل خطة الزيارات.', error);

      // Expand customer_ids_ordered into individual BeatRow entries (preserving visit order)
      const expanded: BeatRow[] = [];
      for (const row of (planRows ?? []) as (BeatPlan & { customers: Customer | null; customer_ids_ordered?: string[] })[]) {
        const orderedIds: string[] = row.customer_ids_ordered ?? (row.customer_id ? [row.customer_id] : []);
        if (orderedIds.length <= 1) {
          expanded.push(row as BeatRow);
        } else {
          // Fetch all customers in the ordered list in one query
          const { data: custData } = await supabase.from('customers')
            .select(CUSTOMER_COLUMNS).in('id', orderedIds).eq('company_id', sc.companyId).abortSignal(signal);
          const custMap = new Map((custData as Customer[] ?? []).map(c => [c.id, c]));
          for (const cid of orderedIds) {
            const cust = custMap.get(cid) ?? null;
            expanded.push({ ...row, customer_id: cid, customers: cust } as BeatRow);
          }
        }
      }

      const visits = await sc.scope(supabase.from('visits').select('customer_id,status')).eq('visit_date', todayStr()).limit(1000).abortSignal(signal);

      if (visits.error) fail('تعذر تحميل زيارات اليوم.', visits.error);

      return { plan: expanded, visited: new Map((visits.data as Visit[]).map((v) => [v.customer_id, v.status])) };

    },

  });

}



/* ---------- Notifications ---------- */

export function useNotifications(unreadOnly: boolean) {

  const sc = useScope();

  return usePaged<Notification>(sc, 'notifications', ['list', unreadOnly], async (from, to, signal) => {

    let q = supabase.from('notifications').select(NOTIFICATION_COLUMNS).eq('supervisor_id', sc.supervisorId).eq('company_id', sc.companyId);

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

        .eq('supervisor_id', sc.supervisorId).eq('company_id', sc.companyId).eq('is_read', false), signal, 'تعذر عد الإشعارات.');

    },

  });

}

export function useMarkRead() {

  const sc = useScope(); const qc = useQueryClient();

  return useMutation({

    mutationFn: async (id: string | 'all') => {

      let q = supabase.from('notifications').update({ is_read: true }).eq('supervisor_id', sc.supervisorId).eq('company_id', sc.companyId);

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

    const { data, error } = await supabase.from('supervisors').select('id,user_id,full_name,phone,role,branch_id,company_id,is_active,supervisor_code')

      .eq('company_id', sc.companyId).order('full_name').order('id').range(from, to).abortSignal(signal);

    if (error) fail('تعذر تحميل المشرفين.', error);

    return data as Supervisor[];

  }, sc.isAdmin);

}

export function useAdminSummary() {

  const sc = useScope();

  return useQuery({

    queryKey: [...sc.base, 'admin-summary'], enabled: sc.isAdmin, retry: 1, refetchInterval: 120_000,

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

      // Channel privileged updates through admin_update_supervisor RPC

      const { error: rpcErr } = await supabase.rpc('admin_update_supervisor', {

        p_supervisor_id: target.id,

        p_role: patch.role ?? null,

        p_is_active: patch.is_active ?? null,

      });



      if (rpcErr) {

        fail('تعذر تحديث المشرف: ' + (rpcErr.message || ''), rpcErr);

      }

    },

    onSuccess: () => { notify('تم تحديث المشرف', 'success'); void inv(qc, sc, 'admin-supervisors', 'admin-summary'); },

    onError: (e: Error) => notify(e.message, 'error'),

  });

}


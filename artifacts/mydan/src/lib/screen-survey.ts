import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, SUPABASE_URL } from './supabase';
import { useScope } from './data';
import { notify } from './toast';
import { compressImage } from './image-compression';

const SURVEY_BUCKET = 'survey-photos';
const DISCOVER_ENDPOINT = `${SUPABASE_URL}/functions/v1/discover-customers`;

export type DiscoveredStore = {
  name: string;
  type: string;
  estimated_size: 'small' | 'medium' | 'large';
  position_note: string;
};

export type FieldSurvey = {
  id: string;
  company_id: string;
  supervisor_id: string;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  stores_found: number;
  ai_raw_result: { stores: DiscoveredStore[]; summary_ar?: string } | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
};

async function currentSession(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session || data.session.user.id !== userId) {
    throw new Error('جلسة الدخول غير صالحة. أعد تسجيل الدخول.');
  }
  return data.session;
}

export function useUploadSurveyPhoto() {
  const sc = useScope(), qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file: rawFile,
      latitude,
      longitude,
    }: { file: File; latitude: number | null; longitude: number | null }): Promise<FieldSurvey> => {
      await currentSession(sc.supervisor.user_id);
      if (!rawFile.type.startsWith('image/')) throw new Error('اختر صورة صالحة.');
      if (rawFile.size > 15 * 1024 * 1024) throw new Error('حجم الصورة أكبر من 15 ميجابايت.');

      // Compress photo client-side (reduces 10MB to ~300KB)
      const file = await compressImage(rawFile, { maxDimension: 1600, quality: 0.85 });

      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const uid = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
      const path = `${sc.companyId}/${sc.supervisorId}/${uid}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(SURVEY_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error('تعذر رفع صورة المسح الميداني. تحقق من وجود bucket "survey-photos".');

      const { data, error: insertError } = await supabase.from('field_surveys').insert({
        company_id: sc.companyId,
        supervisor_id: sc.supervisorId,
        photo_url: path,
        latitude,
        longitude,
        status: 'pending',
      }).select('*').single();

      if (insertError || !data) {
        await supabase.storage.from(SURVEY_BUCKET).remove([path]);
        throw new Error('تعذر إنشاء سجل المسح الميداني.');
      }
      return data as FieldSurvey;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...sc.base, 'field-surveys'] }),
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function useRequestSurveyAnalysis() {
  const sc = useScope(), qc = useQueryClient();
  return useMutation({
    mutationFn: async (survey: FieldSurvey) => {
      if (new URL(SUPABASE_URL).origin !== new URL(DISCOVER_ENDPOINT).origin) {
        throw new Error('عنوان خدمة التحليل غير متطابق مع مشروع Supabase.');
      }
      const session = await currentSession(sc.supervisor.user_id);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90_000);
      try {
        const res = await fetch(DISCOVER_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ survey_id: survey.id }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('تعذر إرسال الصورة لخدمة الاكتشاف. تحقق من نشر وظيفة discover-customers.');
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError')
          throw new Error('انتهت مهلة الطلب. قد يستمر التحليل؛ انتظر ثم أعد المحاولة.');
        if (error instanceof TypeError)
          throw new Error('تعذر الاتصال بخدمة الاكتشاف. تحقق من الاتصال بالإنترنت.');
        throw error;
      } finally { clearTimeout(timer); }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...sc.base, 'field-surveys'] }),
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function useSurveyResult(id: string | null) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'field-surveys', 'result', id],
    enabled: !!id,
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('field_surveys')
        .select('*').eq('id', id!).eq('company_id', sc.companyId).abortSignal(signal).single();
      if (error || !data) throw new Error('تعذر تحميل نتيجة المسح.');
      return data as FieldSurvey;
    },
    refetchInterval: q =>
      q.state.data && ['pending', 'processing'].includes(q.state.data.status) ? 4000 : false,
  });
}

export function useSaveProspects() {
  const sc = useScope(), qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      survey,
      stores,
    }: { survey: FieldSurvey; stores: { name: string; type: string }[] }) => {
      if (!stores.length) throw new Error('لا توجد عملاء لحفظهم.');
      const rows = stores.map(s => ({
        company_id: sc.companyId,
        supervisor_id: sc.supervisorId,
        name: s.name.trim() || 'عميل غير محدد الاسم',
        type: s.type,
        latitude: survey.latitude,
        longitude: survey.longitude,
        created_by: sc.supervisorId,
        is_active: true,
        status: 'prospect',
        survey_id: survey.id,
      }));
      const { error } = await supabase.from('customers').insert(rows);
      if (error) throw new Error('تعذر حفظ العملاء المحتملين: ' + error.message);
      return rows.length;
    },
    onSuccess: count => {
      notify(`تم حفظ ${count} عميل محتمل بنجاح`, 'success');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'customers'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'dashboard'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

// Admin: load prospects for a company
export function useAdminProspects() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'customers', 'prospects'],
    enabled: sc.isAdmin,
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('customers')
        .select('id,name,customer_type,latitude,longitude,survey_id,created_at,supervisor_id,is_active,status')
        .eq('company_id', sc.companyId)
        .eq('status', 'prospect')
        .order('created_at', { ascending: false })
        .limit(200)
        .abortSignal(signal);
      if (error) {
        if (error.code === '42703' || error.message?.includes('status') || error.message?.includes('survey_id')) {
          throw new Error('يرجى تطبيق ملف التحديث (09_field_survey.sql) في Supabase SQL Editor لإضافة حقول العملاء المحتملين.');
        }
        throw new Error(error.message || 'تعذر تحميل العملاء المحتملين.');
      }
      return data as {
        id: string; name: string; customer_type: string | null;
        latitude: number | null; longitude: number | null;
        survey_id: string | null; created_at: string;
        supervisor_id: string; is_active: boolean; status: string;
      }[];
    },
  });
}

export type FieldSurveyRecord = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stores_found: number;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  supervisors: { full_name: string } | null;
};

export function useAdminFieldSurveys() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'admin-field-surveys'],
    enabled: sc.isAdmin,
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('field_surveys')
        .select('id,status,stores_found,created_at,latitude,longitude,supervisors(full_name)')
        .eq('company_id', sc.companyId)
        .order('created_at', { ascending: false })
        .limit(200)
        .abortSignal(signal);
      if (error) throw new Error(error.message || 'تعذر تحميل سجلات المسح الميداني.');
      return (data ?? []) as unknown as FieldSurveyRecord[];
    },
  });
}

export function useConvertProspect() {
  const sc = useScope(), qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'activate' | 'reject' }) => {
      const status = action === 'activate' ? 'active' : 'rejected';
      const { error } = await supabase.from('customers').update({ status }).eq('id', id).eq('company_id', sc.companyId);
      if (error) throw new Error('تعذر تحديث حالة العميل.');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...sc.base, 'customers'] }),
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

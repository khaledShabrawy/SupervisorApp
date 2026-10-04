import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { supabase, SUPABASE_URL } from './supabase';
import { useScope, PHOTO_BUCKET, type VisitRow } from './data';
import { AUDIT_COLUMNS } from './columns';
import { notify } from './toast';
import type { ShelfAudit } from '@/types/database';

export const ANALYZE_ENDPOINT = 'https://ywdlrrdkjbtpfgacuuoy.supabase.co/functions/v1/analyze-shelf';
async function currentSession(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session || data.session.user.id !== userId) throw new Error('جلسة الدخول غير صالحة. أعد تسجيل الدخول.');
  return data.session;
}
export function useUploadAudit() {
  const sc = useScope(), qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visit, file }: { visit: VisitRow; file: File }): Promise<ShelfAudit> => {
      await currentSession(sc.supervisor.user_id);
      if (visit.company_id !== sc.companyId || (!sc.isAdmin && visit.supervisor_id !== sc.supervisorId)) {
        throw new Error('الزيارة لا تخص حسابك أو شركتك.');
      }
      if (!file.type.startsWith('image/')) throw new Error('اختر صورة صالحة للرف.');
      if (file.size > 10 * 1024 * 1024) throw new Error('حجم الصورة أكبر من 10 ميجابايت.');
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${sc.companyId}/${sc.supervisorId}/${visit.id}-${crypto.randomUUID()}.${ext}`;
      const uploaded = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw new Error('تعذر رفع صورة الرف. تحقق من الحاوية والصلاحيات.');
      const { data: publicPhoto } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      const inserted = await supabase.from('shelf_audits').insert({
        visit_id: visit.id, supervisor_id: sc.supervisorId, company_id: sc.companyId,
        photo_url: publicPhoto.publicUrl, status: 'pending', audited_at: new Date().toISOString(),
      }).select(AUDIT_COLUMNS).single();
      if (inserted.error || !inserted.data) {
        if (inserted.status >= 400 && inserted.status < 500 && inserted.status !== 408) {
          const cleanup = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
          if (cleanup.error) throw new Error('تعذر حفظ المراجعة وتعذر حذف الصورة غير المرتبطة.');
          throw new Error('تعذر حفظ المراجعة؛ أزيلت الصورة غير المرتبطة.');
        }
        throw new Error('لم يتأكد حفظ المراجعة. احتُفظ بالصورة لتجنب حذف ملف ربما حُفظ سجله.');
      }
      return inserted.data as ShelfAudit;
    },
    onSuccess: audit => { qc.setQueryData([...sc.base, 'audits', 'result', audit.id], audit);
      void qc.invalidateQueries({ queryKey: [...sc.base, 'audits'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'dashboard'] }); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
export function useRequestAuditAnalysis() {
  const sc = useScope(), settings = useAppSettings(), qc = useQueryClient();
  return useMutation({
    mutationFn: async (audit: ShelfAudit) => {
      if (!settings.ai_audit_enabled) throw new Error('تحليل الرف الذكي غير مفعّل لشركتك.');
      // Never send a JWT from another configured Supabase project to this URL.
      if (new URL(SUPABASE_URL).origin !== new URL(ANALYZE_ENDPOINT).origin) {
        throw new Error('عنوان مشروع Supabase لا يطابق مشروع وظيفة تحليل الرف المطلوبة.');
      }
      if (!audit.photo_url || audit.company_id !== sc.companyId
        || (!sc.isAdmin && audit.supervisor_id !== sc.supervisorId)) throw new Error('سجل مراجعة الرف غير صالح لحسابك.');
      const session = await currentSession(sc.supervisor.user_id);
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60_000);
      try {
        const response = await fetch(ANALYZE_ENDPOINT, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ audit_id: audit.id, photo_url: audit.photo_url,
            target_brand: settings.target_brand_name, competitor_brands: settings.competitor_brands }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('تعذر إرسال الصورة للتحليل. تحقق من نشر الوظيفة وصلاحيات الدخول.');
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('انتهت مهلة الطلب. قد يستمر التحليل؛ راقب حالة المراجعة قبل إعادة الإرسال.');
        }
        if (error instanceof TypeError) throw new Error('تعذر الاتصال بخدمة تحليل الرف. تحقق من الاتصال.');
        throw error;
      } finally { clearTimeout(timer); }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: [...sc.base, 'audits'] }); },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
export function useAuditResult(id: string | null) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'audits', 'result', id], enabled: !!id, retry: 1,
    queryFn: async ({ signal }) => {
      const r = await sc.scope(supabase.from('shelf_audits').select(AUDIT_COLUMNS)).eq('id', id!).abortSignal(signal).single();
      if (r.error || !r.data) throw new Error('تعذر تحميل تقرير مراجعة الرف.');
      return r.data as ShelfAudit;
    },
    refetchInterval: q => q.state.data && ['pending', 'processing'].includes(q.state.data.status) ? 5000 : false,
  });
}
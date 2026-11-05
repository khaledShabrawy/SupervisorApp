import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { supabase, SUPABASE_URL } from './supabase';
import { useScope, PHOTO_BUCKET, type VisitRow } from './data';
import { AUDIT_COLUMNS } from './columns';
import { notify } from './toast';
import { compressImage } from './image-compression';
import { requestAnalysis } from './analysis-request';
import { signedMedia } from './private-media';
import { isMeasuredAudit } from './shelf-metrics';
import type { ShelfAudit } from '@/types/database';

export const ANALYZE_ENDPOINT = import.meta.env.VITE_SHELF_AUDIT_FUNCTION ||
  `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/analyze-shelf`;
async function currentSession(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session || data.session.user.id !== userId) throw new Error('جلسة الدخول غير صالحة. أعد تسجيل الدخول.');
  return data.session;
}
/** Photos live in a private bucket; swap the stored path for a 10-minute signed URL. */
async function withSignedPhoto(audit: ShelfAudit): Promise<ShelfAudit> {
  if (!isMeasuredAudit(audit.ai_detailed_report)) {
    audit = { ...audit, status: 'failed', audit_score: null, audit_summary_ar: 'هذه نتيجة قديمة غير مقاسة؛ أعد تحليل الصورة.', ai_detailed_report: null };
  }
  return { ...audit, photo_url: await signedMedia(PHOTO_BUCKET, audit.photo_url) };
}
export function useUploadAudit() {
  const sc = useScope(), qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visit, file: rawFile }: { visit: VisitRow; file: File }): Promise<ShelfAudit> => {
      await currentSession(sc.supervisor.user_id);
      if (visit.company_id !== sc.companyId || (!sc.isAdmin && visit.supervisor_id !== sc.supervisorId)) {
        throw new Error('الزيارة لا تخص حسابك أو شركتك.');
      }
      if (!rawFile.type.startsWith('image/')) throw new Error('اختر صورة صالحة للرف.');
      if (rawFile.size > 15 * 1024 * 1024) throw new Error('حجم الصورة أكبر من 15 ميجابايت.');

      // Compress photo client-side before uploading (reduces 8MB to ~300KB)
      const file = await compressImage(rawFile, { maxDimension: 1600, quality: 0.85 });

      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const uid = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      const path = `${sc.companyId}/${sc.supervisorId}/${visit.id}-${uid}.${ext}`;
      const uploaded = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw new Error('تعذر رفع صورة الرف. تحقق من الحاوية والصلاحيات.');
      const inserted = await supabase.from('shelf_audit').insert({
        visit_id: visit.id, supervisor_id: sc.supervisorId, company_id: sc.companyId,
        // Private bucket: store the object path; readers get short-lived signed URLs.
        photo_url: path, status: 'pending', audited_at: new Date().toISOString(),
      }).select(AUDIT_COLUMNS).single();
      if (inserted.error || !inserted.data) {
        if (inserted.status >= 400 && inserted.status < 500 && inserted.status !== 408) {
          const cleanup = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
          if (cleanup.error) throw new Error('تعذر حفظ المراجعة وتعذر حذف الصورة غير المرتبطة.');
          throw new Error('تعذر حفظ المراجعة؛ أزيلت الصورة غير المرتبطة.');
        }
        throw new Error('لم يتأكد حفظ المراجعة. احتُفظ بالصورة لتجنب حذف ملف ربما حُفظ سجله.');
      }
      return withSignedPhoto(inserted.data as ShelfAudit);
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
      if (!audit.photo_url || audit.company_id !== sc.companyId
        || (!sc.isAdmin && audit.supervisor_id !== sc.supervisorId)) {
        throw new Error('سجل مراجعة الرف غير صالح لحسابك.');
      }
      const session = await currentSession(sc.supervisor.user_id);

      if (!settings.ai_audit_enabled) throw new Error('التحليل غير مفعّل لشركتك.');
      await requestAnalysis({ projectUrl: SUPABASE_URL, endpoint: ANALYZE_ENDPOINT,
        token: session.access_token, body: { audit_id: audit.id } });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...sc.base, 'audits'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'dashboard'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
export function useAuditResult(id: string | null) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'audits', 'result', id], enabled: !!id, retry: 1,
    queryFn: async ({ signal }) => {
      const r = await sc.scope(supabase.from('shelf_audit').select(AUDIT_COLUMNS)).eq('id', id!).abortSignal(signal).single();
      if (r.error || !r.data) throw new Error('تعذر تحميل تقرير مراجعة الرف.');
      return withSignedPhoto(r.data as ShelfAudit);
    },
    refetchInterval: q => q.state.data && ['pending', 'processing'].includes(q.state.data.status) ? 5000 : false,
  });
}

export function useVisitAudits(visitId: string | null) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'visit-audits', visitId],
    enabled: !!visitId,
    queryFn: async ({ signal }) => {
      const { data, error } = await sc.scope(supabase.from('shelf_audit').select(AUDIT_COLUMNS))
        .eq('visit_id', visitId!)
        .order('created_at', { ascending: false })
        .abortSignal(signal);
      if (error || !data) throw new Error('تعذر تحميل مراجعات الزيارة.');
      const rows = data as ShelfAudit[];
      return Promise.all(rows.map(withSignedPhoto));
    },
  });
}
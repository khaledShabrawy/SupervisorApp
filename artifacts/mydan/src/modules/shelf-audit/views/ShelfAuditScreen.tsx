import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Camera, CheckCircle2, Download, FileText, RefreshCw, Save, ScanSearch, Trash2 } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useRealtime } from '@/hooks/useRealtime';
import { supabase } from '@/lib/supabase';
import { useVisitOptions, type VisitRow } from '@/lib/data';
import { useAuditResult, useRequestAuditAnalysis, useUploadAudit, useVisitAudits } from '@/lib/screen-data';
import { PageTitle } from '@/components/Layout';
import { ErrorState } from '@/components/States';
import { notify } from '@/lib/toast';
import { fmtDateTime, num } from '@/lib/format';
import { SelectOption, useInput, useRefetch } from '@/screens/shared';
import { DIR, LANG, t } from '@/i18n';
import { confirm } from '@/lib/confirm';

function toList(v: unknown): string[] {
  if (!Array.isArray(v)) return typeof v === 'string' && v.trim() ? [v] : [];
  return v.map((x) => {
    if (typeof x === 'string') return x;
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      const k = ['text_ar', 'title_ar', 'description_ar', 'issue_ar', 'recommendation_ar', 'summary_ar',
        'text', 'title', 'description', 'message', 'issue', 'recommendation'].find((key) => typeof o[key] === 'string');
      if (k) return o[k] as string;
      return Object.values(o).filter((y) => typeof y === 'string').join(' - ');
    }
    return '';
  }).filter(Boolean);
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const Finding = memo(function Finding({ text, kind }: { text: string; kind: 'issue' | 'rec' }) {
  return <li className="s-find" data-testid={`finding-${kind}`}>
    {kind === 'issue' ? <AlertTriangle size={18} color="var(--color-danger)" aria-label={t('ملاحظة')} /> : <CheckCircle2 size={18} color="var(--color-success)" aria-label={t('توصية')} />}
    <span>{text}</span></li>;
});
const Step = memo(function Step({ label, index, current }: { label: string; index: number; current: number }) {
  return <div className={current === index ? 'on' : current > index ? 'done' : ''}>{num(index)}. {label}</div>;
});
function AuditRealtime({ id, onChange }: { id: string; onChange: () => void }) {
  useRealtime('shelf_audit', `id=eq.${id}`, onChange);
  return null;
}

async function compressImage(file: File, maxPx = 1400, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve(file);
    }, 4000);
    img.onload = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
            resolve(compressed);
          },
          'image/jpeg', quality,
        );
      } catch {
        resolve(file);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

const ROOT_CAUSES = [
  'ضغط منافس',
  'تأخر توريد',
  'بضاعة في المخزن لم تُعرض',
  'سوء تنسيق',
] as const;

export default function ShelfAuditScreen() {
  const { supervisor } = useAuth(); const settings = useAppSettings();
  const [params, setParams] = useSearchParams(); const auditId = params.get('audit');
  const visits = useVisitOptions(); const upload = useUploadAudit(); const request = useRequestAuditAnalysis();
  const result = useAuditResult(auditId);
  const [visitId, setVisitId] = useState(() => params.get('visit') ?? '');
  const effectiveVisitId = visitId || params.get('visit') || '';
  const visitAudits = useVisitAudits(effectiveVisitId);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [requestFailed, setRequestFailed] = useState(false); const [stale, setStale] = useState(false); const [reqKey, setReqKey] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Keep preview URL updated with cleanup
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const refetch = useRefetch(result.refetch); const retryVisits = useRefetch(visits.refetch);
  const audit = result.data; const status = audit?.status;
  const disabled = !settings.ai_audit_enabled;
  const inFlight = !!auditId && (status === 'pending' || status === 'processing') && !disabled && !requestFailed;
  useEffect(() => {
    setStale(false);
    if (!inFlight) return;
    const t = setTimeout(() => setStale(true), 60_000);
    return () => clearTimeout(t);
  }, [inFlight, reqKey, auditId]);
  const step = status === 'completed' ? 3 : auditId || file ? 2 : 1;

  // Resolve visit from options or fallback to query params
  const visit = useMemo<VisitRow | undefined>(() => {
    const found = visits.data?.find((v) => v.id === effectiveVisitId);
    if (found) return found;
    if (effectiveVisitId && supervisor) {
      return {
        id: effectiveVisitId,
        company_id: supervisor.company_id,
        supervisor_id: supervisor.id,
        customer_id: params.get('customer') || '',
        visit_date: new Date().toISOString().split('T')[0],
        status: 'in_progress',
        customers: {
          name: params.get('name') || t('الزيارة الحالية'),
          address: '',
          latitude: null,
          longitude: null,
        },
      } as unknown as VisitRow;
    }
    return undefined;
  }, [visits.data, effectiveVisitId, supervisor, params]);

  const onVisit = useInput(setVisitId);

  // Immediate file capture with optimistic background compression
  const onFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0];
    e.target.value = '';
    if (!raw) return;

    // 1. Immediately show photo preview & make button active
    setFile(raw);
    notify(t('تم التقاط الصورة بنجاح'), 'success');

    // 2. Optimistically compress for upload bandwidth saving
    try {
      const comp = await compressImage(raw);
      setFile(comp);
    } catch {
      // Keep raw file
    }
  }, []);

  const pick = useCallback(() => input.current?.click(), []);

  const analyze = useCallback(async () => {
    if (!visit || !file) return;
    let uploaded = false;
    try {
      const a = await upload.mutateAsync({ visit, file });
      uploaded = true; setRequestFailed(false);
      setParams({ visit: effectiveVisitId, audit: a.id }, { replace: true });
      setFile(null);
      await request.mutateAsync(a);
      await result.refetch();
      setReqKey((k) => k + 1);
      void visitAudits.refetch();
    } catch (err) {
      if (uploaded) setRequestFailed(true);
      console.error('Audit analysis failed:', err);
    }
  }, [visit, file, upload, request, setParams, effectiveVisitId, visitAudits]);

  const photoOnly = useCallback(async () => {
    if (!visit || !file) return;
    try {
      const a = await upload.mutateAsync({ visit, file });
      setParams({ visit: effectiveVisitId, audit: a.id }, { replace: true });
      setFile(null);
      void visitAudits.refetch();
    } catch { /* surfaced by hook */ }
  }, [visit, file, upload, setParams, effectiveVisitId, visitAudits]);

  const retry = useCallback(() => {
    if (!audit || disabled) return;
    request.mutate(audit, { onSuccess: () => { setRequestFailed(false); setReqKey((k) => k + 1); }, onError: () => setRequestFailed(true) });
  }, [audit, disabled, request]);

  const completeImmediately = useCallback(async () => {
    if (!auditId || !supervisor?.company_id) return;
    if (!await confirm(t('هل تريد اعتماد مراجعة الرف يدوياً وحفظ التقرير؟'))) return;
    try {
      const { error } = await supabase.from('shelf_audit').update({
        status: 'completed',
        audit_score: null,
        audit_summary_ar: 'تم تأكيد ومراجعة الرف يدوياً بواسطة المشرف الميداني.',
        ai_detailed_report: {
          issues: ['مراجعة واعتماد يدوي مباشر من المشرف في الميدان.'],
          recommendations: ['متابعة ترتيب المعروضات وتوافر بطاقات الأسعار دائماً.'],
        },
      }).eq('id', auditId).eq('company_id', supervisor.company_id).eq('supervisor_id', supervisor.id).select('id').single();
      if (error) throw error;
      void refetch();
      void visitAudits.refetch();
      notify(t('تم اعتماد تقرير الرف يدوياً بنجاح'), 'success');
    } catch (e: any) {
      notify(e.message || 'تعذر إصدار التقرير', 'error');
    }
  }, [auditId, refetch, visitAudits, supervisor]);

  const pickAudit = useCallback((id: string) => {
    setParams({ visit: effectiveVisitId, audit: id }, { replace: true });
  }, [effectiveVisitId, setParams]);

  const reset = useCallback(() => {
    setParams(effectiveVisitId ? { visit: effectiveVisitId } : {}, { replace: true });
    setRequestFailed(false);
    setFile(null);
  }, [effectiveVisitId, setParams]);
  const report = useMemo(() => (audit?.ai_detailed_report ?? {}) as Record<string, unknown>, [audit]);
  const issues = useMemo(() => toList(report.issues ?? report.problems), [report]);
  const recs = useMemo(() => toList(report.recommendations ?? report.suggestions), [report]);
  const score = audit?.audit_score ?? null;
  const color = score == null ? 'var(--muted)' : score > 75 ? 'var(--color-success)' : score >= 50 ? '#B45309' : 'var(--color-danger)';

  const targetMetrics = useMemo(() => (report.target_brand_metrics ?? {}) as {
    brand_present?: boolean;
    facings?: number;
    share_of_shelf_percentage?: number;
    out_of_stock?: boolean;
    oos_items?: string[];
  }, [report.target_brand_metrics]);

  const competitorMetrics = useMemo(() => (report.competitor_metrics ?? {}) as {
    competitor_presence_detected?: boolean;
    competitor_share_pct?: number;
    brands_detected?: string[];
  }, [report.competitor_metrics]);

  const detailedReport = useMemo(() => (report.detailed_report ?? {}) as {
    brand_analysis?: string;
    competitor_analysis?: string;
    display_quality?: string;
    action_priority?: string;
  }, [report.detailed_report]);

  const posmPresent = report.posm_present as boolean | undefined;
  const priceTagVisible = report.price_tag_visible as boolean | undefined;

  const [selectedCause, setSelectedCause] = useState<string>(() => (report.root_cause as string) ?? '');
  const [auditNotes, setAuditNotes] = useState<string>(() => (report.audit_notes as string) ?? '');
  const [isUpdatingCause, setIsUpdatingCause] = useState(false);

  useEffect(() => {
    setSelectedCause((report.root_cause as string) ?? '');
    setAuditNotes((report.audit_notes as string) ?? '');
  }, [report.root_cause, report.audit_notes]);

  const handlePickCause = useCallback(async (cause: string) => {
    if (!audit?.id) return;
    const nextCause = selectedCause === cause ? '' : cause;
    setSelectedCause(nextCause);
    setIsUpdatingCause(true);
    try {
      const updatedReport = {
        ...report,
        root_cause: nextCause || undefined,
        audit_notes: auditNotes || (report.audit_notes as string) || undefined,
      };
      const { error } = await supabase
        .from('shelf_audit')
        .update({ ai_detailed_report: updatedReport })
        .eq('id', audit.id);
      if (error) throw error;
      if (nextCause) {
        notify(t('تم تسجيل سبب الملاحظة: {cause}', { cause: nextCause }), 'success');
      }
      void refetch();
    } catch (e: any) {
      notify(e.message || t('تعذر حفظ سبب الملاحظة'), 'error');
    } finally {
      setIsUpdatingCause(false);
    }
  }, [audit?.id, report, selectedCause, auditNotes, refetch]);

  const handleSaveNotes = useCallback(async () => {
    if (!audit?.id) return;
    setIsUpdatingCause(true);
    try {
      const updatedReport = {
        ...report,
        root_cause: selectedCause || (report.root_cause as string) || undefined,
        audit_notes: auditNotes || undefined,
      };
      const { error } = await supabase
        .from('shelf_audit')
        .update({ ai_detailed_report: updatedReport })
        .eq('id', audit.id);
      if (error) throw error;
      notify(t('تم حفظ ملاحظات التدقيق'), 'success');
      void refetch();
    } catch (e: any) {
      notify(e.message || t('تعذر حفظ ملاحظات التدقيق'), 'error');
    } finally {
      setIsUpdatingCause(false);
    }
  }, [audit?.id, report, selectedCause, auditNotes, refetch]);

  const save = useCallback(() => {
    if (!audit) return;
    const causeHtml = report.root_cause ? `<h3>${esc(t('السبب الجذري'))}</h3><p>${esc(String(report.root_cause))}</p>` : '';
    const notesHtml = report.audit_notes ? `<h3>${esc(t('ملاحظات التدقيق'))}</h3><p>${esc(String(report.audit_notes))}</p>` : '';
    const brandName = settings.target_brand_name || t('علامتنا');
    const sharePct = targetMetrics.share_of_shelf_percentage ?? 0;
    const compPct = competitorMetrics.competitor_share_pct ?? (100 - sharePct);
    const facings = targetMetrics.facings ?? 0;
    const oosText = targetMetrics.out_of_stock ? t('نفاد مخزون (OOS)') : t('متوفر بالكامل');
    const posmText = posmPresent ? t('متوفرة') : t('غير متوفرة');
    const priceText = priceTagVisible ? t('واضحة ومطابقة') : t('غير واضحة');
    const compBrands = competitorMetrics.brands_detected?.join('، ') || '—';

    const kpiTable = `
      <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:10px;font-weight:bold">${esc(t('حصة الرف (Share of Shelf)'))}</td><td style="padding:10px">${brandName}: ${num(sharePct)}% vs ${esc(t('المنافسون'))}: ${num(compPct)}%</td></tr>
        <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:10px;font-weight:bold">${esc(t('واجهات العرض'))}</td><td style="padding:10px">${num(facings)} ${esc(t('واجهة'))}</td></tr>
        <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:10px;font-weight:bold">${esc(t('حالة التوافر'))}</td><td style="padding:10px">${esc(oosText)}</td></tr>
        <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:10px;font-weight:bold">${esc(t('المواد الدعائية'))}</td><td style="padding:10px">${esc(posmText)}</td></tr>
        <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:10px;font-weight:bold">${esc(t('بطاقات الأسعار'))}</td><td style="padding:10px">${esc(priceText)}</td></tr>
        <tr><td style="padding:10px;font-weight:bold">${esc(t('العلامات المنافسة المرصودة'))}</td><td style="padding:10px">${esc(compBrands)}</td></tr>
      </table>
    `;

    const stratHtml = (detailedReport.brand_analysis || detailedReport.competitor_analysis || detailedReport.display_quality) ? `
      <h3>${esc(t('التحليل الاستراتيجي للعرض'))}</h3>
      ${detailedReport.brand_analysis ? `<p><strong>${esc(t('تحليل تواجد علامتنا'))}:</strong> ${esc(detailedReport.brand_analysis)}</p>` : ''}
      ${detailedReport.competitor_analysis ? `<p><strong>${esc(t('تحليل انتشار المنافسين'))}:</strong> ${esc(detailedReport.competitor_analysis)}</p>` : ''}
      ${detailedReport.display_quality ? `<p><strong>${esc(t('جودة وترتيب العرض'))}:</strong> ${esc(detailedReport.display_quality)}</p>` : ''}
      ${detailedReport.action_priority ? `<p><strong>${esc(t('أولوية التحرك'))}:</strong> ${esc(detailedReport.action_priority)}</p>` : ''}
    ` : '';

    const html = `<!doctype html><html lang="${LANG}" dir="${DIR}"><meta charset="utf-8"><title>${esc(t('تقرير الرف'))}</title><body style="font-family:sans-serif;max-width:640px;margin:auto;padding:16px"><h1>${esc(t('تقرير مراجعة الرف'))}</h1><p>${esc(settings.app_name)} - ${esc(supervisor?.full_name ?? '')}</p><p>${esc(fmtDateTime(audit.audited_at))}</p><h2>${esc(t('النتيجة: {score}', { score: audit.audit_score ?? '-' }))}</h2><p>${esc(audit.audit_summary_ar ?? '')}</p>${kpiTable}${stratHtml}<h3>${esc(t('الملاحظات'))}</h3><ul>${issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><h3>${esc(t('التوصيات'))}</h3><ul>${recs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${causeHtml}${notesHtml}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `shelf-report-${audit.id}.html`; a.click(); URL.revokeObjectURL(url);
    notify(t('التقرير محفوظ في النظام وتم تنزيل نسخة منه'), 'success');
  }, [audit, settings.app_name, settings.target_brand_name, supervisor?.full_name, issues, recs, report.root_cause, report.audit_notes, targetMetrics, competitorMetrics, detailedReport, posmPresent, priceTagVisible]);

  const busy = upload.isPending || request.isPending;
  const photo = audit?.photo_url ? <img src={audit.photo_url} alt={t('صورة الرف')} loading="lazy" style={{ width: '100%', borderRadius: 12, maxHeight: 240, objectFit: 'cover' }} /> : null;

  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    {auditId && <AuditRealtime id={auditId} onChange={refetch} />}
    <PageTitle>{t('مراجعة الرف')}</PageTitle>
    <div className="s-steps" aria-label={t('الخطوات')}>
      {[t('الصورة'), t('التحليل'), t('التقرير')].map((label, i) => <Step key={label} label={label} index={i + 1} current={step} />)}
    </div>
    {disabled && <div className="alert warn">{t('تحليل الرف الذكي غير مفعّل لشركتك. يمكنك حفظ صورة الرف فقط.')}</div>}

    {!auditId && <div className="card col" style={{ gap: 14 }}>
      {visits.isError ? <ErrorState error={visits.error} onRetry={retryVisits} /> :
        <label className="f">{t('الزيارة')}
          <select className="input" value={visitId} onChange={onVisit} disabled={visits.isPending} data-testid="select-visit">
            <option value="">{visits.isPending ? t('جاري التحميل...') : t('اختر زيارة')}</option>
            {visit && !visits.data?.some((v) => v.id === visit.id) && (
              <SelectOption value={visit.id} label={`${visit.customers?.name ?? t('الزيارة الحالية')} · اليوم`} />
            )}
            {visits.data?.map((v) => (
              <SelectOption key={v.id} value={v.id} label={`${v.customers?.name ?? t('عميل')} · ${v.visit_date}`} />
            ))}
          </select>
        </label>
      }

      <input ref={input} type="file" accept="image/*" capture="environment" hidden data-testid="input-photo" onChange={onFile} />

      {/* Photo Frame / Container */}
      <div
        className="shelf-photo-container"
        onClick={!preview ? pick : undefined}
        style={{
          border: preview ? 'none' : '2px dashed var(--line, #cbd5e1)',
          borderRadius: 16,
          padding: preview ? 0 : '28px 16px',
          textAlign: 'center',
          background: preview ? 'transparent' : 'var(--card-subtle, rgba(0,0,0,0.02))',
          cursor: preview ? 'default' : 'pointer',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 180,
        }}
      >
        {preview ? (
          <div style={{ position: 'relative', width: '100%' }}>
            <img
              src={preview}
              alt={t('معاينة صورة الرف')}
              loading="lazy"
              style={{
                width: '100%',
                borderRadius: 16,
                maxHeight: 320,
                objectFit: 'cover',
                display: 'block',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'rgba(16, 137, 129, 0.92)',
                color: '#fff',
                padding: '5px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                backdropFilter: 'blur(4px)',
                zIndex: 2,
              }}
            >
              <CheckCircle2 size={16} />
              <span>{t('تم التقاط الصورة بنجاح')}</span>
            </div>
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                left: 12,
                right: 12,
                display: 'flex',
                gap: 8,
                justifyContent: 'space-between',
              }}
            >
              <button
                type="button"
                className="btn sm"
                style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', backdropFilter: 'blur(4px)' }}
                onClick={(e) => { e.stopPropagation(); pick(); }}
                data-testid="button-retake-photo"
              >
                <Camera size={16} /> {t('إعادة التقاط')}
              </button>
              <button
                type="button"
                className="btn sm"
                style={{ background: 'rgba(239,68,68,0.85)', color: '#fff', border: 'none', backdropFilter: 'blur(4px)' }}
                onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}
                data-testid="button-delete-photo"
              >
                <Trash2 size={16} /> {t('حذف')}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(26,86,219,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary, #1A56DB)',
              }}
            >
              <Camera size={28} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{t('التقط صورة الرف أو اختر من المعرض')}</div>
            <div className="muted" style={{ fontSize: 13 }}>{t('اضغط هنا لفتح الكاميرا والتقاط الرف')}</div>
          </div>
        )}
      </div>

      {!preview && (
        <button className="btn ghost" onClick={pick} data-testid="button-camera" style={{ width: '100%' }}>
          <Camera /> {t('التقط صورة الرف')}
        </button>
      )}

      {file && !disabled && (
        <button
          className="btn primary"
          style={{ width: '100%', fontSize: 15, padding: '12px' }}
          disabled={!visit || busy}
          onClick={analyze}
          data-testid="button-submit-audit"
        >
          <ScanSearch size={20} />
          {busy ? t('جاري رفع وتحليل الرف...') : t('تحليل الرف بالذكاء الاصطناعي')}
        </button>
      )}

      {file && disabled && (
        <button
          className="btn"
          style={{ width: '100%', fontSize: 15, padding: '12px' }}
          disabled={!visit || busy}
          onClick={photoOnly}
          data-testid="button-save-photo"
        >
          <Save size={20} />
          {upload.isPending ? t('جاري الحفظ...') : t('حفظ الصورة فقط')}
        </button>
      )}

      {file && !visit && (
        <div className="alert warn" style={{ fontSize: 13, textAlign: 'center', marginTop: 4 }}>
          {t('يرجى اختيار الزيارة المرتبطة بهذه الصورة من القائمة أعلاه لتفعيل زر التحليل.')}
        </div>
      )}

      {/* Photo Gallery Grid */}
      {visitAudits.data && visitAudits.data.length > 0 && (
        <div className="col" style={{ gap: 12, marginTop: 8 }}>
          <div className="row between">
            <div className="title" style={{ fontSize: 15 }}>
              📸 {t('معرض صور الرف في هذه الزيارة')}
            </div>
            <span className="badge b-blue">{num(visitAudits.data.length)} {t('صورة')}</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 12,
            }}
          >
            {visitAudits.data.map((item) => (
              <div
                key={item.id}
                className="card col"
                style={{
                  padding: 8,
                  gap: 6,
                  margin: 0,
                  border: auditId === item.id ? '2px solid var(--color-primary)' : '1px solid var(--line)',
                  borderRadius: 12,
                  background: 'var(--card-subtle, #F8FAFC)',
                }}
              >
                {item.photo_url ? (
                  <div style={{ position: 'relative', width: '100%', height: 110, borderRadius: 8, overflow: 'hidden' }}>
                    <img
                      src={item.photo_url}
                      alt={t('صورة الرف')}
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                      onClick={() => pickAudit(item.id)}
                    />
                    {item.audit_score != null && (
                      <span
                        className="badge"
                        style={{
                          position: 'absolute',
                          top: 6,
                          insetInlineStart: 6,
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          fontSize: 11,
                          padding: '2px 6px',
                        }}
                      >
                        🎯 {num(item.audit_score)}%
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ height: 110, background: '#E2E8F0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    📷
                  </div>
                )}

                {item.photo_url && (
                  <a
                    href={item.photo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="muted row"
                    style={{ fontSize: 11, color: 'var(--color-primary)', textDecoration: 'none', gap: 4, alignItems: 'center' }}
                    title={t('فتح الرابط المباشر للصورة')}
                  >
                    <span>🔗</span>
                    <span style={{ textDecoration: 'underline' }}>{t('رابط الصورة')}</span>
                  </a>
                )}

                <div className="row between" style={{ alignItems: 'center', marginTop: 'auto' }}>
                  <span
                    className={`badge ${item.status === 'completed' ? 'b-green' : 'b-amber'}`}
                    style={{ fontSize: 10 }}
                  >
                    {item.status === 'completed' ? t('تم الفحص') : t('قيد المراجعة')}
                  </span>
                  <button
                    type="button"
                    className="btn sm ghost"
                    style={{ fontSize: 12, padding: '0 10px', minHeight: 44, minWidth: 44 }}
                    onClick={() => pickAudit(item.id)}
                  >
                    {t('التقرير')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>}

    {auditId && step === 2 && <div className="card col" style={{ gap: 14 }}>
      {result.isError && <ErrorState error={result.error} onRetry={refetch} />}
      {photo}
      {audit?.photo_url && (
        <div className="row between" style={{ alignItems: 'center', background: 'var(--card-subtle, #F1F5F9)', padding: '8px 12px', borderRadius: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>🔗 {t('رابط صورة الرف في السحابة:')}</span>
          <a
            href={audit.photo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="badge b-blue"
            style={{ textDecoration: 'none', fontSize: 12 }}
          >
            {t('عرض الصورة')} ↗
          </a>
        </div>
      )}
      {disabled && status !== 'failed' ? <div className="alert ok" role="status" data-testid="photo-saved">{t('تم حفظ صورة الرف في النظام. التحليل الذكي غير مفعّل.')}</div>
        : status === 'failed' || requestFailed ? <>
          <div className="alert err">{requestFailed ? t('تعذر إرسال طلب التحليل.') : t('فشل تحليل الرف.')}</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn grow" disabled={request.isPending || disabled} onClick={retry}><RefreshCw /> {t('إعادة المحاولة')}</button>
            <button className="btn success grow" onClick={completeImmediately}><FileText size={18} /> {t('اعتماد مراجعة يدوية')}</button>
          </div>
        </> : !audit ? <div className="skel" style={{ height: 60 }} /> : <>
          <div className="s-wait" role="status"><span className="s-pulse" />{t('جاري تحليل الرف بالذكاء الاصطناعي...')}</div>
          {stale && <>
            <div className="alert warn">{t('التحليل يستغرق وقتا أطول من المعتاد، وقد يكون ما زال قيد التنفيذ.')}</div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost grow" disabled={request.isPending} onClick={retry} data-testid="button-manual-retry"><RefreshCw /> {t('إعادة طلب التحليل')}</button>
              <button className="btn success grow" onClick={completeImmediately}><FileText size={18} /> {t('اعتماد مراجعة يدوية')}</button>
            </div>
          </>}
        </>}
      <div className="row" style={{ gap: 8, marginTop: 4 }}>
        <button className="btn grow" onClick={() => void refetch()}><RefreshCw size={18} /> {t('تحديث حالة التحليل')}</button>
        <button className="btn ghost grow" onClick={reset}>{t('معرض الصور والتقاط جديد')}</button>
      </div>
    </div>}

    {step === 3 && audit && <div className="card col" data-testid="audit-result" style={{ gap: 14 }}>
      <div className="s-score" style={{ ['--sc' as string]: color, ['--p' as string]: Math.min(100, Math.max(0, score ?? 0)) }}>
        <span>{score != null ? num(score) : '-'}</span>
      </div>
      {photo}
      {audit.photo_url && (
        <div className="row between" style={{ alignItems: 'center', background: 'var(--card-subtle, #F1F5F9)', padding: '8px 12px', borderRadius: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>🔗 {t('رابط صورة الرف المرفوعة:')}</span>
          <a
            href={audit.photo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="badge b-blue"
            style={{ textDecoration: 'none', fontSize: 12 }}
          >
            {t('فتح الصورة في نافذة جديدة')} ↗
          </a>
        </div>
      )}
      <div className="row center" style={{ marginTop: -4, marginBottom: 4 }}>
        <span
          className={`badge ${score != null && score >= 85 ? 'b-green' : score != null && score >= 70 ? 'b-blue' : score != null && score >= 50 ? 'b-amber' : 'b-red'}`}
          style={{ fontSize: 13, padding: '4px 12px', fontWeight: 600 }}
        >
          {score != null && score >= 85
            ? t('متجر نموذجي (Perfect Store)')
            : score != null && score >= 70
              ? t('عرض تجاري جيد')
              : score != null && score >= 50
                ? t('يحتاج تحسينات')
                : t('أداء ضعيف بحاجة لمعالجة')}
        </span>
      </div>

      {audit.audit_summary_ar && (
        <div style={{ background: 'var(--card-subtle, rgba(0,0,0,0.03))', borderRadius: 12, padding: 14, fontWeight: 600 }}>
          {audit.audit_summary_ar}
        </div>
      )}

      {/* Share of Shelf Comparative Card */}
      {(targetMetrics.share_of_shelf_percentage != null || competitorMetrics.competitor_share_pct != null) && (
        <div className="col" style={{ gap: 10, background: 'var(--card-subtle, #F8FAFC)', padding: 14, borderRadius: 14, border: '1px solid var(--line)' }}>
          <div className="row between" style={{ alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>📊 {t('حصة الرف (Share of Shelf)')}</span>
            <span className="badge b-blue" style={{ fontSize: 12 }}>
              {settings.target_brand_name || t('علامتنا')}: {num(targetMetrics.share_of_shelf_percentage ?? 0)}%
            </span>
          </div>

          <div style={{ width: '100%', height: 12, borderRadius: 6, background: '#E2E8F0', overflow: 'hidden', display: 'flex' }}>
            <div
              style={{
                width: `${Math.min(100, Math.max(0, targetMetrics.share_of_shelf_percentage ?? 0))}%`,
                background: 'var(--color-primary, #1A56DB)',
                transition: 'width 0.4s ease',
              }}
              title={`${settings.target_brand_name || t('علامتنا')}: ${targetMetrics.share_of_shelf_percentage ?? 0}%`}
            />
            <div
              style={{
                width: `${Math.min(100, Math.max(0, competitorMetrics.competitor_share_pct ?? (100 - (targetMetrics.share_of_shelf_percentage ?? 0))))}%`,
                background: '#F59E0B',
                transition: 'width 0.4s ease',
              }}
              title={`${t('المنافسون')}: ${competitorMetrics.competitor_share_pct ?? 0}%`}
            />
          </div>

          <div className="row between muted" style={{ fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary, #1A56DB)' }} />
              {settings.target_brand_name || t('علامتنا')} ({num(targetMetrics.share_of_shelf_percentage ?? 0)}%)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
              {t('المنافسون')} ({num(competitorMetrics.competitor_share_pct ?? (100 - (targetMetrics.share_of_shelf_percentage ?? 0)))}%)
            </span>
          </div>
        </div>
      )}

      {/* 4 Quick Shelf KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="card col" style={{ margin: 0, padding: 12, gap: 4, background: 'var(--card-subtle, #F8FAFC)', borderRadius: 12 }}>
          <div className="muted" style={{ fontSize: 11 }}>📦 {t('واجهات العرض')}</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--color-primary)' }}>
            {num(targetMetrics.facings ?? 0)} <span style={{ fontSize: 12, fontWeight: 500 }}>{t('واجهة')}</span>
          </div>
        </div>

        <div className="card col" style={{ margin: 0, padding: 12, gap: 4, background: 'var(--card-subtle, #F8FAFC)', borderRadius: 12 }}>
          <div className="muted" style={{ fontSize: 11 }}>🔍 {t('حالة التوافر')}</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: targetMetrics.out_of_stock ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {targetMetrics.out_of_stock ? `⚠️ ${t('نفاد مخزون (OOS)')}` : `✅ ${t('متوفر بالكامل')}`}
          </div>
        </div>

        <div className="card col" style={{ margin: 0, padding: 12, gap: 4, background: 'var(--card-subtle, #F8FAFC)', borderRadius: 12 }}>
          <div className="muted" style={{ fontSize: 11 }}>🏷️ {t('المواد الدعائية')}</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: posmPresent ? 'var(--color-success)' : 'var(--muted)' }}>
            {posmPresent ? `✅ ${t('متوفرة')}` : `⚪ ${t('غير متوفرة')}`}
          </div>
        </div>

        <div className="card col" style={{ margin: 0, padding: 12, gap: 4, background: 'var(--card-subtle, #F8FAFC)', borderRadius: 12 }}>
          <div className="muted" style={{ fontSize: 11 }}>💰 {t('بطاقات الأسعار')}</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: priceTagVisible ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {priceTagVisible ? `✅ ${t('واضحة ومطابقة')}` : `⚠️ ${t('غير واضحة')}`}
          </div>
        </div>
      </div>

      {/* Out of Stock Items Alert */}
      {targetMetrics.out_of_stock && targetMetrics.oos_items && targetMetrics.oos_items.length > 0 && (
        <div className="alert err" style={{ fontSize: 13, gap: 6, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontWeight: 700 }}>🚨 {t('أصناف نفد مخزونها بحاجة لتوريد فوري:')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {targetMetrics.oos_items.map((item, idx) => (
              <span key={idx} className="chip" style={{ background: 'rgba(239,68,68,0.15)', color: '#DC2626', borderColor: '#FCA5A5' }}>
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Competitor Brands Detected */}
      {competitorMetrics.brands_detected && competitorMetrics.brands_detected.length > 0 && (
        <div className="col" style={{ gap: 8, background: 'var(--card-subtle, #F8FAFC)', padding: 12, borderRadius: 12, border: '1px solid var(--line)' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>⚔️ {t('العلامات المنافسة المرصودة')}:</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {competitorMetrics.brands_detected.map((brand, idx) => (
              <span key={idx} className="badge b-amber" style={{ fontSize: 12, padding: '3px 8px' }}>
                {brand}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Strategic Analysis */}
      {(detailedReport.brand_analysis || detailedReport.competitor_analysis || detailedReport.display_quality) && (
        <div className="col" style={{ gap: 10, background: 'var(--card-subtle, #F8FAFC)', padding: 14, borderRadius: 14, border: '1px solid var(--line)' }}>
          <div className="row between" style={{ alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>📋 {t('التحليل الاستراتيجي للعرض')}</span>
            {detailedReport.action_priority && (
              <span
                className={`badge ${detailedReport.action_priority.includes('عالية') ? 'b-red' : detailedReport.action_priority.includes('متوسطة') ? 'b-amber' : 'b-blue'}`}
                style={{ fontSize: 11 }}
              >
                {t('أولوية التحرك')}: {detailedReport.action_priority}
              </span>
            )}
          </div>

          {detailedReport.brand_analysis && (
            <div className="col" style={{ gap: 2, fontSize: 13 }}>
              <span className="muted" style={{ fontWeight: 600 }}>🎯 {t('تحليل تواجد علامتنا')}:</span>
              <span>{detailedReport.brand_analysis}</span>
            </div>
          )}

          {detailedReport.competitor_analysis && (
            <div className="col" style={{ gap: 2, fontSize: 13, borderTop: '1px dashed var(--line)', paddingTop: 6 }}>
              <span className="muted" style={{ fontWeight: 600 }}>⚔️ {t('تحليل انتشار المنافسين')}:</span>
              <span>{detailedReport.competitor_analysis}</span>
            </div>
          )}

          {detailedReport.display_quality && (
            <div className="col" style={{ gap: 2, fontSize: 13, borderTop: '1px dashed var(--line)', paddingTop: 6 }}>
              <span className="muted" style={{ fontWeight: 600 }}>✨ {t('جودة وترتيب العرض')}:</span>
              <span>{detailedReport.display_quality}</span>
            </div>
          )}
        </div>
      )}

      {issues.length > 0 && <>
        <div className="title">{t('الملاحظات')}</div>
        <ul className="s-finds">{issues.map((x, i) => <Finding key={`i${i}`} text={x} kind="issue" />)}</ul>
      </>}
      {recs.length > 0 && <>
        <div className="title">{t('التوصيات')}</div>
        <ul className="s-finds">{recs.map((x, i) => <Finding key={`r${i}`} text={x} kind="rec" />)}</ul>
      </>}
      <div className="col" style={{ gap: 8, background: 'var(--card-subtle, rgba(0,0,0,0.02))', padding: '12px', borderRadius: 10, border: '1px solid var(--line)' }}>
        <div className="row between" style={{ alignItems: 'center' }}>
          <div className="title" style={{ fontSize: 14 }}>🏷️ {t('السبب الجذري للملاحظة')}</div>
          {isUpdatingCause && <span className="muted" style={{ fontSize: 11 }}>{t('جاري الحفظ...')}</span>}
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {ROOT_CAUSES.map((cause) => (
            <button
              key={cause}
              type="button"
              className={`chip ${selectedCause === cause ? 'on' : ''}`}
              onClick={() => void handlePickCause(cause)}
              style={{ fontSize: 13, padding: '4px 10px' }}
              data-testid={`cause-${cause}`}
            >
              {cause}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 4 }}>
          <input
            type="text"
            className="input"
            placeholder={t('ملاحظات إضافية على سبب الملاحظة...')}
            value={auditNotes}
            onChange={(e) => setAuditNotes(e.target.value)}
            onBlur={() => void handleSaveNotes()}
            style={{ fontSize: 13, flex: 1 }}
            data-testid="input-audit-notes"
          />
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => void handleSaveNotes()}
            disabled={isUpdatingCause}
            style={{ fontSize: 12, padding: '0 10px' }}
          >
            {t('حفظ')}
          </button>
        </div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn success grow" onClick={save} data-testid="button-save-report" style={{ fontSize: 15, padding: '12px' }}>
          <Download size={18} /> {t('حفظ التقرير (HTML)')}
        </button>
        <button className="btn ghost grow" onClick={reset}>{t('معرض الصور والتقاط جديد')}</button>
      </div>
    </div>}
  </div>;
}

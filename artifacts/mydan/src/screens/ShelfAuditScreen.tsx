import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Camera, CheckCircle2, Download, RefreshCw, Save, ScanSearch, Trash2 } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useRealtime } from '@/hooks/useRealtime';
import { useVisitOptions, type VisitRow } from '@/lib/data';
import { useAuditResult, useRequestAuditAnalysis, useUploadAudit } from '@/lib/screen-data';
import { PageTitle } from '@/components/Layout';
import { ErrorState } from '@/components/States';
import { notify } from '@/lib/toast';
import { fmtDateTime, num } from '@/lib/format';
import { SelectOption, useInput, useRefetch } from './shared';
import { DIR, LANG, t } from '@/i18n';

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

export default function ShelfAuditScreen() {
  const { supervisor } = useAuth(); const settings = useAppSettings();
  const [params, setParams] = useSearchParams(); const auditId = params.get('audit');
  const visits = useVisitOptions(); const upload = useUploadAudit(); const request = useRequestAuditAnalysis();
  const result = useAuditResult(auditId);
  const [visitId, setVisitId] = useState(() => params.get('visit') ?? '');
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
    const found = visits.data?.find((v) => v.id === visitId);
    if (found) return found;
    if (visitId && supervisor) {
      return {
        id: visitId,
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
  }, [visits.data, visitId, supervisor, params]);

  const onVisit = useInput(setVisitId);

  // Immediate file capture with optimistic background compression
  const onFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0];
    e.target.value = '';
    if (!raw) return;

    // 1. Immediately show photo preview & make button active
    setFile(raw);

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
    if (!visit || !file || disabled) return;
    let uploaded = false;
    try {
      const a = await upload.mutateAsync({ visit, file });
      uploaded = true; setRequestFailed(false);
      setParams({ audit: a.id }, { replace: true }); setFile(null);
      await request.mutateAsync(a); setReqKey((k) => k + 1);
    } catch (err) {
      if (uploaded) setRequestFailed(true);
      console.error('Audit analysis failed:', err);
    }
  }, [visit, file, disabled, upload, request, setParams]);

  const photoOnly = useCallback(async () => {
    if (!visit || !file) return;
    try {
      const a = await upload.mutateAsync({ visit, file });
      setParams({ audit: a.id }, { replace: true });
      setFile(null);
    } catch { /* surfaced by hook */ }
  }, [visit, file, upload, setParams]);

  const retry = useCallback(() => {
    if (!audit || disabled) return;
    request.mutate(audit, { onSuccess: () => { setRequestFailed(false); setReqKey((k) => k + 1); }, onError: () => setRequestFailed(true) });
  }, [audit, disabled, request]);

  const reset = useCallback(() => { setParams({}, { replace: true }); setRequestFailed(false); setFile(null); }, [setParams]);
  const report = useMemo(() => (audit?.ai_detailed_report ?? {}) as Record<string, unknown>, [audit]);
  const issues = useMemo(() => toList(report.issues ?? report.problems), [report]);
  const recs = useMemo(() => toList(report.recommendations ?? report.suggestions), [report]);
  const score = audit?.audit_score ?? null;
  const color = score == null ? 'var(--muted)' : score > 75 ? 'var(--color-success)' : score >= 50 ? '#B45309' : 'var(--color-danger)';

  const save = useCallback(() => {
    if (!audit) return;
    const html = `<!doctype html><html lang="${LANG}" dir="${DIR}"><meta charset="utf-8"><title>${esc(t('تقرير الرف'))}</title><body style="font-family:sans-serif;max-width:640px;margin:auto;padding:16px"><h1>${esc(t('تقرير مراجعة الرف'))}</h1><p>${esc(settings.app_name)} - ${esc(supervisor?.full_name ?? '')}</p><p>${esc(fmtDateTime(audit.audited_at))}</p><h2>${esc(t('النتيجة: {score}', { score: audit.audit_score ?? '-' }))}</h2><p>${esc(audit.audit_summary_ar ?? '')}</p><h3>${esc(t('الملاحظات'))}</h3><ul>${issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><h3>${esc(t('التوصيات'))}</h3><ul>${recs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `shelf-report-${audit.id}.html`; a.click(); URL.revokeObjectURL(url);
    notify(t('التقرير محفوظ في النظام وتم تنزيل نسخة منه'), 'success');
  }, [audit, settings.app_name, supervisor?.full_name, issues, recs]);

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
    </div>}

    {auditId && step === 2 && <div className="card col" style={{ gap: 14 }}>
      {result.isError && <ErrorState error={result.error} onRetry={refetch} />}
      {photo}
      {disabled && status !== 'failed' ? <div className="alert ok" role="status" data-testid="photo-saved">{t('تم حفظ صورة الرف في النظام. التحليل الذكي غير مفعّل.')}</div>
        : status === 'failed' || requestFailed ? <>
          <div className="alert err">{requestFailed ? t('تعذر إرسال طلب التحليل.') : t('فشل تحليل الرف.')}</div>
          <button className="btn" disabled={request.isPending || disabled} onClick={retry}><RefreshCw /> {t('إعادة المحاولة')}</button>
        </> : !audit ? <div className="skel" style={{ height: 60 }} /> : <>
          <div className="s-wait" role="status"><span className="s-pulse" />{t('جاري تحليل الرف بالذكاء الاصطناعي...')}</div>
          {stale && <>
            <div className="alert warn">{t('التحليل يستغرق وقتا أطول من المعتاد، وقد يكون ما زال قيد التنفيذ. إعادة الطلب قد تكرر التحليل.')}</div>
            <button className="btn ghost" disabled={request.isPending} onClick={retry} data-testid="button-manual-retry"><RefreshCw /> {t('إعادة طلب التحليل')}</button>
          </>}
        </>}
      <button className="btn ghost" onClick={reset}>{t('بدء مراجعة جديدة')}</button>
    </div>}

    {step === 3 && audit && <div className="card col" data-testid="audit-result" style={{ gap: 14 }}>
      <div className="s-score" style={{ ['--sc' as string]: color, ['--p' as string]: Math.min(100, Math.max(0, score ?? 0)) }}>
        <span>{score != null ? num(score) : '-'}</span>
      </div>
      {photo}
      {audit.audit_summary_ar && (
        <div style={{ background: 'var(--card-subtle, rgba(0,0,0,0.03))', borderRadius: 12, padding: 14, fontWeight: 600 }}>
          {audit.audit_summary_ar}
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
      <button className="btn success" onClick={save} data-testid="button-save-report" style={{ fontSize: 15, padding: '12px' }}>
        <Download size={18} /> {t('حفظ التقرير')}
      </button>
      <button className="btn ghost" onClick={reset}>{t('مراجعة جديدة')}</button>
    </div>}
  </div>;
}

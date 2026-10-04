import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Camera, CheckCircle2, Download, RefreshCw, Save, ScanSearch } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useRealtime } from '@/hooks/useRealtime';
import { useVisitOptions } from '@/lib/data';
import { useAuditResult, useRequestAuditAnalysis, useUploadAudit } from '@/lib/screen-data';
import { PageTitle } from '@/components/Layout';
import { ErrorState } from '@/components/States';
import { notify } from '@/lib/toast';
import { fmtDateTime, num } from '@/lib/format';
import { SelectOption, useInput, useRefetch } from './shared';

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
    {kind === 'issue' ? <AlertTriangle size={18} color="var(--color-danger)" aria-label="ملاحظة" /> : <CheckCircle2 size={18} color="var(--color-success)" aria-label="توصية" />}
    <span>{text}</span></li>;
});
const Step = memo(function Step({ label, index, current }: { label: string; index: number; current: number }) {
  return <div className={current === index ? 'on' : current > index ? 'done' : ''}>{num(index)}. {label}</div>;
});
function AuditRealtime({ id, onChange }: { id: string; onChange: () => void }) {
  useRealtime('shelf_audits', `id=eq.${id}`, onChange);
  return null;
}

export default function ShelfAuditScreen() {
  const { supervisor } = useAuth(); const settings = useAppSettings();
  const [params, setParams] = useSearchParams(); const auditId = params.get('audit');
  const visits = useVisitOptions(); const upload = useUploadAudit(); const request = useRequestAuditAnalysis();
  const result = useAuditResult(auditId);
  const [visitId, setVisitId] = useState(''); const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [requestFailed, setRequestFailed] = useState(false); const [stale, setStale] = useState(false); const [reqKey, setReqKey] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!file) { setPreview(null); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
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
  const visit = useMemo(() => visits.data?.find((v) => v.id === visitId), [visits.data, visitId]);
  const onVisit = useInput(setVisitId);
  const onFile = useCallback((e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null), []);
  const pick = useCallback(() => input.current?.click(), []);
  const analyze = useCallback(async () => {
    if (!visit || !file || disabled) return;
    let uploaded = false;
    try {
      const a = await upload.mutateAsync({ visit, file });
      uploaded = true; setRequestFailed(false);
      setParams({ audit: a.id }, { replace: true }); setFile(null);
      await request.mutateAsync(a); setReqKey((k) => k + 1);
    } catch { if (uploaded) setRequestFailed(true); }
  }, [visit, file, disabled, upload, request, setParams]);
  const photoOnly = useCallback(async () => {
    if (!visit || !file) return;
    try { const a = await upload.mutateAsync({ visit, file }); setParams({ audit: a.id }, { replace: true }); setFile(null); } catch { /* surfaced by hook */ }
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
    const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>تقرير الرف</title><body style="font-family:sans-serif;max-width:640px;margin:auto;padding:16px"><h1>تقرير مراجعة الرف</h1><p>${esc(settings.app_name)} - ${esc(supervisor?.name ?? '')}</p><p>${esc(fmtDateTime(audit.audited_at))}</p><h2>النتيجة: ${audit.audit_score ?? '-'}</h2><p>${esc(audit.audit_summary_ar ?? '')}</p><h3>الملاحظات</h3><ul>${issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><h3>التوصيات</h3><ul>${recs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `shelf-report-${audit.id}.html`; a.click(); URL.revokeObjectURL(url);
    notify('التقرير محفوظ في النظام وتم تنزيل نسخة منه', 'success');
  }, [audit, settings.app_name, supervisor?.name, issues, recs]);
  const busy = upload.isPending || request.isPending;
  const photo = audit?.photo_url ? <img src={audit.photo_url} alt="صورة الرف" loading="lazy" style={{ width: '100%', borderRadius: 12, maxHeight: 220, objectFit: 'cover' }} /> : null;
  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    {auditId && <AuditRealtime id={auditId} onChange={refetch} />}
    <PageTitle>مراجعة الرف</PageTitle>
    <div className="s-steps" aria-label="الخطوات">
      {['الصورة', 'التحليل', 'التقرير'].map((label, i) => <Step key={label} label={label} index={i + 1} current={step} />)}
    </div>
    {disabled && <div className="alert warn">تحليل الرف الذكي غير مفعّل لشركتك. يمكنك حفظ صورة الرف فقط.</div>}
    {!auditId && <div className="card col">
      {visits.isError ? <ErrorState error={visits.error} onRetry={retryVisits} /> :
        <label className="f">الزيارة
          <select className="input" value={visitId} onChange={onVisit} disabled={visits.isPending} data-testid="select-visit">
            <option value="">{visits.isPending ? 'جاري التحميل...' : 'اختر زيارة'}</option>
            {visits.data?.map((v) => <SelectOption key={v.id} value={v.id} label={`${v.customers?.name ?? 'عميل'} · ${v.visit_date}`} />)}
          </select></label>}
      <input ref={input} type="file" accept="image/*" capture="environment" hidden data-testid="input-photo" onChange={onFile} />
      {preview && <img src={preview} alt="معاينة صورة الرف" loading="lazy" style={{ width: '100%', borderRadius: 12, maxHeight: 300, objectFit: 'cover' }} />}
      <button className="btn ghost" onClick={pick} data-testid="button-camera"><Camera /> {file ? 'إعادة التقاط الصورة' : 'التقط صورة الرف'}</button>
      {file && !disabled && <button className="btn" disabled={!visit || busy} onClick={analyze} data-testid="button-submit-audit"><ScanSearch /> {busy ? 'جاري المعالجة...' : 'تحليل الرف بالذكاء الاصطناعي'}</button>}
      {file && disabled && <button className="btn" disabled={!visit || busy} onClick={photoOnly} data-testid="button-save-photo"><Save /> {upload.isPending ? 'جاري الحفظ...' : 'حفظ الصورة فقط'}</button>}
      {file && !visit && <div className="muted">اختر الزيارة أولا.</div>}
    </div>}
    {auditId && step === 2 && <div className="card col">
      {result.isError && <ErrorState error={result.error} onRetry={refetch} />}
      {photo}
      {disabled && status !== 'failed' ? <div className="alert ok" role="status" data-testid="photo-saved">تم حفظ صورة الرف في النظام. التحليل الذكي غير مفعّل.</div>
        : status === 'failed' || requestFailed ? <>
          <div className="alert err">{requestFailed ? 'تعذر إرسال طلب التحليل.' : 'فشل تحليل الرف.'}</div>
          <button className="btn" disabled={request.isPending || disabled} onClick={retry}><RefreshCw /> إعادة المحاولة</button>
        </> : !audit ? <div className="skel" style={{ height: 60 }} /> : <>
          <div className="s-wait" role="status"><span className="s-pulse" />جاري تحليل الرف...</div>
          {stale && <>
            <div className="alert warn">التحليل يستغرق وقتا أطول من المعتاد، وقد يكون ما زال قيد التنفيذ. إعادة الطلب قد تكرر التحليل.</div>
            <button className="btn ghost" disabled={request.isPending} onClick={retry} data-testid="button-manual-retry"><RefreshCw /> إعادة طلب التحليل</button>
          </>}
        </>}
      <button className="btn ghost" onClick={reset}>بدء مراجعة جديدة</button>
    </div>}
    {step === 3 && audit && <div className="card col" data-testid="audit-result">
      <div className="s-score" style={{ ['--sc' as string]: color, ['--p' as string]: Math.min(100, Math.max(0, score ?? 0)) }}><span>{score != null ? num(score) : '-'}</span></div>
      {photo}
      {audit.audit_summary_ar && <p style={{ margin: 0 }}>{audit.audit_summary_ar}</p>}
      {issues.length > 0 && <><div className="title">الملاحظات</div><ul className="s-finds">{issues.map((x, i) => <Finding key={`i${i}`} text={x} kind="issue" />)}</ul></>}
      {recs.length > 0 && <><div className="title">التوصيات</div><ul className="s-finds">{recs.map((x, i) => <Finding key={`r${i}`} text={x} kind="rec" />)}</ul></>}
      <button className="btn success" onClick={save} data-testid="button-save-report"><Download /> حفظ التقرير</button>
      <button className="btn ghost" onClick={reset}>مراجعة جديدة</button>
    </div>}
  </div>;
}

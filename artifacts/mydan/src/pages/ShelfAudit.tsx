import { useEffect, useRef, useState } from 'react';
import { Camera, ImageOff, ScanSearch } from 'lucide-react';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useAnalyzeAudit, useShelfAudits, useSubmitAudit, useVisitOptions } from '@/lib/data';
import { PageTitle } from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import { fmtDateTime, num } from '@/lib/format';

const LABEL: Record<string, [string, string]> = { pending: ['بانتظار التحليل', 'b-yellow'], processing: ['قيد التحليل', 'b-blue'], completed: ['تم التحليل', 'b-green'], failed: ['فشل التحليل', 'b-red'] };

export default function ShelfAudit() {
  const s = useAppSettings(); const visits = useVisitOptions(); const audits = useShelfAudits();
  const submit = useSubmitAudit(); const analyze = useAnalyzeAudit();
  const [visitId, setVisitId] = useState(''); const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!file) { setPreview(null); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  const visit = visits.data?.find((v) => v.id === visitId);
  const names = new Map(visits.data?.map((v) => [v.id, v.customers?.name]) ?? []);
  return <div className="page">
    <PageTitle>مراجعة الرف</PageTitle>
    <div className="card col">
      <label className="f">الزيارة
        {visits.isError ? <ErrorState error={visits.error} onRetry={() => void visits.refetch()} /> :
          <select className="input" value={visitId} onChange={(e) => setVisitId(e.target.value)} disabled={visits.isPending} data-testid="select-visit">
            <option value="">{visits.isPending ? 'جاري التحميل...' : 'اختر زيارة'}</option>
            {visits.data?.map((v) => <option key={v.id} value={v.id}>{v.customers?.name ?? 'عميل'} · {v.visit_date}</option>)}
          </select>}
      </label>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden data-testid="input-photo" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {preview ? <img src={preview} alt="معاينة صورة الرف" style={{ width: '100%', borderRadius: 12, maxHeight: 280, objectFit: 'cover' }} /> : null}
      <button className="btn ghost" onClick={() => input.current?.click()}><Camera /> {file ? 'تغيير الصورة' : 'التقاط أو اختيار صورة'}</button>
      <button className="btn" disabled={!visit || !file || submit.isPending} data-testid="button-submit-audit"
        onClick={() => visit && file && submit.mutate({ visit, file }, { onSuccess: () => { setFile(null); if (input.current) input.current.value = ''; } })}>
        {submit.isPending ? 'جاري الرفع...' : 'حفظ صورة الرف'}</button>
      {!s.ai_audit_enabled && <div className="alert warn">تحليل الرف الذكي غير مفعّل لشركتك. يمكنك حفظ الصور فقط.</div>}
    </div>
    <PageTitle>السجلات</PageTitle>
    {audits.isPending ? <SkeletonList n={3} /> : audits.isError ? <ErrorState error={audits.error} onRetry={() => void audits.refetch()} />
      : audits.items.length === 0 ? <EmptyState icon={<ImageOff />} title="لا توجد سجلات رف" text="التقط أول صورة لرف عميل." />
      : <>{audits.items.map((a) => { const [l, c] = LABEL[a.status] ?? [a.status, 'b-gray']; return <div key={a.id} className="card col" data-testid={`card-audit-${a.id}`}>
        <div className="row between"><span className="title">{names.get(a.visit_id) ?? 'زيارة'}</span><span className={`badge ${c}`}>{l}</span></div>
        {a.photo_url && <img src={a.photo_url} alt="صورة الرف" loading="lazy" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10 }} />}
        <div className="muted">{fmtDateTime(a.audited_at)}</div>
        {a.audit_score != null && <div className="big" style={{ color: 'var(--color-success)' }}>{num(a.audit_score)}<span className="muted" style={{ fontSize: 14 }}> / ١٠٠</span></div>}
        {a.audit_summary_ar && <div>{a.audit_summary_ar}</div>}
        {s.ai_audit_enabled && a.photo_url && (a.status === 'pending' || a.status === 'failed') &&
          <button className="btn sm ghost" disabled={analyze.isPending} onClick={() => analyze.mutate(a)} data-testid={`button-analyze-${a.id}`}><ScanSearch size={18} /> {analyze.isPending && analyze.variables?.id === a.id ? 'جاري الطلب...' : 'تحليل الصورة'}</button>}
      </div>; })}<LoadMore q={audits} /></>}
  </div>;
}

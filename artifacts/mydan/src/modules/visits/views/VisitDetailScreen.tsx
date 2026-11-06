import { memo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Camera, CheckCheck, ClipboardList, Compass, Plus, ScanSearch, ShieldCheck, ShoppingCart } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useScope, useSetVisitOutcome, useUpdateVisitStatus } from '@/lib/data';
import { isVisitOutcome, mapsDirectionsUrl, VISIT_OUTCOMES, type VisitOutcome } from '@/lib/visit-geo';
import { triggerWhatsAppShare } from '@/shared/utils/whatsapp';
import { useScreenAllowed } from '@/lib/permissions';
import { num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/toast';
import { PageTitle } from '@/components/Layout';
import { ErrorState, SkeletonList } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { fmtDate, fmtTime, visitMinutes } from '@/lib/format';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Customer, Visit } from '@/types/database';
import { t } from '@/i18n';
import { confirm } from '@/lib/confirm';

interface VisitTask {
  id: string;
  task_type: string;
  title_ar: string;
  is_completed: boolean;
  is_mandatory: boolean;
  order_num: number;
}
interface VisitDetail extends Visit {
  visit_outcome: VisitOutcome | null; on_beat: boolean | null; geo_distance: number | null;
  customers: Pick<Customer, 'id' | 'name' | 'address' | 'customer_type' | 'latitude' | 'longitude' | 'phone' | 'owner_phone'> | null;
  visit_tasks: VisitTask[];
}

const TASK_ICONS: Record<string, string> = {
  shelf_audit: '📸',
  competitor_check: '👁️',
  survey: '📋',
  other: '✓',
};

function useVisitDetail(id: string) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'visit-detail', id],
    enabled: !!id,
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await sc.scope(
        supabase.from('visits').select(
          `id,supervisor_id,customer_id,visit_date,check_in_time,check_out_time,
           status,latitude,longitude,notes,company_id,visit_outcome,on_beat,geo_distance,
           customers(id,name,address,customer_type,customer_code,latitude,longitude,phone,owner_phone),
           visit_tasks(id,task_type,title_ar,is_completed,is_mandatory,order_num)`
        )
      ).eq('id', id).abortSignal(signal).single();
      if (error) throw new Error(t('تعذر تحميل بيانات الزيارة.'));
      const visit = data as unknown as VisitDetail;
      visit.visit_tasks = (visit.visit_tasks ?? []).sort((a, b) => a.order_num - b.order_num);
      return visit;
    },
  });
}

function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, visitId }: { taskId: string; visitId: string }) => {
      const { data, error } = await supabase
        .from('visit_tasks')
        .update({ is_completed: true, completed_at: new Date().toISOString() })
        .eq('id', taskId)
        .eq('visit_id', visitId)
        .select('id');
      if (error) throw new Error(t('تعذر تحديث المهمة.'));
      if (!data?.length) throw new Error(t('لم يتم تحديث المهمة. قد لا تملك الصلاحية.'));
    },
    onSuccess: () => {
      notify(t('✅ تم إنجاز المهمة'), 'success');
      qc.invalidateQueries({ predicate: (q) => q.queryKey.includes('visit-detail') });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

const TaskItem = memo(function TaskItem({
  task, visitId, customerName, customerPhone, visitDate, onComplete, onAction,
}: {
  task: VisitTask; visitId: string; customerName?: string; customerPhone?: string | null; visitDate?: string;
  onComplete: (taskId: string, visitId: string) => void;
  onAction: (task: VisitTask) => void;
}) {
  const complete = useCallback(() => onComplete(task.id, visitId), [onComplete, task.id, visitId]);
  const action = useCallback(() => onAction(task), [onAction, task]);
  const shareWhatsApp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const dueDate = visitDate ? fmtDate(visitDate) : fmtDate(new Date().toISOString().slice(0, 10));
    const targetName = customerName || t('العميل');
    const msg = `مرحباً، تم رصد ملاحظة في زيارة عميل ${targetName}: ${task.title_ar}. برجاء المتابعة والتنفيذ في موعد أقصاه ${dueDate}.`;
    triggerWhatsAppShare(customerPhone, msg);
  }, [customerName, customerPhone, task.title_ar, visitDate]);
  return (
    <div className="card row" style={{ padding: '10px 14px', gap: 10, opacity: task.is_completed ? 0.6 : 1, borderInlineStart: `4px solid ${task.is_completed ? 'var(--color-success)' : task.is_mandatory ? 'var(--color-danger)' : 'var(--line)'}` }}>
      <span style={{ fontSize: 22, flexShrink: 0 }}>{TASK_ICONS[task.task_type] ?? '✓'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, textDecoration: task.is_completed ? 'line-through' : 'none' }}>{task.title_ar}</div>
        {task.is_mandatory && !task.is_completed && (<span className="badge b-red" style={{ fontSize: 11, marginTop: 2 }}>{t('إلزامية')}</span>)}
      </div>
      <button
        type="button"
        className="btn sm"
        style={{
          background: '#25D366',
          color: '#fff',
          border: 'none',
          padding: '2px 8px',
          fontSize: 13,
          minHeight: 44,
          borderRadius: 6,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          flexShrink: 0,
        }}
        onClick={shareWhatsApp}
        title={t('مشاركة عبر واتساب')}
        aria-label={t('مشاركة عبر واتساب')}
        data-testid={`button-whatsapp-task-${task.id}`}
      >
        <span>💬</span>
      </button>
      {!task.is_completed && (
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          {['shelf_audit', 'competitor_check'].includes(task.task_type) && (
            <button className="btn sm ghost" style={{ fontSize: 13, padding: '0 10px' }} onClick={action}>{t('فتح')}</button>
          )}
          <button className="btn sm success" aria-label={t('إنجاز المهمة: {name}', { name: task.title_ar })} style={{ fontSize: 13, padding: '0 10px' }} onClick={complete}><CheckCheck size={16} /></button>
        </div>
      )}
      {task.is_completed && (<CheckCheck size={20} color="var(--color-success)" />)}
    </div>
  );
});

const OutcomePicker = memo(function OutcomePicker({ value, disabled, onPick }: { value: VisitOutcome | null; disabled: boolean; onPick: (o: VisitOutcome) => void }) {
  return <div className="card col" role="radiogroup" aria-label={t('نتيجة الزيارة')}>
    <div className="title">{t('نتيجة الزيارة *')}</div>
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
      {VISIT_OUTCOMES.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`chip grow ${value === o.value ? 'on' : ''}`}
          style={{
            fontSize: o.value.length > 7 ? 12 : 13.5,
            whiteSpace: 'nowrap',
            padding: '8px 10px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
          disabled={disabled}
          onClick={() => onPick(o.value)}
          data-testid={`outcome-${o.value}`}
        >
          <span>{o.dot}</span>
          <span>{t(o.label)}</span>
        </button>
      ))}
    </div>
    {!value && !disabled && <div className="muted" style={{ fontSize: 13 }}>{t('اختر نتيجة الزيارة قبل إنهائها.')}</div>}
  </div>;
});

function GeoStatus({ v, radius }: { v: VisitDetail; radius: number }) {
  const c = v.customers;
  return (
    <div className="card col" style={{ gap: 10 }}>
      <div className="title row" style={{ alignItems: 'center', gap: 6 }}>
        <Compass size={18} />
        <span>{t('الموقع والنطاق الجغرافي')}</span>
      </div>

      {v.on_beat == null ? (
        <div className="muted">{t('لم يُسجَّل فحص النطاق لهذه الزيارة.')}</div>
      ) : v.on_beat ? (
        <div className="alert ok row" style={{ alignItems: 'center', gap: 8, margin: 0 }} role="status">
          <ShieldCheck size={20} />
          <div>
            <strong>{t('✅ زيارة موثقة داخل النطاق الجغرافي')}</strong>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              {t('تم تسجيل الوصول على بعد {d} م من المنفذ (الحد الأقصى {r} م)', {
                d: num(Math.round(v.geo_distance ?? 0)),
                r: num(radius),
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="alert warn row" style={{ alignItems: 'center', gap: 8, margin: 0 }} role="status">
          <AlertTriangle size={20} />
          <div>
            <strong>{t('⚠️ زيارة مسجلة خارج خط السير (OOR)')}</strong>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              {v.geo_distance != null
                ? t('تم تسجيل الوصول على بعد {d} م من المنفذ (المسموح {r} م)', {
                    d: num(Math.round(v.geo_distance)),
                    r: num(radius),
                  })
                : t('المنفذ بلا إحداثيات مسجلة')}
            </div>
          </div>
        </div>
      )}

      {c?.latitude != null && c.longitude != null && (
        <a
          className="btn sm ghost"
          href={mapsDirectionsUrl(c.latitude, c.longitude)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content' }}
        >
          <Compass size={16} />
          <span>{t('التوجيه إلى المنفذ 🗺️')}</span>
        </a>
      )}
    </div>
  );
}

export default function VisitDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { supervisor } = useAuth();
  const settings = useAppSettings();
  const fieldSurveyAllowed = useScreenAllowed('field_survey');
  const detail = useVisitDetail(id ?? '');
  const completeTask = useCompleteTask();
  const checkOut = useUpdateVisitStatus();
  const setOutcome = useSetVisitOutcome();
  const pickOutcome = useCallback((outcome: VisitOutcome) => { if (id) setOutcome.mutate({ id, outcome }); }, [id, setOutcome]);
  const refetch = useCallback(() => { void detail.refetch(); }, [detail]);

  const handleAction = useCallback((task: VisitTask) => {
    if (!id) return;
    const customer = detail.data?.customers;
    const params = new URLSearchParams({ visit: id, customer: customer?.id ?? '', name: customer?.name ?? '', type: customer?.customer_type ?? '' });
    if (task.task_type === 'shelf_audit') nav(`/shelf-audit?${params}`);
    else if (task.task_type === 'competitor_check') nav(`/competitors?${params}`);
  }, [nav, id, detail.data]);

  const handleComplete = useCallback((taskId: string, visitId: string) => { completeTask.mutate({ taskId, visitId }); }, [completeTask]);

  const handleCheckOut = useCallback(async () => {
    if (!id || !detail.data) return;
    if (!isVisitOutcome(detail.data.visit_outcome)) { notify(t('اختر نتيجة الزيارة أولاً: متعامل / غير متعامل / غير موجود'), 'error'); return; }
    // Mandatory tasks only apply when the outlet is trading with us.
    const open = detail.data.visit_outcome === 'متعامل'
      ? detail.data.visit_tasks.filter((t) => t.is_mandatory && !t.is_completed).length : 0;
    const msg = open ? `توجد ${open} مهام إلزامية غير منجزة. إنهاء الزيارة على أي حال؟` : 'إنهاء الزيارة وتسجيل الخروج؟';
    if (!await confirm(msg)) return;
    checkOut.mutate({ id, status: 'completed' }, { onSuccess: () => nav('/visits', { replace: true }) });
  }, [checkOut, id, nav, detail.data]);

  const goShelfAudit = useCallback(() => {
    const c = detail.data?.customers;
    const p = new URLSearchParams({ visit: id ?? '', customer: c?.id ?? '', name: c?.name ?? '', type: c?.customer_type ?? '' });
    nav(`/shelf-audit?${p}`);
  }, [nav, id, detail.data]);

  const goCompetitors = useCallback(() => {
    const c = detail.data?.customers;
    const p = new URLSearchParams({ visit: id ?? '', customer: c?.id ?? '', name: c?.name ?? '' });
    nav(`/competitors?${p}`);
  }, [nav, id, detail.data]);

  const goFieldSurvey = useCallback(() => nav('/field-survey'), [nav]);

  if (!id) return (
    <div className="page">
      <PageTitle>{t('تفاصيل الزيارة')}</PageTitle>
      <div className="alert err">{t('معرّف الزيارة مفقود.')}</div>
    </div>
  );

  return (
    <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
      <PageTitle>{t('تفاصيل الزيارة')}</PageTitle>
      {detail.isPending ? <SkeletonList n={4} /> : detail.isError ? <ErrorState error={detail.error} onRetry={refetch} /> : !detail.data ? null : (
        <>
          <div className="card col">
            <div className="row between">
              <div className="title row" style={{ fontSize: 18, alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {(detail.data.customers as any)?.customer_code && <span className="badge b-blue" style={{ fontFamily: 'monospace', fontSize: 12 }}>{(detail.data.customers as any).customer_code}</span>}
                <span>{detail.data.customers?.name ?? t('عميل غير معروف')}</span>
              </div>
              <StatusBadge status={detail.data.status} />
            </div>
            {detail.data.customers?.address && <div className="muted" style={{ fontSize: 13 }}>{detail.data.customers.address}</div>}
            <div className="muted" style={{ fontSize: 13 }}>
              📅 {fmtDate(detail.data.visit_date)}
              {detail.data.check_in_time && ` · ${t('دخول')} ${fmtTime(detail.data.check_in_time)}`}
              {detail.data.check_out_time && ` · ${t('خروج')} ${fmtTime(detail.data.check_out_time)}`}
            </div>
            {detail.data.notes && <div style={{ fontSize: 14 }}>{detail.data.notes}</div>}
          </div>

          <OutcomePicker value={detail.data.visit_outcome} disabled={detail.data.status !== 'in_progress' || setOutcome.isPending} onPick={pickOutcome} />
          <GeoStatus v={detail.data} radius={settings.geofence_radius_m} />

          {detail.data.visit_outcome !== t('غير موجود') && detail.data.visit_tasks.length > 0 && (
            <div className="col" style={{ gap: 8 }}>
              <div className="row between">
                <div className="title"><ClipboardList size={18} style={{ display: 'inline', marginInlineEnd: 6 }} />{t('مهام الزيارة')}</div>
                <span className="muted" style={{ fontSize: 13 }}>{detail.data.visit_tasks.filter((t) => t.is_completed).length} / {detail.data.visit_tasks.length}</span>
              </div>
              {detail.data.visit_tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  visitId={id}
                  customerName={detail.data.customers?.name}
                  customerPhone={detail.data.customers?.phone || detail.data.customers?.owner_phone}
                  visitDate={detail.data.visit_date}
                  onComplete={handleComplete}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}

          {detail.data.status === 'in_progress' && detail.data.visit_outcome !== t('غير موجود') && (
            <div className="card col">
              <div className="title">{t('إجراءات سريعة')}</div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn sm ghost grow" onClick={goShelfAudit} style={{ whiteSpace: 'nowrap', minWidth: 90 }}><Camera size={16} /> {t('مراجعة الرف')}</button>
                <button className="btn sm ghost grow" onClick={goCompetitors} style={{ whiteSpace: 'nowrap', minWidth: 80 }}><Plus size={16} /> {t('منافسين')}</button>
                {fieldSurveyAllowed && <button className="btn sm ghost grow" onClick={goFieldSurvey} style={{ whiteSpace: 'nowrap', minWidth: 80 }}><ScanSearch size={16} /> {t('مسح ميداني')}</button>}
              </div>
            </div>
          )}

          {detail.data.status === 'in_progress' && (
            <button className="btn success block" disabled={checkOut.isPending || !detail.data.visit_outcome} onClick={handleCheckOut} data-testid="button-check-out">
              <CheckCheck size={20} />
              {checkOut.isPending ? t('جاري الحفظ...') : t('إنهاء الزيارة وتسجيل الخروج')}
            </button>
          )}
          {detail.data.status === 'skipped' && <div className="alert err">{t('هذه الزيارة ملغاة.')}</div>}
          {detail.data.status === 'completed' && <div className="alert ok">✅ {t('الزيارة مكتملة')} · {t('خروج')} {fmtTime(detail.data.check_out_time)}
            {(() => { const m = visitMinutes(detail.data.check_in_time, detail.data.check_out_time); return m != null ? ` · ${t('المدة {n} دقيقة', { n: num(m) })}` : ''; })()}</div>}
        </>
      )}
    </div>
  );
}

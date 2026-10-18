import { memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, CheckCircle2, ClipboardList, Clock, GraduationCap, LogIn, LogOut, MapPin, Plus, Route, ScanSearch, ShoppingCart, Target as TargetIcon } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useRealtime } from '@/hooks/useRealtime';
import { canAdmin } from '@/lib/policy';
import { useScreenAllowed } from '@/lib/permissions';
import { useScreenDashboard, useAttendanceToday } from '@/lib/screen-data';
import { useAttendanceAction } from '@/lib/data';
import type { VisitRow } from '@/lib/data';
import { KPICard } from '@/components/KPICard';
import { StatusBadge } from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { ErrorState } from '@/components/States';
import { PageTitle } from '@/components/Layout';
import { fmtDate, fmtTime, num, todayStr } from '@/lib/format';
import { Act, useRefetch } from './shared';
import { t } from '@/i18n';
import type { Attendance } from '@/types/database';

const Recent = memo(function Recent({ v, onOpen }: { v: VisitRow; onOpen: (id: string) => void }) {
  return <Act id={v.id} onAct={onOpen} className="s-row" testId={`row-recent-${v.id}`}>
    <div className="grow"><div className="title">{v.customers?.name ?? t('عميل')}</div><div className="muted">{fmtDate(v.visit_date)} · {fmtTime(v.check_in_time)}</div></div>
    <StatusBadge status={v.status} />
  </Act>;
});

function AttendanceWidget() {
  const { data: att, isPending } = useAttendanceToday();
  const action = useAttendanceAction();
  const busy = action.isPending;

  if (isPending) return <div className="card" style={{ padding: '12px 16px', marginBottom: 8 }}><div className="skel" style={{ height: 36 }} /></div>;

  const checkedIn = !!att?.check_in_time;
  const checkedOut = !!att?.check_out_time;

  if (checkedOut) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 8, background: 'var(--color-success,#108981)', color: '#fff' }}>
        <CheckCircle2 size={20} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{t('تم إكمال يوم العمل اليوم')}</span>
        <span style={{ marginRight: 'auto', fontSize: 12, opacity: 0.85 }}>{fmtTime(att!.check_in_time)} — {fmtTime(att!.check_out_time)}</span>
      </div>
    );
  }

  if (checkedIn) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 8 }}>
        <Clock size={18} style={{ color: 'var(--color-primary,#1A56DB)', flexShrink: 0 }} />
        <div style={{ flexGrow: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{t('تم تسجيل الحضور')}</div>
          <div className="muted" style={{ fontSize: 12 }}>{fmtTime(att!.check_in_time)}</div>
        </div>
        <button
          className="btn sm danger"
          disabled={busy}
          onClick={() => action.mutate({ kind: 'out', row: att as Attendance })}
          style={{ whiteSpace: 'nowrap' }}
        >
          <LogOut size={15} /> {t('تسجيل انصراف')}
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 8, borderRight: '4px solid var(--color-warning,#F59E0B)' }}>
      <LogIn size={18} style={{ color: 'var(--color-warning,#F59E0B)', flexShrink: 0 }} />
      <div style={{ flexGrow: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{t('لم تسجل حضورك اليوم')}</div>
        <div className="muted" style={{ fontSize: 12 }}>{fmtDate(todayStr())}</div>
      </div>
      <button
        className="btn sm primary"
        disabled={busy}
        onClick={() => action.mutate({ kind: 'in', row: null })}
        style={{ whiteSpace: 'nowrap' }}
      >
        <LogIn size={15} /> {t('تسجيل حضور')}
      </button>
    </div>
  );
}

export default function DashboardScreen() {
  const nav = useNavigate(); const { supervisor } = useAuth(); const settings = useAppSettings();
  const q = useScreenDashboard(); const d = q.data; const L = q.isPending;
  const admin = canAdmin(supervisor);
  const fieldSurveyAllowed = useScreenAllowed('field_survey');
  const retry = useRefetch(q.refetch);
  useRealtime('visits', supervisor ? (admin ? `company_id=eq.${supervisor.company_id}` : `supervisor_id=eq.${supervisor.id}`) : undefined, retry);
  const go = useCallback((p: string) => nav(p), [nav]);
  const goNew = useCallback(() => nav('/visits/new'), [nav]);
  const open = useCallback(() => nav('/visits'), [nav]);
  const recent = useMemo(() => d?.recent.slice(0, 5) ?? [], [d?.recent]);
  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle>{settings.app_name}<span className="muted" style={{ fontSize: 14, fontWeight: 400 }}> · {fmtDate(todayStr())}</span></PageTitle>
    {q.isError ? <ErrorState error={q.error} onRetry={retry} /> : <>
      <AttendanceWidget />
      <div className="s-kpis">
        <KPICard icon={<MapPin size={18} />} title={t('زيارات اليوم')} value={d && num(d.visits)} loading={L} />
        <KPICard icon={<Camera size={18} />} title={t('مراجعات الرف')} value={d && num(d.audits)} loading={L} color="#6D3FC0" />
        <KPICard icon={<TargetIcon size={18} />} title={t('نسبة الهدف%')} value={d && `${num(Math.round(d.visitsProgress))}%`} loading={L} color="var(--color-success)" />
      </div>
      <div className="s-acts">
        <Act id="/visits/new" onAct={go} className="s-act s-green" testId="button-new-visit"><Plus /> {t('زيارة جديدة')}</Act>
        <Act id="/shelf-audit" onAct={go} className="s-act s-blue"><Camera /> {t('مراجعة الرف')}</Act>
        <Act id="/training" onAct={go} className="s-act" style={{ background: '#7C3AED', color: '#fff' }}><GraduationCap /> {t('أكاديمية التدريب')}</Act>
        <Act id="/orders" onAct={go} className="s-act" style={{ background: '#0F1B2D', color: '#fff' }}><ShoppingCart /> {t('الأوردرات')}</Act>
        <Act id="/beat-plan" onAct={go} className="s-act s-purple"><Route /> {t('خطة الزيارات')}</Act>
        {fieldSurveyAllowed && <Act id="/field-survey" onAct={go} className="s-act" style={{ background: 'var(--color-success)', color: '#fff' }}><ScanSearch /> {t('مسح ميداني')}</Act>}
      </div>
      <PageTitle>{t('آخر الزيارات')}</PageTitle>
      {L ? <div className="skel" style={{ height: 70 }} /> : d!.recent.length === 0
        ? <div className="card"><EmptyState icon={<ClipboardList />} title={t('لا توجد زيارات بعد')} action={{ label: t('بدء زيارة'), onClick: goNew }} /></div>
        : recent.map((v) => <Recent key={v.id} v={v} onOpen={open} />)}
    </>}
  </div>;
}

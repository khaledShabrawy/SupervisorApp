import { memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ClipboardList, MapPin, Plus, Route, Target as TargetIcon } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useRealtime } from '@/hooks/useRealtime';
import { canAdmin } from '@/lib/policy';
import { useScreenDashboard } from '@/lib/screen-data';
import type { VisitRow } from '@/lib/data';
import { KPICard } from '@/components/KPICard';
import { StatusBadge } from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { ErrorState } from '@/components/States';
import { PageTitle } from '@/components/Layout';
import { fmtDate, fmtTime, num, todayStr } from '@/lib/format';
import { Act, useRefetch } from './shared';

const Recent = memo(function Recent({ v, onOpen }: { v: VisitRow; onOpen: (id: string) => void }) {
  return <Act id={v.id} onAct={onOpen} className="s-row" testId={`row-recent-${v.id}`}>
    <div className="grow"><div className="title">{v.customers?.name ?? 'عميل'}</div><div className="muted">{fmtDate(v.visit_date)} · {fmtTime(v.check_in_time)}</div></div>
    <StatusBadge status={v.status} />
  </Act>;
});

export default function DashboardScreen() {
  const nav = useNavigate(); const { supervisor } = useAuth(); const settings = useAppSettings();
  const q = useScreenDashboard(); const d = q.data; const L = q.isPending;
  const admin = canAdmin(supervisor);
  const retry = useRefetch(q.refetch);
  useRealtime('visits', supervisor ? (admin ? `company_id=eq.${supervisor.company_id}` : `supervisor_id=eq.${supervisor.id}`) : undefined, retry);
  const go = useCallback((p: string) => nav(p), [nav]);
  const goNew = useCallback(() => nav('/visits/new'), [nav]);
  const open = useCallback(() => nav('/visits'), [nav]);
  const recent = useMemo(() => d?.recent.slice(0, 5) ?? [], [d?.recent]);
  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle>{settings.app_name}<span className="muted" style={{ fontSize: 14, fontWeight: 400 }}> · {fmtDate(todayStr())}</span></PageTitle>
    {q.isError ? <ErrorState error={q.error} onRetry={retry} /> : <>
      <div className="s-kpis">
        <KPICard icon={<MapPin size={18} />} title="زيارات اليوم" value={d && num(d.visits)} loading={L} />
        <KPICard icon={<Camera size={18} />} title="مراجعات الرف" value={d && num(d.audits)} loading={L} color="#6D3FC0" />
        <KPICard icon={<TargetIcon size={18} />} title="نسبة الهدف%" value={d && `${num(Math.round(d.visitsProgress))}%`} loading={L} color="var(--color-success)" />
      </div>
      <div className="s-acts">
        <Act id="/visits/new" onAct={go} className="s-act s-green" testId="button-new-visit"><Plus /> زيارة جديدة</Act>
        <Act id="/shelf-audit" onAct={go} className="s-act s-blue"><Camera /> مراجعة الرف</Act>
        <Act id="/beat-plan" onAct={go} className="s-act s-purple"><Route /> خطة البيت</Act>
      </div>
      <PageTitle>آخر الزيارات</PageTitle>
      {L ? <div className="skel" style={{ height: 70 }} /> : d!.recent.length === 0
        ? <div className="card"><EmptyState icon={<ClipboardList />} title="لا توجد زيارات بعد" action={{ label: 'بدء زيارة', onClick: goNew }} /></div>
        : recent.map((v) => <Recent key={v.id} v={v} onOpen={open} />)}
    </>}
  </div>;
}

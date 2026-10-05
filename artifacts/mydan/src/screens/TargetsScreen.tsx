import { memo, useMemo } from 'react';
import { Target as TargetIcon } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useMonthlyTargets, type MonthProgress } from '@/lib/screen-data';
import { PageTitle } from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import { ErrorState } from '@/components/States';
import { MONTHS, num } from '@/lib/format';
import { useRefetch } from './shared';

const year = (y: number) => num(y).replace(/[٬,]/g, '');
const cap = (p: number | null) => Math.min(100, Math.max(0, Math.round(p ?? 0)));

const pct = (a: number, t: number) => (t > 0 ? (a / t) * 100 : null);
const tone = (p: number | null) => p == null ? '#8A97A8' : p >= 80 ? 'var(--color-success)' : p >= 50 ? '#D99A06' : 'var(--color-danger)';
const fmtPct = (p: number | null) => p == null ? 'لا هدف' : `${num(Math.round(p))}%`;

const Card = memo(function Card({ label, actual, target, fmt }: { label: string; actual: number; target: number; fmt: (n: number) => string }) {
  const p = pct(actual, target);
  return <div className="card col" style={{ gap: 6 }} data-testid={`progress-${label}`}>
    <div className="row between"><span className="title">{label}</span><b style={{ color: tone(p) }}>{fmtPct(p)}</b></div>
    <div className="bar" role="progressbar" aria-label={label} aria-valuenow={cap(p)} aria-valuemin={0} aria-valuemax={100}><i className="s-fill" style={{ width: `${cap(p)}%`, ['--bc' as string]: tone(p) }} /></div>
    <div className="muted">{fmt(actual)} من {target > 0 ? fmt(target) : 'غير محدد'}</div>
  </div>;
});
const HistoryMetric = memo(function HistoryMetric({ label, percent, text }: { label: string; percent: number | null; text: string }) {
  return <div className="s-hbar"><span>{label}</span>
    <div className="bar" role="progressbar" aria-label={label} aria-valuenow={cap(percent)} aria-valuemin={0} aria-valuemax={100}><i className="s-fill" style={{ width: `${cap(percent)}%`, ['--bc' as string]: tone(percent) }} /></div>
    <span>{fmtPct(percent)}</span><span className="muted" style={{ gridColumn: '1 / -1', fontSize: 12 }}>{label}: {text}</span></div>;
});
const Month = memo(function Month({ r }: { r: MonthProgress }) {
  const rows = useMemo<[string, number | null, string][]>(() => [
    ['الزيارات', pct(r.actual_visits, r.visits_target), `${num(r.actual_visits)}/${num(r.visits_target)}`],
    ['مراجعات الرف', pct(r.actual_audits, r.audit_target), `${num(r.actual_audits)}/${num(r.audit_target)}`],
  ], [r]);
  return <div className="s-hist-m"><div className="title">{MONTHS[r.month - 1]} {year(r.year)}</div>
    {rows.map(([label, percent, text]) => <HistoryMetric key={label} label={label} percent={percent} text={text} />)}
  </div>;
});
export default function TargetsScreen() {
  const { supervisor } = useAuth(); const settings = useAppSettings();
  const q = useMonthlyTargets(); const retry = useRefetch(q.refetch);
  const cur = q.data?.[0]; const hist = useMemo(() => q.data?.slice(1) ?? [], [q.data]);
  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle>الأهداف{cur ? <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}> · {MONTHS[cur.month - 1]} {year(cur.year)}</span> : null}</PageTitle>
    {q.isPending ? <div className="skel" style={{ height: 200 }} /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : !cur ? <div className="card"><EmptyState icon={<TargetIcon />} title="لا أهداف" text="لم يتم تحديد أهداف بعد." /></div> : <>
        <Card label="الزيارات" actual={cur.actual_visits} target={cur.visits_target} fmt={num} />
        <Card label="مراجعات الرف" actual={cur.actual_audits} target={cur.audit_target} fmt={num} />
        <PageTitle>الأشهر السابقة</PageTitle>
        <div className="card s-hist">{hist.length === 0 ? <div className="muted">لا بيانات سابقة.</div> : hist.map((r) => <Month key={`${r.year}-${r.month}`} r={r} />)}</div>
        <p className="muted">الأشرطة تعرض الإنجاز حتى ١٠٠٪، وتظهر النسب الأعلى في الأرقام.</p>
      </>}
  </div>;
}

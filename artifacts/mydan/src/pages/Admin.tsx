import { ShieldCheck, UserCheck, Users } from '@/components/Icons';
import { useAdminSummary, useScope, useSupervisors, useUpdateSupervisor } from '@/lib/data';
import { PageTitle } from '@/components/Layout';
import { KPICard } from '@/components/KPICard';
import EmptyState from '@/components/EmptyState';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import { num } from '@/lib/format';

const ROLE: Record<string, string> = { admin: 'مدير', supervisor: 'مشرف', super_admin: 'مدير أعلى' };

export default function Admin() {
  const { supervisorId } = useScope(); const sum = useAdminSummary(); const q = useSupervisors(); const m = useUpdateSupervisor();
  return <div className="page">
    <PageTitle>إدارة الشركة</PageTitle>
    <div className="kpis">
      <KPICard icon={<Users size={18} />} title="إجمالي المشرفين" value={sum.data && num(sum.data.total)} loading={sum.isPending && !sum.isError} />
      <KPICard icon={<UserCheck size={18} />} title="النشطون" value={sum.data && num(sum.data.active)} loading={sum.isPending && !sum.isError} color="var(--color-success)" />
    </div>
    {sum.isError && <ErrorState error={sum.error} onRetry={() => void sum.refetch()} />}
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      : q.items.length === 0 ? <EmptyState icon={<Users />} title="لا يوجد مشرفون" />
      : <>{q.items.map((s) => { const locked = s.id === supervisorId || s.role === 'super_admin'; return <div key={s.id} className="card col" data-testid={`card-supervisor-${s.id}`}>
        <div className="row between"><div className="grow"><div className="title">{s.full_name}{s.id === supervisorId && ' (أنت)'}</div><div className="muted" dir="ltr" style={{ textAlign: 'start' }}>{s.phone ?? '—'}</div></div>
          <span className={`badge ${s.is_active ? 'b-green' : 'b-red'}`}>{s.is_active ? 'نشط' : 'معطل'}</span></div>
        <div className="row">
          <span className="badge b-gray row" style={{ gap: 4 }}><ShieldCheck size={14} />{ROLE[s.role]}</span>
          {!locked && <>
            <select className="input grow" aria-label="الدور" value={s.role} disabled={m.isPending} onChange={(e) => m.mutate({ target: s, patch: { role: e.target.value as 'admin' | 'supervisor' } })} data-testid={`select-role-${s.id}`}>
              <option value="supervisor">مشرف</option><option value="admin">مدير</option></select>
            <button className={`btn sm ${s.is_active ? 'danger-ghost' : 'success'}`} disabled={m.isPending} data-testid={`button-toggle-${s.id}`}
              onClick={() => { if (!s.is_active || window.confirm(`تعطيل حساب ${s.full_name}؟`)) m.mutate({ target: s, patch: { is_active: !s.is_active } }); }}>{s.is_active ? 'تعطيل' : 'تفعيل'}</button></>}
        </div>
      </div>; })}<LoadMore q={q} /></>}
  </div>;
}

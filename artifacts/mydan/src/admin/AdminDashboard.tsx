import { BarChart3, ClipboardList, Package, ShieldAlert, Users } from '@/components/Icons';
import KPICard from '@/components/KPICard';
import { ErrorState } from '@/components/States';
import { useAdminKpis } from '@/lib/admin-data';
import { num } from '@/lib/format';
import { useRefetch } from '@/screens/shared';
import { t } from '@/i18n';

export default function AdminDashboard() {
  const q = useAdminKpis(); const retry = useRefetch(q.refetch);
  const d = q.data; const loading = q.isPending;
  return <>
    <h2>{t('لوحة المؤشرات')}</h2>
    {q.isError ? <ErrorState error={q.error} onRetry={retry} /> : <div className="adm-kpis">
      <KPICard icon={<Users />} title={t('المشرفون النشطون')} value={d && num(d.supervisors)} loading={loading} />
      <KPICard icon={<ClipboardList />} title={t('زيارات اليوم')} value={d && num(d.visitsToday)} loading={loading} color="var(--color-success)" />
      <KPICard icon={<BarChart3 />} title={t('متوسط PSS (30 يوم)')} value={d ? (d.avgPss == null ? '—' : `${d.avgPss}%`) : undefined}
        hint={d ? t('{n} مراجعة مكتملة', { n: num(d.audits30d) }) : undefined} loading={loading} color="#6D3FC0" />
      <KPICard icon={<Package />} title={t('الأصول النشطة')} value={d && num(d.assets)} loading={loading} color="#C2570C" />
      <KPICard icon={<ShieldAlert />} title={t('تذاكر صيانة مفتوحة')} value={d && num(d.openTickets)} loading={loading} color="var(--color-danger)" />
    </div>}
  </>;
}

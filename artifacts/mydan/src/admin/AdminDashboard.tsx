import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Bell, ClipboardList, Package, ShieldAlert, ShieldCheck, Target, Users } from '@/components/Icons';
import KPICard from '@/components/KPICard';
import { ErrorState } from '@/components/States';
import { useAdminKpis, useBranches, useRegions, useAdminAlerts, type AdminAlertRow } from '@/lib/admin-data';
import { useSupervisors } from '@/lib/data';
import { fmtTime, num, todayStr } from '@/lib/format';
import { useRefetch } from '@/screens/shared';
import { t } from '@/i18n';

function TargetProgress({ target, achieved, label }: { target: number; achieved: number; label: string }) {
  const rate = target > 0 ? Math.round(achieved * 100 / target) : null;
  return <div className="target-progress">
    <div className="row between"><span>{label}</span><strong>{rate == null ? '—' : `${num(rate)}%`}</strong></div>
    {rate != null && <div className="progress-track" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, rate))}
      aria-valuetext={`${num(achieved)} / ${num(target)}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, rate))}%` }} />
    </div>}
    <div className="target-caption">{rate == null ? t('لم يُحدد مستهدف لهذه الفترة') :
      t('{achieved} من {target} · المتبقي {remaining}', { achieved: num(achieved), target: num(target), remaining: num(Math.max(0, target - achieved)) })}</div>
  </div>;
}

export default function AdminDashboard() {
  const nav = useNavigate();
  const regions = useRegions();
  const branches = useBranches();
  const sups = useSupervisors();

  const [dateFrom, setDateFrom] = useState(() => todayStr().slice(0, 8) + '01');
  const [dateTo, setDateTo] = useState(() => todayStr());
  const [regionId, setRegionId] = useState('all');
  const [branchId, setBranchId] = useState(() => { try { return localStorage.getItem('mydan_active_branch_id') || 'all'; } catch { return 'all'; } });
  const [supervisorId, setSupervisorId] = useState('all');

  // Cascading branches based on selected region
  const filteredBranches = useMemo(() => {
    const list = branches.data ?? [];
    if (regionId === 'all') return list;
    return list.filter((b) => b.region_id === regionId);
  }, [branches.data, regionId]);

  // Cascading supervisors based on selected branch/region
  const filteredSupervisors = useMemo(() => {
    let list = sups.items;
    if (branchId !== 'all') {
      return list.filter((s) => s.branch_id === branchId);
    }
    if (regionId !== 'all') {
      const bSet = new Set(filteredBranches.map((b) => b.id));
      return list.filter((s) => s.branch_id && bSet.has(s.branch_id));
    }
    return list;
  }, [sups.items, branchId, regionId, filteredBranches]);

  const alertsQ = useAdminAlerts();
  const alerts: AdminAlertRow[] = alertsQ.data ?? [];

  const q = useAdminKpis({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    regionId: regionId !== 'all' ? regionId : undefined,
    branchId: branchId !== 'all' ? branchId : undefined,
    supervisorId: supervisorId !== 'all' ? supervisorId : undefined,
  });

  const retry = useRefetch(q.refetch);
  const d = q.data;
  const loading = q.isPending;

  const setPreset = (type: 'today' | 'week' | 'month') => {
    const now = new Date();
    const today = todayStr();
    if (type === 'today') {
      setDateFrom(today);
      setDateTo(today);
    } else if (type === 'week') {
      const past = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
      setDateFrom(past);
      setDateTo(today);
    } else if (type === 'month') {
      setDateFrom(today.slice(0, 8) + '01');
      setDateTo(today);
    }
  };

  return (
    <div className="admin-overview">
      <div className="row between overview-heading" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2>{t('نظرة عامة على الميدان')}</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            {t('أداء فريقك والزيارات والمهام في مكان واحد.')}
          </p>
        </div>
      </div>

      {/* Cascading Filter Bar */}
      <div className="card col overview-filters">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Date range pickers */}
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>{t('من:')}</span>
            <input className="input" type="date" aria-label={t('بداية الفترة')} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ width: 140 }} />
          </div>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>{t('إلى:')}</span>
            <input className="input" type="date" aria-label={t('نهاية الفترة')} value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ width: 140 }} />
          </div>

          {/* Quick presets */}
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className="btn sm ghost" onClick={() => setPreset('today')}>{t('اليوم')}</button>
            <button type="button" className="btn sm ghost" onClick={() => setPreset('week')}>{t('أسبوع')}</button>
            <button type="button" className="btn sm ghost" onClick={() => setPreset('month')}>{t('شهر')}</button>
          </div>

          {/* Cascading Dropdowns */}
          <select className="input" aria-label={t('الإقليم')} style={{ width: 150 }} value={regionId} onChange={(e) => {
            setRegionId(e.target.value);
            setBranchId('all');
            setSupervisorId('all');
          }}>
            <option value="all">{t('كل الأقاليم')}</option>
            {regions.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <select className="input" aria-label={t('الفرع')} style={{ width: 150 }} value={branchId} onChange={(e) => {
            setBranchId(e.target.value);
            setSupervisorId('all');
          }}>
            <option value="all">{t('كل الفروع')}</option>
            {filteredBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <select className="input" aria-label={t('المستخدم')} style={{ width: 160 }} value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
            <option value="all">{t('كل المستخدمين')}</option>
            {filteredSupervisors.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>

          {(regionId !== 'all' || branchId !== 'all' || supervisorId !== 'all' || !dateFrom) && (
            <button className="btn sm ghost" onClick={() => {
              setRegionId('all');
              setBranchId('all');
              setSupervisorId('all');
              setPreset('month');
            }}>
              {t('إعادة ضبط')}
            </button>
          )}
        </div>
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={retry} />
      ) : (
        <>
          <section className="adm-kpis overview-kpis" aria-label={t('مؤشرات الفترة')}>
            <KPICard icon={<ClipboardList />} title={t('الزيارات في الفترة')} value={d && num(d.visitsToday)} loading={loading} />
            <KPICard icon={<Users />} title={t('المستخدمون النشطون')} value={d && num(d.supervisors)} loading={loading} />
            <KPICard icon={<ShieldCheck />} title={t('الالتزام بالنطاق الجغرافي')}
              value={d ? (d.geofenceRate == null ? '—' : `${num(d.geofenceRate)}%`) : undefined}
              hint={d && d.totalGeoVisits ? t('{n} داخل النطاق · {oor} خارج النطاق', { n: num(d.onBeatVisits), oor: num(d.oorVisits) }) : undefined} loading={loading} />
            <KPICard icon={<BarChart3 />} title={t('متوسط تقييم الرف')}
              value={d ? (d.avgPss == null ? '—' : `${num(d.avgPss)}%`) : undefined}
              hint={d ? t('{n} مراجعة مكتملة', { n: num(d.audits30d) }) : undefined} loading={loading} />
            <KPICard icon={<Package />} title={t('الأصول النشطة (الشركة)')} value={d && num(d.assets)} loading={loading} />
            <KPICard icon={<ShieldAlert />} title={t('تذاكر صيانة مفتوحة (الشركة)')} value={d && num(d.openTickets)} loading={loading} />
          </section>

          <div className="overview-insights">
            <section className="card overview-targets">
              <div className="section-heading"><span className="surface-icon"><Target size={20} /></span><div>
                <h3>{t('التقدم نحو المستهدف')}</h3><p>{t('المنجز مقابل الأهداف المسندة للفترة المختارة')}</p>
              </div></div>
              {loading ? <div className="skel" style={{ height: 130 }} /> : <>
                <TargetProgress label={t('الزيارات المكتملة')} target={d!.visitsTarget} achieved={d!.visitsAchieved} />
                <TargetProgress label={t('مراجعات الرف المكتملة')} target={d!.auditsTarget} achieved={d!.auditsAchieved} />
              </>}
              <button className="btn sm ghost" onClick={() => nav('/admin/targets')}>{t('إدارة الأهداف')}</button>
            </section>
            <section className="card overview-alerts" aria-label={t('مركز التنبيهات')}>
              <div className="section-heading"><span className="surface-icon"><Bell size={20} /></span><div>
                <h3>{t('مركز التنبيهات')}</h3><p>{t('آخر التنبيهات المتاحة لحسابك')}</p>
              </div></div>
              {alertsQ.isPending ? <div className="skel" style={{ height: 100 }} /> : alertsQ.isError ?
                <ErrorState error={alertsQ.error} onRetry={() => void alertsQ.refetch()} /> : alerts.length === 0 ?
                <div className="overview-empty"><ShieldCheck size={28} /><strong>{t('لا توجد تنبيهات متاحة')}</strong>
                  <span>{t('ستظهر هنا التنبيهات الواردة من العمليات الميدانية.')}</span></div> :
                <div className="overview-alert-list">{alerts.slice(0, 3).map(alert => <div key={alert.id} className="overview-alert-item">
                  <span className={`alert-indicator ${alert.is_read ? 'is-read' : ''}`} />
                  <strong>{alert.title_ar}</strong><time dateTime={alert.created_at}>{fmtTime(alert.created_at)}</time>
                </div>)}</div>}
              <button className="btn sm ghost" onClick={() => nav('/admin/notifications')}>{t('عرض كل التنبيهات')}</button>
            </section>
          </div>
          <div className="overview-footer-links">
            <button className="btn sm ghost" onClick={() => nav('/admin/shelf-share')}><BarChart3 size={17} />{t('تحليلات حصة الرف')}</button>
            <button className="btn sm ghost" onClick={() => nav('/admin/reports')}><ClipboardList size={17} />{t('التقارير المخصصة')}</button>
          </div>
        </>
      )}
    </div>
  );
}

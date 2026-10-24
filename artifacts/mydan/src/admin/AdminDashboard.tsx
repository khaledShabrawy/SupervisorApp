import { useMemo, useState } from 'react';
import { BarChart3, ClipboardList, Package, ShieldAlert, ShieldCheck, Target, Users } from '@/components/Icons';
import KPICard from '@/components/KPICard';
import { ErrorState } from '@/components/States';
import { useAdminKpis, useBranches, useRegions } from '@/lib/admin-data';
import { useSupervisors } from '@/lib/data';
import { num, todayStr } from '@/lib/format';
import { useRefetch } from '@/screens/shared';
import { t } from '@/i18n';

function TargetGaugeChart({
  target,
  achieved,
  rate,
  loading,
}: {
  target: number;
  achieved: number;
  rate: number;
  loading?: boolean;
}) {
  const clamped = Math.min(Math.max(rate, 0), 100);
  // Semicircle arc: radius 100, center (150, 130)
  // Angle in radians: Math.PI is left (0%), 2*Math.PI is right (100%)
  const angleRad = Math.PI + (clamped / 100) * Math.PI;
  const needleLength = 80;
  const tipX = 150 + needleLength * Math.cos(angleRad);
  const tipY = 130 + needleLength * Math.sin(angleRad);

  const arcColor = rate >= 80 ? '#10B981' : rate >= 50 ? '#F59E0B' : '#EF4444';
  const statusLabel = rate >= 80 ? t('🏆 تحقيق ممتاز') : rate >= 50 ? t('📈 تقدم جيد') : t('⚠️ يحتاج تكثيف');
  const statusClass = rate >= 80 ? 'b-green' : rate >= 50 ? 'b-amber' : 'b-red';

  // Arc length for 180 deg radius 100 is PI * 100 ≈ 314.16
  const totalArc = 314.16;
  const filledArc = (clamped / 100) * totalArc;

  const remaining = Math.max(0, target - achieved);

  return (
    <div className="card col" style={{ padding: 18, gap: 14, flex: '1 1 340px' }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Target size={18} /> {t('معدل تحقيق المستهدف (Target vs Achieved)')}
          </h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            {t('مقارنة التارجت المطلوب بالمحقق الفعلي للزيارات')}
          </p>
        </div>
        <span className={`badge ${statusClass}`} style={{ fontSize: 12, padding: '4px 10px' }}>
          {statusLabel}
        </span>
      </div>

      {loading ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="muted">{t('جاري الحساب...')}</span>
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', width: '100%', maxWidth: 300, margin: '0 auto', textAlign: 'center' }}>
            <svg viewBox="0 0 300 170" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
              <defs>
                <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="50%" stopColor="#F59E0B" />
                  <stop offset="80%" stopColor="#10B981" />
                </linearGradient>
              </defs>

              {/* Background Track */}
              <path
                d="M 50 130 A 100 100 0 0 1 250 130"
                fill="none"
                stroke="#E2E8F0"
                strokeWidth="16"
                strokeLinecap="round"
              />

              {/* Active Progress Arc */}
              <path
                d="M 50 130 A 100 100 0 0 1 250 130"
                fill="none"
                stroke={arcColor}
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={`${filledArc} ${totalArc}`}
                style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease' }}
              />

              {/* Ticks and percentage labels */}
              <text x="45" y="152" textAnchor="middle" fontSize="12" fill="#64748B" fontWeight="600">0%</text>
              <text x="150" y="24" textAnchor="middle" fontSize="12" fill="#64748B" fontWeight="600">50%</text>
              <text x="255" y="152" textAnchor="middle" fontSize="12" fill="#64748B" fontWeight="600">100%</text>

              {/* Needle */}
              <line
                x1="150"
                y1="130"
                x2={tipX}
                y2={tipY}
                stroke="#1E293B"
                strokeWidth="3.5"
                strokeLinecap="round"
                style={{ transition: 'all 0.6s ease' }}
              />
              <circle cx="150" cy="130" r="8" fill="#1E293B" />
              <circle cx="150" cy="130" r="3.5" fill="#FFFFFF" />
            </svg>

            {/* Readout in center below needle pivot */}
            <div style={{ marginTop: -15 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: arcColor, lineHeight: 1 }}>
                {rate}%
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {t('نسبة الإنجاز')}
              </div>
            </div>
          </div>

          {/* Breakdown Stats */}
          <div className="row between" style={{ background: 'var(--color-bg)', padding: '10px 14px', borderRadius: 8, marginTop: 4 }}>
            <div className="col" style={{ alignItems: 'center', flex: 1 }}>
              <span className="muted" style={{ fontSize: 11 }}>{t('المستهدف')}</span>
              <strong style={{ fontSize: 16 }}>{num(target)}</strong>
            </div>
            <div style={{ width: 1, height: 28, background: '#CBD5E1' }} />
            <div className="col" style={{ alignItems: 'center', flex: 1 }}>
              <span className="muted" style={{ fontSize: 11 }}>{t('المحقق')}</span>
              <strong style={{ fontSize: 16, color: arcColor }}>{num(achieved)}</strong>
            </div>
            <div style={{ width: 1, height: 28, background: '#CBD5E1' }} />
            <div className="col" style={{ alignItems: 'center', flex: 1 }}>
              <span className="muted" style={{ fontSize: 11 }}>{t('المتبقي')}</span>
              <strong style={{ fontSize: 16, color: remaining > 0 ? '#64748B' : '#10B981' }}>{num(remaining)}</strong>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminDashboard() {
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

  const setPreset = (type: 'today' | 'week' | 'month' | 'all') => {
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
    } else {
      setDateFrom('');
      setDateTo('');
    }
  };

  return (
    <>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2>{t('لوحة المؤشرات والتحليلات')}</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            {t('متابعة أداء الزيارات، الالتزام الجغرافي، وتحقيق التارجت الميداني.')}
          </p>
        </div>
      </div>

      {/* Cascading Filter Bar */}
      <div className="card col" style={{ marginTop: 12, padding: '12px 14px', gap: 10 }}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Date range pickers */}
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>{t('من:')}</span>
            <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ width: 140 }} />
          </div>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>{t('إلى:')}</span>
            <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ width: 140 }} />
          </div>

          {/* Quick presets */}
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className="btn sm ghost" onClick={() => setPreset('today')}>{t('اليوم')}</button>
            <button type="button" className="btn sm ghost" onClick={() => setPreset('week')}>{t('أسبوع')}</button>
            <button type="button" className="btn sm ghost" onClick={() => setPreset('month')}>{t('شهر')}</button>
            <button type="button" className="btn sm ghost" onClick={() => setPreset('all')}>{t('الكل')}</button>
          </div>

          {/* Cascading Dropdowns */}
          <select className="input" style={{ width: 150 }} value={regionId} onChange={(e) => {
            setRegionId(e.target.value);
            setBranchId('all');
            setSupervisorId('all');
          }}>
            <option value="all">{t('كل الأقاليم')}</option>
            {regions.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <select className="input" style={{ width: 150 }} value={branchId} onChange={(e) => {
            setBranchId(e.target.value);
            setSupervisorId('all');
          }}>
            <option value="all">{t('كل الفروع')}</option>
            {filteredBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <select className="input" style={{ width: 160 }} value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
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
          {/* Main Visual Row: Gauge Chart */}
          <div className="row" style={{ marginTop: 14, gap: 14, flexWrap: 'wrap', alignItems: 'stretch' }}>
            <TargetGaugeChart
              target={d?.visitsTarget ?? 0}
              achieved={d?.visitsAchieved ?? 0}
              rate={d?.achievementRate ?? 0}
              loading={loading}
            />
          </div>

          {/* KPI Summary Cards */}
          <div className="adm-kpis" style={{ marginTop: 14 }}>
            <KPICard icon={<Users />} title={t('المستخدمون النشطون')} value={d && num(d.supervisors)} loading={loading} />
            <KPICard icon={<ClipboardList />} title={t('الزيارات في الفترة')} value={d && num(d.visitsToday)} loading={loading} color="var(--color-success)" />
            <KPICard icon={<ShieldCheck />} title={t('الالتزام بالنطاق الجغرافي')} value={d ? (d.geofenceRate == null ? '—' : `${d.geofenceRate}%`) : undefined}
              hint={d && d.totalGeoVisits ? t('{n} داخل النطاق · {oor} خارج النطاق', { n: num(d.onBeatVisits), oor: num(d.oorVisits) }) : undefined} loading={loading} color="#0D9488" />
            <KPICard icon={<BarChart3 />} title={t('متوسط PSS')} value={d ? (d.avgPss == null ? '—' : `${d.avgPss}%`) : undefined}
              hint={d ? t('{n} مراجعة مكتملة', { n: num(d.audits30d) }) : undefined} loading={loading} color="#6D3FC0" />
            <KPICard icon={<Package />} title={t('الأصول النشطة')} value={d && num(d.assets)} loading={loading} color="#C2570C" />
            <KPICard icon={<ShieldAlert />} title={t('تذاكر صيانة مفتوحة')} value={d && num(d.openTickets)} loading={loading} color="var(--color-danger)" />
          </div>
        </>
      )}
    </>
  );
}

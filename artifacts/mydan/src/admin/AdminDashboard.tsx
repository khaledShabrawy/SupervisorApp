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
  // Semicircle arc: radius 96, center (150, 128)
  const angleRad = Math.PI + (clamped / 100) * Math.PI;
  const needleLength = 74;
  const tipX = 150 + needleLength * Math.cos(angleRad);
  const tipY = 128 + needleLength * Math.sin(angleRad);

  const arcColor = rate >= 80 ? '#059669' : rate >= 50 ? '#D97706' : '#DC2626';
  const statusLabel = target <= 0 ? t('لم يُحدد مستهدف') : rate >= 80 ? t('تحقيق ممتاز') : rate >= 50 ? t('تقدم جيد') : t('يحتاج تكثيف');
  const statusClass = target <= 0 ? 'b-gray' : rate >= 80 ? 'b-green' : rate >= 50 ? 'b-yellow' : 'b-red';

  const totalArc = Math.PI * 96;
  const filledArc = (clamped / 100) * totalArc;
  const remaining = Math.max(0, target - achieved);

  return (
    <div className="card adm-hub-card">
      <div className="row between" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Target size={17} color="#0F172A" />
            <span>{t('معدل تحقيق المستهدف (Target vs Achieved)')}</span>
          </h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
            {t('مقارنة التارجت المطلوب بالمحقق الفعلي للزيارات')}
          </p>
        </div>
        <span className={`badge ${statusClass}`} style={{ gap: 6, flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
          {statusLabel}
        </span>
      </div>

      {loading ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="muted">{t('جاري الحساب...')}</span>
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', width: '100%', maxWidth: 280, margin: '0 auto', textAlign: 'center' }}>
            <svg viewBox="0 0 300 162" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
              <path
                d="M 54 128 A 96 96 0 0 1 246 128"
                fill="none"
                stroke="#E2E8F0"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M 54 128 A 96 96 0 0 1 246 128"
                fill="none"
                stroke={arcColor}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${filledArc} ${totalArc}`}
                style={{ transition: 'stroke-dasharray 0.55s ease, stroke 0.35s ease' }}
              />

              <text x="54" y="152" textAnchor="middle" fontSize="11.5" fill="#64748B" fontWeight="600">0%</text>
              <text x="150" y="18" textAnchor="middle" fontSize="11.5" fill="#64748B" fontWeight="600">50%</text>
              <text x="246" y="152" textAnchor="middle" fontSize="11.5" fill="#64748B" fontWeight="600">100%</text>

              <line
                x1="150"
                y1="128"
                x2={tipX}
                y2={tipY}
                stroke="#0F172A"
                strokeWidth="3"
                strokeLinecap="round"
                style={{ transition: 'all 0.55s ease' }}
              />
              <circle cx="150" cy="128" r="7" fill="#0F172A" />
              <circle cx="150" cy="128" r="3" fill="#FFFFFF" />
            </svg>

            <div style={{ marginTop: -12 }}>
              <div style={{ fontSize: 30, fontWeight: 700, color: arcColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {num(rate)}%
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {t('نسبة الإنجاز')}
              </div>
            </div>
          </div>

          <div
            className="row between"
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              padding: '10px 12px',
              borderRadius: 10,
              marginTop: 'auto',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <div className="col" style={{ alignItems: 'center', flex: 1 }}>
              <span className="muted" style={{ fontSize: 11.5 }}>{t('المستهدف')}</span>
              <strong style={{ fontSize: 15.5, color: '#0F172A' }}>{num(target)}</strong>
            </div>
            <div style={{ width: 1, height: 28, background: '#E2E8F0' }} />
            <div className="col" style={{ alignItems: 'center', flex: 1 }}>
              <span className="muted" style={{ fontSize: 11.5 }}>{t('المحقق')}</span>
              <strong style={{ fontSize: 15.5, color: arcColor }}>{num(achieved)}</strong>
            </div>
            <div style={{ width: 1, height: 28, background: '#E2E8F0' }} />
            <div className="col" style={{ alignItems: 'center', flex: 1 }}>
              <span className="muted" style={{ fontSize: 11.5 }}>{t('المتبقي')}</span>
              <strong style={{ fontSize: 15.5, color: remaining > 0 ? '#475569' : '#059669' }}>{num(remaining)}</strong>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const nav = useNavigate();
  const regions = useRegions();
  const branches = useBranches();
  const sups = useSupervisors();

  const [dateFrom, setDateFrom] = useState(() => todayStr().slice(0, 8) + '01');
  const [dateTo, setDateTo] = useState(() => todayStr());
  const [preset, setPreset] = useState<'today' | 'week' | 'month' | 'all' | 'custom'>('month');
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
    const list = sups.items;
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
  const unreadAlerts = alerts.filter((a) => !a.is_read).length;

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

  const applyPreset = (type: 'today' | 'week' | 'month' | 'all') => {
    const now = new Date();
    const today = todayStr();
    setPreset(type);
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

      {/* Cascading Filter Toolbar */}
      <div className="adm-filter-bar">
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>{t('من:')}</span>
          <input
            className="input"
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPreset('custom'); }}
            style={{ width: 142 }}
          />
        </div>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>{t('إلى:')}</span>
          <input
            className="input"
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPreset('custom'); }}
            style={{ width: 142 }}
          />
        </div>

        <div className="adm-seg" role="group" aria-label={t('الفترة')}>
          <button type="button" className={preset === 'today' ? 'active' : ''} onClick={() => applyPreset('today')}>{t('اليوم')}</button>
          <button type="button" className={preset === 'week' ? 'active' : ''} onClick={() => applyPreset('week')}>{t('أسبوع')}</button>
          <button type="button" className={preset === 'month' ? 'active' : ''} onClick={() => applyPreset('month')}>{t('شهر')}</button>
          <button type="button" className={preset === 'all' ? 'active' : ''} onClick={() => applyPreset('all')}>{t('الكل')}</button>
        </div>

        <select className="input" style={{ width: 150 }} value={regionId} onChange={(e) => {
          setRegionId(e.target.value);
          setBranchId('all');
          setSupervisorId('all');
        }}>
          <option value="all">{t('كل الأقاليم')}</option>
          {regions.data?.map((r) => <option key={r.id} value={r.id}>{r.name_en && t('كل الأقاليم') !== 'كل الأقاليم' ? r.name_en : t(r.name)}</option>)}
        </select>

        <select className="input" style={{ width: 150 }} value={branchId} onChange={(e) => {
          setBranchId(e.target.value);
          setSupervisorId('all');
        }}>
          <option value="all">{t('كل الفروع')}</option>
          {filteredBranches.map((b) => <option key={b.id} value={b.id}>{t(b.name)}</option>)}
        </select>

        <select className="input" style={{ width: 165 }} value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
          <option value="all">{t('كل المستخدمين')}</option>
          {filteredSupervisors.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>

        {(regionId !== 'all' || branchId !== 'all' || supervisorId !== 'all' || preset !== 'month') && (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => {
              setRegionId('all');
              setBranchId('all');
              setSupervisorId('all');
              applyPreset('month');
            }}
          >
            {t('إعادة ضبط')}
          </button>
        )}
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={retry} />
      ) : (
        <>
          {/* Overview Row: Gauge Chart + Shelf Share Hub + Field Alerts */}
          <div className="adm-overview-grid">
            <TargetGaugeChart
              target={d?.visitsTarget ?? 0}
              achieved={d?.visitsAchieved ?? 0}
              rate={d?.achievementRate ?? 0}
              loading={loading}
            />

            {/* Shelf & Market Operations Hub */}
            <div className="card adm-hub-card">
              <div>
                <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <BarChart3 size={17} color="#0369A1" />
                  <span>{t('تدقيق الحضور الرفي وحصة السوق')}</span>
                </h3>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
                  {t('مؤشرات أداء العرض الميداني والمتاجر النموذجية ورصد المنافسين')}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div style={{ padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="muted" style={{ fontSize: 12 }}>{t('نسبة المطابقة')}</span>
                  <strong style={{ fontSize: 22, color: '#0369A1', fontVariantNumeric: 'tabular-nums' }}>
                    {d?.avgPss != null ? `${num(d.avgPss)}%` : '—'}
                  </strong>
                </div>

                <div style={{ padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="muted" style={{ fontSize: 12 }}>{t('الالتزام الجغرافي')}</span>
                  <strong style={{ fontSize: 22, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                    {d?.geofenceRate != null ? `${num(d.geofenceRate)}%` : '—'}
                  </strong>
                </div>
              </div>

              <div className="adm-hub-foot">
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => nav('/admin/shelf-share')}
                  style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <BarChart3 size={15} />
                  <span>{t('عرض تحليلات حصة الرف التفصيلية')}</span>
                </button>
              </div>
            </div>

            {/* Live Operations & Alerts Radar */}
            <div className="card adm-hub-card">
              <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <ShieldAlert size={17} color="#B45309" />
                    <span>{t('التنبيهات الميدانية')}</span>
                  </h3>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
                    {t('رصد فوري لخروج النطاق الميداني ونواقص الرف')}
                  </p>
                </div>
                {unreadAlerts > 0 && (
                  <span className="badge b-red" style={{ flexShrink: 0 }}>
                    {num(unreadAlerts)} {t('جديد')}
                  </span>
                )}
              </div>

              {alerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '18px 0', color: '#059669', fontSize: 13 }}>
                  <ShieldCheck size={26} style={{ margin: '0 auto 6px' }} />
                  <div>{t('لا توجد تنبيهات مسجلة في الفترة المحددة')}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {alerts.slice(0, 3).map((a) => {
                    const critical = a.type === 'oos_critical';
                    return (
                      <div
                        key={a.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '8px 10px',
                          background: critical ? '#FEF2F2' : '#FFFBEB',
                          border: `1px solid ${critical ? '#FECACA' : '#FDE68A'}`,
                          borderRadius: 8,
                          fontSize: 12.5,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: critical ? '#DC2626' : '#D97706' }} />
                          <span dir="auto" style={{ fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {t(a.title_ar)}
                          </span>
                        </div>
                        <span className="muted" style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          {fmtTime(a.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="adm-hub-foot">
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => nav('/admin/notifications')}
                  style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Bell size={15} />
                  <span>{t('فتح مركز التنبيهات والإشعارات')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Executive 3x2 KPI Summary Grid */}
          <div className="adm-kpis">
            <KPICard icon={<Users />} title={t('المستخدمون النشطون')} value={d && num(d.supervisors)} loading={loading} onClick={() => nav('/admin/users')} />
            <KPICard icon={<ClipboardList />} title={t('الزيارات في الفترة')} value={d && num(d.visitsToday)} loading={loading} color="#059669" onClick={() => nav('/admin/reports')} />
            <KPICard icon={<ShieldCheck />} title={t('الالتزام الجغرافي')} value={d ? (d.geofenceRate == null ? '—' : `${d.geofenceRate}%`) : undefined}
              hint={d && d.totalGeoVisits ? t('{n} داخل النطاق · {oor} خارج النطاق', { n: num(d.onBeatVisits), oor: num(d.oorVisits) }) : undefined} loading={loading} color="#0D9488" onClick={() => nav('/admin/live-map')} />
            <KPICard icon={<BarChart3 />} title={t('نسبة المطابقة')} value={d ? (d.avgPss == null ? '—' : `${d.avgPss}%`) : undefined}
              hint={d ? t('{n} تدقيق رف مكتمل', { n: num(d.audits30d) }) : undefined} loading={loading} color="#0369A1" onClick={() => nav('/admin/shelf-share')} />
            <KPICard icon={<Package />} title={t('الأصول النشطة')} value={d && num(d.assets)} loading={loading} color="#B45309" onClick={() => nav('/admin/assets')} />
            <KPICard icon={<ShieldAlert />} title={t('تذاكر صيانة مفتوحة')} value={d && num(d.openTickets)} loading={loading} color="#DC2626" onClick={() => nav('/admin/assets')} />
          </div>
        </>
      )}
    </>
  );
}

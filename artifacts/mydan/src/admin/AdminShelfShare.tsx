import { memo, useMemo, useState, useCallback } from 'react';
import {
  Camera, Eye, Download, Search, Filter,
  CheckCircle2, BarChart3, X, Award
} from '@/components/Icons';
import {
  useAdminShelfAudits,
  useBranches,
  type AdminShelfAuditRow
} from '@/lib/admin-data';
import { useSupervisors } from '@/lib/data';
import { fmtDate, fmtTime, num } from '@/lib/format';
import { SkeletonList, ErrorState } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import { t } from '@/i18n';

export default function AdminShelfShare() {
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activePhoto, setActivePhoto] = useState<AdminShelfAuditRow | null>(null);

  const branches = useBranches();
  const supervisors = useSupervisors();

  const allSupervisors = useMemo(() => {
    return (supervisors.data?.pages?.flatMap((p: any) => p) ?? []) as any[];
  }, [supervisors.data]);

  const filteredSupervisors = useMemo(() => {
    if (!selectedBranch) return allSupervisors;
    return allSupervisors.filter((s: any) => s.branch_id === selectedBranch);
  }, [allSupervisors, selectedBranch]);

  const { data: audits, isLoading, isError, error, refetch } = useAdminShelfAudits({
    branchId: selectedBranch || undefined,
    supervisorId: selectedSupervisor || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const filteredAudits = useMemo(() => {
    if (!audits) return [];
    if (!searchTerm.trim()) return audits;
    const term = searchTerm.trim().toLowerCase();
    return audits.filter((a) =>
      a.supervisor_name?.toLowerCase().includes(term) ||
      a.customer_name?.toLowerCase().includes(term) ||
      a.supervisor_code?.toLowerCase().includes(term) ||
      a.audit_summary_ar?.toLowerCase().includes(term)
    );
  }, [audits, searchTerm]);

  // Summary Metrics
  const stats = useMemo(() => {
    if (!filteredAudits || filteredAudits.length === 0) {
      return { total: 0, avgShare: 0, avgScore: 0 };
    }
    const total = filteredAudits.length;
    const withShare = filteredAudits.filter((a) => a.shelf_share_pct != null);
    const avgShare = withShare.length > 0
      ? Math.round(withShare.reduce((acc, a) => acc + (a.shelf_share_pct ?? 0), 0) / withShare.length)
      : 0;
    const withScore = filteredAudits.filter((a) => a.audit_score != null);
    const avgScore = withScore.length > 0
      ? Math.round(withScore.reduce((acc, a) => acc + (a.audit_score ?? 0), 0) / withScore.length)
      : 0;
    return { total, avgShare, avgScore };
  }, [filteredAudits]);

  const exportExcel = useCallback(() => {
    if (!filteredAudits || filteredAudits.length === 0) return;
    const headers = [
      t('التاريخ'),
      t('الوقت'),
      t('المشرف'),
      t('كود المشرف'),
      t('العميل'),
      t('الفرع'),
      t('حصتنا (وجهات)'),
      t('المنافس (وجهات)'),
      t('حصة العرض') + ' %',
      t('تقييم الرف'),
      t('ملخص الذكاء الاصطناعي'),
    ];
    const rows = filteredAudits.map((a) => [
      a.audited_at ? fmtDate(a.audited_at) : (a.created_at ? fmtDate(a.created_at) : '—'),
      a.audited_at ? fmtTime(a.audited_at) : '—',
      `"${(a.supervisor_name || '').replace(/"/g, '""')}"`,
      `"${(a.supervisor_code || '').replace(/"/g, '""')}"`,
      `"${(a.customer_name || '').replace(/"/g, '""')}"`,
      `"${(a.branch_name || '').replace(/"/g, '""')}"`,
      a.our_facings ?? 0,
      a.competitor_facings ?? 0,
      a.shelf_share_pct != null ? `${a.shelf_share_pct}%` : '—',
      a.audit_score != null ? `${a.audit_score}%` : '—',
      `"${(a.audit_summary_ar || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shelf-share-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredAudits]);

  return (
    <div className="adm-page" style={{ padding: '24px 20px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Title & Action Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={24} color="#2563EB" /> {t('حصة الرف')}
          </h2>
          <p style={{ margin: 0, fontSize: 13.5, color: '#64748B' }}>
            {t('مراجعة صور الرفوف، رصد حصة منتجات الشركة مقابل المنافسين، وتحليلات الذكاء الاصطناعي.')}
          </p>
        </div>
        <button
          className="btn ghost sm"
          onClick={exportExcel}
          disabled={!filteredAudits || filteredAudits.length === 0}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Download size={16} /> {t('تصدير تدقيق الرف إلى Excel')}
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: '16px 20px', borderRight: '4px solid #3B82F6', borderRadius: 12 }}>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 6 }}>{t('إجمالي عمليات التدقيق')}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#1E293B' }}>{num(stats.total)}</div>
        </div>
        <div className="card" style={{ padding: '16px 20px', borderRight: '4px solid #10B981', borderRadius: 12 }}>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 6 }}>{t('متوسط حصة الرف')}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#059669' }}>{num(stats.avgShare)}%</div>
        </div>
        <div className="card" style={{ padding: '16px 20px', borderRight: '4px solid #8B5CF6', borderRadius: 12 }}>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 6 }}>{t('متوسط تقييم الرف')}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#7C3AED' }}>{num(stats.avgScore)}%</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card" style={{ padding: 16, marginBottom: 20, borderRadius: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {/* Search Input */}
          <div style={{ flex: '1 1 200px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              type="text"
              className="input"
              placeholder={t('بحث بالعميل أو المشرف...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', paddingRight: 36 }}
            />
          </div>

          {/* Branch Filter */}
          <div style={{ flex: '0 1 180px' }}>
            <select
              className="input"
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setSelectedSupervisor('');
              }}
              style={{ width: '100%' }}
            >
              <option value="">{t('كل الفروع')}</option>
              {branches.data?.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Supervisor Filter */}
          <div style={{ flex: '0 1 180px' }}>
            <select
              className="input"
              value={selectedSupervisor}
              onChange={(e) => setSelectedSupervisor(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">{t('كل المشرفين')}</option>
              {filteredSupervisors.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} {s.supervisor_code ? `(${s.supervisor_code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div style={{ flex: '0 1 150px' }}>
            <input
              type="date"
              className="input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ width: '100%' }}
              title={t('من تاريخ')}
            />
          </div>

          {/* Date To */}
          <div style={{ flex: '0 1 150px' }}>
            <input
              type="date"
              className="input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ width: '100%' }}
              title={t('إلى تاريخ')}
            />
          </div>

          {/* Clear Filters */}
          {(selectedBranch || selectedSupervisor || dateFrom || dateTo || searchTerm) && (
            <button
              className="btn sm ghost"
              onClick={() => {
                setSelectedBranch('');
                setSelectedSupervisor('');
                setDateFrom('');
                setDateTo('');
                setSearchTerm('');
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <X size={14} /> {t('مسح الفلاتر')}
            </button>
          )}
        </div>
      </div>

      {/* Audits Table */}
      {isLoading ? (
        <SkeletonList n={5} />
      ) : isError ? (
        <ErrorState error={error as Error} onRetry={() => refetch()} />
      ) : filteredAudits.length === 0 ? (
        <EmptyState
          icon={<Camera size={48} color="#94A3B8" />}
          title={t('لا توجد عمليات تدقيق رف مسجلة')}
          text={t('عمليات تدقيق الرف التي يسجلها المشرفون في زياراتهم ستظهر هنا تلقائياً.')}
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 12 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px' }}>{t('التاريخ')}</th>
                  <th style={{ padding: '12px 16px' }}>{t('المشرف')}</th>
                  <th style={{ padding: '12px 16px' }}>{t('العميل')}</th>
                  <th style={{ padding: '12px 16px' }}>{t('حصتنا (وجهات)')}</th>
                  <th style={{ padding: '12px 16px' }}>{t('المنافس (وجهات)')}</th>
                  <th style={{ padding: '12px 16px' }}>{t('حصة العرض')}</th>
                  <th style={{ padding: '12px 16px' }}>{t('تقييم الرف')}</th>
                  <th style={{ padding: '12px 16px' }}>{t('صورة الرف')}</th>
                  <th style={{ padding: '12px 16px' }}>{t('ملخص الذكاء الاصطناعي')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudits.map((audit) => (
                  <tr
                    key={audit.id}
                    style={{ borderBottom: '1px solid #F1F5F9', transition: 'background-color 0.15s ease' }}
                  >
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600, color: '#0F172A' }}>
                        {audit.audited_at ? fmtDate(audit.audited_at) : (audit.created_at ? fmtDate(audit.created_at) : '—')}
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>
                        {audit.audited_at ? fmtTime(audit.audited_at) : ''}
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {audit.supervisor_code && (
                          <span className="badge b-blue" style={{ fontFamily: 'monospace', fontSize: 10.5, padding: '1px 5px' }}>
                            {audit.supervisor_code}
                          </span>
                        )}
                        <span>{audit.supervisor_name}</span>
                      </div>
                      {audit.branch_name && (
                        <div style={{ fontSize: 11.5, color: '#64748B' }}>{audit.branch_name}</div>
                      )}
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#1E293B' }}>{audit.customer_name}</div>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge b-green" style={{ fontSize: 12 }}>
                        {num(audit.our_facings ?? 0)}
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge b-gray" style={{ fontSize: 12 }}>
                        {num(audit.competitor_facings ?? 0)}
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      {audit.shelf_share_pct != null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 48, height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${Math.min(100, audit.shelf_share_pct)}%`,
                                height: '100%',
                                background: audit.shelf_share_pct >= 50 ? '#10B981' : audit.shelf_share_pct >= 30 ? '#F59E0B' : '#EF4444',
                              }}
                            />
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 12.5 }}>{audit.shelf_share_pct}%</span>
                        </div>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      {audit.audit_score != null ? (
                        <span
                          className={`badge ${
                            audit.audit_score >= 80 ? 'b-green' : audit.audit_score >= 50 ? 'b-yellow' : 'b-red'
                          }`}
                          style={{ fontSize: 12 }}
                        >
                          {audit.audit_score}%
                        </span>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      {audit.signed_photo_url ? (
                        <div
                          onClick={() => setActivePhoto(audit)}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 8,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            position: 'relative',
                            border: '1px solid #CBD5E1',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          }}
                          title={t('عرض الصورة')}
                        >
                          <img
                            src={audit.signed_photo_url}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'rgba(0,0,0,0.25)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                            }}
                          >
                            <Eye size={16} />
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#CBD5E1' }}><Camera size={20} /></span>
                      )}
                    </td>

                    <td style={{ padding: '12px 16px', maxWidth: 260 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12.5,
                          color: '#475569',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={audit.audit_summary_ar || ''}
                      >
                        {audit.audit_summary_ar || '—'}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Photo & Report Modal */}
      {activePhoto && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setActivePhoto(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: 640,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: 16,
              padding: 20,
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setActivePhoto(null)}
              className="btn sm ghost"
              style={{ position: 'absolute', left: 16, top: 16, padding: '4px 8px' }}
            >
              <X size={18} />
            </button>

            <h3 style={{ margin: '0 0 12px', fontSize: 18, color: '#0F172A' }}>
              {t('تفاصيل تدقيق الرف')} · {activePhoto.customer_name}
            </h3>

            {activePhoto.signed_photo_url && (
              <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 16, background: '#0F172A' }}>
                <img
                  src={activePhoto.signed_photo_url}
                  alt=""
                  style={{ width: '100%', maxHeight: 360, objectFit: 'contain', display: 'block' }}
                />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <div className="card" style={{ padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>{t('حصتنا')}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>{num(activePhoto.our_facings ?? 0)}</div>
              </div>
              <div className="card" style={{ padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>{t('المنافس')}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#64748B' }}>{num(activePhoto.competitor_facings ?? 0)}</div>
              </div>
              <div className="card" style={{ padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>{t('حصة العرض')}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB' }}>
                  {activePhoto.shelf_share_pct != null ? `${activePhoto.shelf_share_pct}%` : '—'}
                </div>
              </div>
            </div>

            {activePhoto.audit_summary_ar && (
              <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 10, marginBottom: 12 }}>
                <strong style={{ fontSize: 13, color: '#1E293B', display: 'block', marginBottom: 4 }}>
                  {t('ملخص الذكاء الاصطناعي')}:
                </strong>
                <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                  {activePhoto.audit_summary_ar}
                </p>
              </div>
            )}

            {/* AI Issues & Recommendations if available */}
            {activePhoto.ai_detailed_report?.issues?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <strong style={{ fontSize: 12.5, color: '#DC2626', display: 'block', marginBottom: 4 }}>
                  ⚠️ {t('الملاحظات والسلبيات')}:
                </strong>
                <ul style={{ margin: 0, paddingRight: 20, fontSize: 12.5, color: '#475569' }}>
                  {activePhoto.ai_detailed_report.issues.map((iss: string, idx: number) => (
                    <li key={idx}>{iss}</li>
                  ))}
                </ul>
              </div>
            )}

            {activePhoto.ai_detailed_report?.recommendations?.length > 0 && (
              <div>
                <strong style={{ fontSize: 12.5, color: '#059669', display: 'block', marginBottom: 4 }}>
                  💡 {t('التوصيات المقترحة')}:
                </strong>
                <ul style={{ margin: 0, paddingRight: 20, fontSize: 12.5, color: '#475569' }}>
                  {activePhoto.ai_detailed_report.recommendations.map((rec: string, idx: number) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

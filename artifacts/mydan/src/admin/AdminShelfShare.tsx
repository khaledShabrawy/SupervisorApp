import { memo, useMemo, useState, useCallback } from 'react';
import {
  Camera, Eye, Download, Search, Filter,
  CheckCircle2, BarChart3, X, Award, AlertTriangle, AlertCircle, Target, Package, MapPin
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

type TierFilter = 'all' | 'perfect' | 'good' | 'needs_imp' | 'poor';
type ViewMode = 'analytics' | 'table';

export default function AdminShelfShare() {
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('analytics');
  const [activePhoto, setActivePhoto] = useState<AdminShelfAuditRow | null>(null);

  const branches = useBranches();
  const supervisors = useSupervisors();

  const allSupervisors = useMemo(() => {
    if (supervisors.items && supervisors.items.length > 0) return supervisors.items;
    return (supervisors.data?.pages?.flatMap((p: any) => p) ?? []) as any[];
  }, [supervisors.items, supervisors.data]);

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

  // Filtered by Search & Rating Tier
  const filteredAudits = useMemo(() => {
    if (!audits) return [];
    let list = audits;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      list = list.filter((a) =>
        a.supervisor_name?.toLowerCase().includes(term) ||
        a.customer_name?.toLowerCase().includes(term) ||
        a.supervisor_code?.toLowerCase().includes(term) ||
        a.audit_summary_ar?.toLowerCase().includes(term) ||
        a.branch_name?.toLowerCase().includes(term)
      );
    }

    // Rating tier filter
    if (tierFilter !== 'all') {
      list = list.filter((a) => {
        const score = a.audit_score ?? 0;
        if (tierFilter === 'perfect') return score >= 80;
        if (tierFilter === 'good') return score >= 65 && score < 80;
        if (tierFilter === 'needs_imp') return score >= 45 && score < 65;
        if (tierFilter === 'poor') return score < 45;
        return true;
      });
    }

    return list;
  }, [audits, searchTerm, tierFilter]);

  // Executive KPI Summary
  const stats = useMemo(() => {
    const list = audits ?? [];
    const total = list.length;
    if (total === 0) {
      return {
        total: 0,
        avgShare: 0,
        avgScore: 0,
        ourFacingsTotal: 0,
        compFacingsTotal: 0,
        avgFacingsPerStore: 0,
        oosAuditsCount: 0,
        oosRate: 0,
        perfectCount: 0,
        perfectRate: 0,
        goodCount: 0,
        needsImpCount: 0,
        poorCount: 0,
      };
    }

    const withShare = list.filter((a) => a.shelf_share_pct != null);
    const avgShare = withShare.length > 0
      ? Math.round(withShare.reduce((acc, a) => acc + (a.shelf_share_pct ?? 0), 0) / withShare.length)
      : 0;

    const withScore = list.filter((a) => a.audit_score != null);
    const avgScore = withScore.length > 0
      ? Math.round(withScore.reduce((acc, a) => acc + (a.audit_score ?? 0), 0) / withScore.length)
      : 0;

    const ourFacingsTotal = list.reduce((acc, a) => acc + (a.our_facings ?? 0), 0);
    const compFacingsTotal = list.reduce((acc, a) => acc + (a.competitor_facings ?? 0), 0);
    const avgFacingsPerStore = Math.round((ourFacingsTotal / total) * 10) / 10;

    let oosAuditsCount = 0;
    let perfectCount = 0;
    let goodCount = 0;
    let needsImpCount = 0;
    let poorCount = 0;

    for (const a of list) {
      const score = a.audit_score ?? 0;
      if (score >= 80) perfectCount++;
      else if (score >= 65) goodCount++;
      else if (score >= 45) needsImpCount++;
      else poorCount++;

      const oos = a.ai_detailed_report?.out_of_stock_items
        || a.ai_detailed_report?.target_brand_metrics?.oos_items
        || [];
      if (Array.isArray(oos) && oos.length > 0) {
        oosAuditsCount++;
      }
    }

    const oosRate = Math.round((oosAuditsCount / total) * 100);
    const perfectRate = Math.round((perfectCount / total) * 100);

    return {
      total,
      avgShare,
      avgScore,
      ourFacingsTotal,
      compFacingsTotal,
      avgFacingsPerStore,
      oosAuditsCount,
      oosRate,
      perfectCount,
      perfectRate,
      goodCount,
      needsImpCount,
      poorCount,
    };
  }, [audits]);

  // Branch Performance Breakdown
  const branchBreakdown = useMemo(() => {
    const map = new Map<string, { branchName: string; totalAudits: number; ourFacings: number; compFacings: number; shareSum: number; shareCount: number }>();
    for (const a of audits ?? []) {
      const bName = a.branch_name || t('بدون فرع');
      const cur = map.get(bName) || { branchName: bName, totalAudits: 0, ourFacings: 0, compFacings: 0, shareSum: 0, shareCount: 0 };
      cur.totalAudits += 1;
      cur.ourFacings += a.our_facings ?? 0;
      cur.compFacings += a.competitor_facings ?? 0;
      if (a.shelf_share_pct != null) {
        cur.shareSum += a.shelf_share_pct;
        cur.shareCount += 1;
      }
      map.set(bName, cur);
    }
    return Array.from(map.values()).map((b) => ({
      ...b,
      avgShare: b.shareCount > 0 ? Math.round(b.shareSum / b.shareCount) : 0,
    })).sort((a, b) => b.avgShare - a.avgShare);
  }, [audits]);

  // Top Out-of-Stock SKUs Aggregation
  const topOosItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of filteredAudits) {
      const items: string[] = a.ai_detailed_report?.out_of_stock_items
        || a.ai_detailed_report?.target_brand_metrics?.oos_items
        || [];
      for (const item of items) {
        const clean = typeof item === 'string' ? item.trim() : '';
        if (clean) counts.set(clean, (counts.get(clean) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({
        name,
        count,
        pct: filteredAudits.length > 0 ? Math.round((count / filteredAudits.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filteredAudits]);

  // Top Competitor Brands Breakdown
  const topCompetitors = useMemo(() => {
    const map = new Map<string, { brandName: string; facings: number; count: number }>();
    for (const a of filteredAudits) {
      const comps: Array<{ brand_name: string; facings?: number }> = a.ai_detailed_report?.competitors_metrics || [];
      for (const c of comps) {
        const bName = typeof c.brand_name === 'string' ? c.brand_name.trim() : '';
        if (!bName) continue;
        const cur = map.get(bName) || { brandName: bName, facings: 0, count: 0 };
        cur.facings += Number(c.facings) || 0;
        cur.count += 1;
        map.set(bName, cur);
      }
    }
    const list = Array.from(map.values()).sort((a, b) => b.facings - a.facings);
    const totalFacings = list.reduce((sum, c) => sum + c.facings, 0);
    return list.slice(0, 6).map((c) => ({
      ...c,
      sharePct: totalFacings > 0 ? Math.round((c.facings / totalFacings) * 100) : 0,
    }));
  }, [filteredAudits]);

  // Export Executive FMCG CSV
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
      t('حالة المتجر النموذجي'),
      t('الأصناف الناقصة'),
      t('ملخص الذكاء الاصطناعي'),
    ];
    const rows = filteredAudits.map((a) => {
      const score = a.audit_score ?? 0;
      const status = score >= 80 ? t('متجر نموذجي') : score >= 65 ? t('عرض تجاري جيد') : score >= 45 ? t('يحتاج تحسينات') : t('أداء ضعيف');
      const oos = (a.ai_detailed_report?.out_of_stock_items || a.ai_detailed_report?.target_brand_metrics?.oos_items || []).join(' | ');

      return [
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
        `"${status}"`,
        `"${oos.replace(/"/g, '""')}"`,
        `"${(a.audit_summary_ar || '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `executive-shelf-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredAudits]);

  return (
    <div className="adm-page" style={{ padding: '24px 20px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Title & View Mode Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={24} color="#2563EB" /> {t('حصة الرف')}
          </h2>
          <p style={{ margin: 0, fontSize: 13.5, color: '#64748B' }}>
            {t('مراجعة صور الرفوف، رصد حصة منتجات الشركة مقابل المنافسين، وتحليلات الذكاء الاصطناعي.')}
          </p>
        </div>

        {/* View Mode Toggle & Export Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: '#F1F5F9', padding: 3, borderRadius: 10, border: '1px solid #E2E8F0' }}>
            <button
              type="button"
              onClick={() => setViewMode('analytics')}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                borderRadius: 8,
                background: viewMode === 'analytics' ? '#fff' : 'transparent',
                color: viewMode === 'analytics' ? '#0F172A' : '#64748B',
                boxShadow: viewMode === 'analytics' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <BarChart3 size={15} />
              <span>{t('لوحة التحليلات والمؤشرات')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                borderRadius: 8,
                background: viewMode === 'table' ? '#fff' : 'transparent',
                color: viewMode === 'table' ? '#0F172A' : '#64748B',
                boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Camera size={15} />
              <span>{t('سجل عمليات التدقيق الفردية')}</span>
            </button>
          </div>

          <button
            className="btn ghost sm"
            onClick={exportExcel}
            disabled={!filteredAudits || filteredAudits.length === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            title={t('تصدير التقرير التنفيذي الشامل إلى Excel')}
          >
            <Download size={16} /> {t('تصدير التقرير التنفيذي الشامل إلى Excel')}
          </button>
        </div>
      </div>

      {/* 4 Executive KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Total Audits */}
        <div className="card" style={{ padding: '16px 20px', borderRight: '4px solid #3B82F6', borderRadius: 12 }}>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 4 }}>{t('إجمالي عمليات التدقيق')}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#1E293B' }}>{num(stats.total)}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {t('متوسط واجهات العرض لكل متجر')}: <strong>{stats.avgFacingsPerStore}</strong>
          </div>
        </div>

        {/* Avg Share of Shelf */}
        <div className="card" style={{ padding: '16px 20px', borderRight: '4px solid #10B981', borderRadius: 12 }}>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 4 }}>{t('متوسط حصة الرف')}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#059669' }}>{num(stats.avgShare)}%</div>
          <div style={{ width: '100%', height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
            <div
              style={{
                width: `${Math.min(100, stats.avgShare)}%`,
                height: '100%',
                background: stats.avgShare >= 40 ? '#10B981' : stats.avgShare >= 25 ? '#F59E0B' : '#EF4444',
                borderRadius: 3,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Perfect Store Index Rate */}
        <div className="card" style={{ padding: '16px 20px', borderRight: '4px solid #8B5CF6', borderRadius: 12 }}>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 4 }}>{t('نسبة المتاجر النموذجية')}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#7C3AED' }}>{num(stats.perfectRate)}%</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {num(stats.perfectCount)} {t('من إجمالي')} {num(stats.total)} {t('متجر')}
          </div>
        </div>

        {/* Store OOS Rate */}
        <div className="card" style={{ padding: '16px 20px', borderRight: '4px solid #EF4444', borderRadius: 12 }}>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 4 }}>{t('معدل النواقص في المتاجر')}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: stats.oosRate > 20 ? '#EF4444' : '#F59E0B' }}>
            {num(stats.oosRate)}%
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {num(stats.oosAuditsCount)} {t('متجر به نواقص مرصودة')}
          </div>
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
          {(selectedBranch || selectedSupervisor || dateFrom || dateTo || searchTerm || tierFilter !== 'all') && (
            <button
              className="btn sm ghost"
              onClick={() => {
                setSelectedBranch('');
                setSelectedSupervisor('');
                setDateFrom('');
                setDateTo('');
                setSearchTerm('');
                setTierFilter('all');
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <X size={14} /> {t('مسح الفلاتر')}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <SkeletonList n={5} />
      ) : isError ? (
        <ErrorState error={error as Error} onRetry={() => refetch()} />
      ) : audits?.length === 0 ? (
        <EmptyState
          icon={<Camera size={48} color="#94A3B8" />}
          title={t('لا توجد عمليات تدقيق رف مسجلة')}
          text={t('عمليات تدقيق الرف التي يسجلها المشرفون في زياراتهم ستظهر هنا تلقائياً.')}
        />
      ) : viewMode === 'analytics' ? (
        /* ════════════════════════════════════════════════════════════════════════
           EXECUTIVE ANALYTICS VIEW
           ════════════════════════════════════════════════════════════════════════ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Row 1: Branch Comparison & Perfect Store Matrix */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
            {/* Branch Share of Shelf Chart */}
            <div className="card col" style={{ padding: 20, gap: 14 }}>
              <div className="row between" style={{ alignItems: 'center' }}>
                <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <BarChart3 size={18} color="#2563EB" />
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    {t('مقارنة حصة الرف بين الفروع')}
                  </h3>
                </div>
                <span className="badge b-blue">{branchBreakdown.length} {t('فروع')}</span>
              </div>

              {branchBreakdown.length === 0 ? (
                <div className="muted" style={{ padding: 20, textAlign: 'center' }}>{t('لا توجد بيانات')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {branchBreakdown.map((b) => (
                    <div key={b.branchName} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div className="row between" style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 600, color: '#1E293B' }}>{b.branchName}</span>
                        <div className="row" style={{ gap: 8 }}>
                          <span className="muted" style={{ fontSize: 12 }}>{b.totalAudits} {t('تدقيق')}</span>
                          <strong style={{ color: b.avgShare >= 40 ? '#059669' : '#D97706' }}>{b.avgShare}%</strong>
                        </div>
                      </div>
                      <div style={{ width: '100%', height: 10, background: '#E2E8F0', borderRadius: 5, overflow: 'hidden', display: 'flex' }}>
                        <div
                          style={{
                            width: `${Math.min(100, b.avgShare)}%`,
                            height: '100%',
                            background: b.avgShare >= 40 ? '#10B981' : '#F59E0B',
                            borderRadius: 5,
                            transition: 'width 0.5s ease',
                          }}
                          title={`حصتنا: ${b.avgShare}%`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Perfect Store Matrix */}
            <div className="card col" style={{ padding: 20, gap: 14 }}>
              <div className="row between" style={{ alignItems: 'center' }}>
                <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <Award size={18} color="#7C3AED" />
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    {t('مصفوفة المتجر النموذجي')}
                  </h3>
                </div>
                <span className="badge b-purple">{num(stats.avgScore)}% {t('متوسط التقييم')}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {/* Perfect */}
                <div
                  className="card col"
                  style={{
                    padding: 14,
                    gap: 6,
                    borderRight: '4px solid #10B981',
                    background: tierFilter === 'perfect' ? '#ECFDF5' : '#F8FAFC',
                    cursor: 'pointer',
                  }}
                  onClick={() => setTierFilter(tierFilter === 'perfect' ? 'all' : 'perfect')}
                >
                  <div className="row between">
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#065F46' }}>🏆 {t('متجر نموذجي')}</span>
                    <span className="badge b-green" style={{ fontSize: 10 }}>80%+</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#047857' }}>{num(stats.perfectCount)}</div>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {stats.total > 0 ? Math.round((stats.perfectCount / stats.total) * 100) : 0}% {t('من الإجمالي')}
                  </span>
                </div>

                {/* Good */}
                <div
                  className="card col"
                  style={{
                    padding: 14,
                    gap: 6,
                    borderRight: '4px solid #3B82F6',
                    background: tierFilter === 'good' ? '#EFF6FF' : '#F8FAFC',
                    cursor: 'pointer',
                  }}
                  onClick={() => setTierFilter(tierFilter === 'good' ? 'all' : 'good')}
                >
                  <div className="row between">
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1E40AF' }}>✅ {t('عرض تجاري جيد')}</span>
                    <span className="badge b-blue" style={{ fontSize: 10 }}>65-79%</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#1D4ED8' }}>{num(stats.goodCount)}</div>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {stats.total > 0 ? Math.round((stats.goodCount / stats.total) * 100) : 0}% {t('من الإجمالي')}
                  </span>
                </div>

                {/* Needs Improvement */}
                <div
                  className="card col"
                  style={{
                    padding: 14,
                    gap: 6,
                    borderRight: '4px solid #F59E0B',
                    background: tierFilter === 'needs_imp' ? '#FFFBEB' : '#F8FAFC',
                    cursor: 'pointer',
                  }}
                  onClick={() => setTierFilter(tierFilter === 'needs_imp' ? 'all' : 'needs_imp')}
                >
                  <div className="row between">
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>⚠️ {t('يحتاج تحسينات')}</span>
                    <span className="badge b-yellow" style={{ fontSize: 10 }}>45-64%</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#B45309' }}>{num(stats.needsImpCount)}</div>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {stats.total > 0 ? Math.round((stats.needsImpCount / stats.total) * 100) : 0}% {t('من الإجمالي')}
                  </span>
                </div>

                {/* Poor */}
                <div
                  className="card col"
                  style={{
                    padding: 14,
                    gap: 6,
                    borderRight: '4px solid #EF4444',
                    background: tierFilter === 'poor' ? '#FEF2F2' : '#F8FAFC',
                    cursor: 'pointer',
                  }}
                  onClick={() => setTierFilter(tierFilter === 'poor' ? 'all' : 'poor')}
                >
                  <div className="row between">
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#991B1B' }}>❌ {t('أداء ضعيف')}</span>
                    <span className="badge b-red" style={{ fontSize: 10 }}>&lt; 45%</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#DC2626' }}>{num(stats.poorCount)}</div>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {stats.total > 0 ? Math.round((stats.poorCount / stats.total) * 100) : 0}% {t('من الإجمالي')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Top Out-of-Stock SKUs & Competitor Facing Analysis */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
            {/* Top Out-of-Stock SKUs */}
            <div className="card col" style={{ padding: 20, gap: 14 }}>
              <div className="row between" style={{ alignItems: 'center' }}>
                <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={18} color="#EF4444" />
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    {t('الأصناف الأكثر تعرضاً للنواقص في السوق')}
                  </h3>
                </div>
                <span className="badge b-red">{topOosItems.length} {t('أصناف حرجة')}</span>
              </div>

              {topOosItems.length === 0 ? (
                <div className="muted" style={{ padding: 20, textAlign: 'center' }}>
                  {t('لا توجد بيانات نواقص مرصودة في هذه الفترة')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {topOosItems.map((item, idx) => (
                    <div
                      key={item.name}
                      className="row between"
                      style={{
                        padding: '10px 12px',
                        background: '#FFF5F5',
                        border: '1px solid #FED7D7',
                        borderRadius: 8,
                        alignItems: 'center',
                      }}
                    >
                      <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, color: '#E53E3E', fontSize: 13 }}>#{idx + 1}</span>
                        <strong style={{ fontSize: 13.5, color: '#2D3748' }}>{item.name}</strong>
                      </div>
                      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                        <span className="badge b-red" style={{ fontSize: 11 }}>
                          {item.count} {t('متاجر')} ({item.pct}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Competitor Brands Analysis */}
            <div className="card col" style={{ padding: 20, gap: 14 }}>
              <div className="row between" style={{ alignItems: 'center' }}>
                <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <Target size={18} color="#D97706" />
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    {t('تحليل الماركات المنافسة')}
                  </h3>
                </div>
                <span className="badge b-amber">{topCompetitors.length} {t('ماركات')}</span>
              </div>

              {topCompetitors.length === 0 ? (
                <div className="muted" style={{ padding: 20, textAlign: 'center' }}>
                  {t('لا توجد ماركات منافسة مرصودة')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {topCompetitors.map((comp) => (
                    <div key={comp.brandName} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div className="row between" style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 600, color: '#1E293B' }}>{comp.brandName}</span>
                        <div className="row" style={{ gap: 8 }}>
                          <span className="muted" style={{ fontSize: 12 }}>{comp.facings} {t('واجهة')}</span>
                          <strong style={{ color: '#D97706' }}>{comp.sharePct}%</strong>
                        </div>
                      </div>
                      <div style={{ width: '100%', height: 8, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(100, comp.sharePct)}%`,
                            height: '100%',
                            background: '#F59E0B',
                            borderRadius: 4,
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ════════════════════════════════════════════════════════════════════════
           DETAILED TABLE VIEW
           ════════════════════════════════════════════════════════════════════════ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Rating Tier Filter Chips */}
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 13 }}>{t('تصفية حسب تقييم المتجر:')}</span>
            <button
              type="button"
              className={`chip ${tierFilter === 'all' ? 'on' : ''}`}
              onClick={() => setTierFilter('all')}
              style={{ fontSize: 12 }}
            >
              {t('جميع الفئات')} ({audits?.length ?? 0})
            </button>
            <button
              type="button"
              className={`chip ${tierFilter === 'perfect' ? 'on' : ''}`}
              onClick={() => setTierFilter('perfect')}
              style={{ fontSize: 12 }}
            >
              🏆 {t('متجر نموذجي')} ({stats.perfectCount})
            </button>
            <button
              type="button"
              className={`chip ${tierFilter === 'good' ? 'on' : ''}`}
              onClick={() => setTierFilter('good')}
              style={{ fontSize: 12 }}
            >
              ✅ {t('عرض تجاري جيد')} ({stats.goodCount})
            </button>
            <button
              type="button"
              className={`chip ${tierFilter === 'needs_imp' ? 'on' : ''}`}
              onClick={() => setTierFilter('needs_imp')}
              style={{ fontSize: 12 }}
            >
              ⚠️ {t('يحتاج تحسينات')} ({stats.needsImpCount})
            </button>
            <button
              type="button"
              className={`chip ${tierFilter === 'poor' ? 'on' : ''}`}
              onClick={() => setTierFilter('poor')}
              style={{ fontSize: 12 }}
            >
              ❌ {t('أداء ضعيف')} ({stats.poorCount})
            </button>
          </div>

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
                              audit.audit_score >= 80 ? 'b-green' : audit.audit_score >= 65 ? 'b-blue' : audit.audit_score >= 45 ? 'b-yellow' : 'b-red'
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

            {/* Out-of-Stock Items Alert in Modal */}
            {(() => {
              const oos = activePhoto.ai_detailed_report?.out_of_stock_items
                || activePhoto.ai_detailed_report?.target_brand_metrics?.oos_items
                || [];
              if (!Array.isArray(oos) || oos.length === 0) return null;
              return (
                <div style={{ background: '#FFF5F5', border: '1px solid #FED7D7', padding: 12, borderRadius: 10, marginBottom: 12 }}>
                  <strong style={{ fontSize: 12.5, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <AlertTriangle size={15} /> {t('الأصناف الناقصة')}:
                  </strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {oos.map((item: string, idx: number) => (
                      <span key={idx} className="badge b-red" style={{ fontSize: 11.5 }}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

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

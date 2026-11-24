import { useState, useMemo } from 'react';
import { useARAgeing, useAgeingSummary, AgeingRow, useBranches } from '@/lib/admin-data';
import { useSupervisors } from '@/lib/data';
import { t } from '@/i18n';
import { exportToCsv } from '@/lib/csv-export';

/* ─── Bucket palette — matches ROADMAP.md spec (no purple) ─── */
const BUCKET_STYLE: Record<string, { bg: string; color: string }> = {
  'جاري':      { bg: '#ECFDF5', color: '#065F46' },
  '1-30 يوم':  { bg: '#FFFBEB', color: '#92400E' },
  '31-60 يوم': { bg: '#FFF7ED', color: '#9A3412' },
  '61-90 يوم': { bg: '#FEF2F2', color: '#B91C1C' },
  '90+ يوم':   { bg: '#7F1D1D', color: '#FEE2E2' },
};
const BUCKET_ORDER = ['جاري', '1-30 يوم', '31-60 يوم', '61-90 يوم', '90+ يوم'];

function fmt(n: number) {
  return n.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AdminARAgeing() {
  const [supervisorId, setSupervisorId]   = useState('all');
  const [branchName, setBranchName]       = useState('all');
  const [search, setSearch]               = useState('');
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

  const supervisorFilter = supervisorId !== 'all' ? supervisorId : undefined;
  const branchFilter     = branchName   !== 'all' ? branchName   : undefined;

  const { data: rows = [], isLoading, error } = useARAgeing({
    supervisorId:   supervisorFilter,
    branchName:     branchFilter,
    searchCustomer: search || undefined,
  });
  const { data: summaryRows = [] } = useAgeingSummary({ supervisorId: supervisorFilter, branchName: branchFilter });

  const { data: supervisors = [] } = useSupervisors();
  const { data: branches   = [] } = useBranches();

  /* Server-side totals (accurate across all rows, not just first 500) */
  const serverBuckets = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    for (const s of summaryRows) {
      map[s.aging_bucket] = { count: Number(s.record_count), total: Number(s.total_outstanding) };
    }
    return map;
  }, [summaryRows]);

  /* Client-side fallback for when RPC not yet deployed */
  const clientBuckets = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    for (const r of rows) {
      if (!map[r.aging_bucket]) map[r.aging_bucket] = { count: 0, total: 0 };
      map[r.aging_bucket].count++;
      map[r.aging_bucket].total += Number(r.outstanding);
    }
    return map;
  }, [rows]);

  const bucketTotals = summaryRows.length > 0 ? serverBuckets : clientBuckets;

  const grandTotal = useMemo(() =>
    Object.values(bucketTotals).reduce((s, b) => s + b.total, 0),
  [bucketTotals]);

  const displayed = useMemo(() =>
    selectedBucket ? rows.filter((r) => r.aging_bucket === selectedBucket) : rows,
  [rows, selectedBucket]);

  function handleExport() {
    exportToCsv(
      displayed.map((r) => ({
        'العميل':          r.customer_name,
        'الفئة':           r.customer_class ?? '',
        'المشرف':          r.supervisor_name,
        'الفرع':           r.branch_name ?? '',
        'المبلغ':          r.amount,
        'المتبقي':         r.outstanding,
        'تاريخ الاستحقاق': r.due_date ?? '',
        'أيام التأخر':     r.aging_days ?? 0,
        'المجموعة':        r.aging_bucket,
      })),
      `ar-ageing-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  return (
    <section className="adm-section">
      {/* ── Header ── */}
      <div className="adm-section-header">
        <h1>{t('الذمم المدينة')}</h1>
        <button className="btn primary" onClick={handleExport}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span>⬇</span> {t('تصدير CSV')}
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="adm-filter-bar">
        <input
          type="text"
          className="adm-field"
          style={{ maxWidth: 200 }}
          placeholder={t('بحث عن عميل...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="adm-field" style={{ maxWidth: 180 }}
          value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
          <option value="all">{t('كل المشرفين')}</option>
          {supervisors.map((s: any) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
        <select className="adm-field" style={{ maxWidth: 160 }}
          value={branchName} onChange={(e) => setBranchName(e.target.value)}>
          <option value="all">{t('كل الفروع')}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.name}>{b.name}</option>
          ))}
        </select>
        {selectedBucket && (
          <button onClick={() => setSelectedBucket(null)}
            style={{ fontSize: 12, color: '#1A56DB', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            {t('إظهار الكل')}
          </button>
        )}
        <div style={{ marginInlineStart: 'auto', fontSize: 13, color: '#475569' }}>
          {t('إجمالي الذمم')}:{' '}
          <strong style={{ color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{fmt(grandTotal)}</strong>
          {selectedBucket && <span style={{ marginInlineStart: 8, color: '#1A56DB' }}>— {t('فلتر')}: {selectedBucket}</span>}
        </div>
      </div>

      {/* ── Bucket summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {BUCKET_ORDER.map((bucket) => {
          const stats = bucketTotals[bucket] ?? { count: 0, total: 0 };
          const active = selectedBucket === bucket;
          const palette = BUCKET_STYLE[bucket] ?? { bg: '#F1F5F9', color: '#374151' };
          return (
            <button key={bucket}
              onClick={() => setSelectedBucket(active ? null : bucket)}
              className={`adm-bucket-card${active ? ' active' : ''}`}
              style={{ background: palette.bg, color: palette.color }}>
              <div className="adm-bucket-card__label">{bucket}</div>
              <div className="adm-bucket-card__amount">{fmt(stats.total)}</div>
              <div className="adm-bucket-card__count">{stats.count} {t('عملية')}</div>
            </button>
          );
        })}
      </div>

      {/* ── Data table ── */}
      {isLoading ? (
        <div className="adm-empty">{t('جارٍ التحميل...')}</div>
      ) : error ? (
        <div className="adm-empty" style={{ color: '#EF4444' }}>{t('تعذر تحميل البيانات')}</div>
      ) : displayed.length === 0 ? (
        <div className="adm-empty">{t('لا توجد ذمم مستحقة')}</div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('العميل')}</th>
                <th>{t('الفئة')}</th>
                <th>{t('المشرف')}</th>
                <th>{t('الفرع')}</th>
                <th style={{ textAlign: 'end' }}>{t('المبلغ')}</th>
                <th style={{ textAlign: 'end' }}>{t('المتبقي')}</th>
                <th>{t('الاستحقاق')}</th>
                <th style={{ textAlign: 'center' }}>{t('الأيام')}</th>
                <th>{t('المجموعة')}</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((r: AgeingRow) => {
                const palette = BUCKET_STYLE[r.aging_bucket] ?? { bg: '#F1F5F9', color: '#374151' };
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, color: '#0F172A' }}>{r.customer_name}</td>
                    <td style={{ color: '#64748B' }}>{r.customer_class ?? '—'}</td>
                    <td>{r.supervisor_name}</td>
                    <td style={{ color: '#64748B' }}>{r.branch_name ?? '—'}</td>
                    <td style={{ textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>{fmt(Number(r.amount))}</td>
                    <td style={{ textAlign: 'end', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#B91C1C' }}>
                      {fmt(Number(r.outstanding))}
                    </td>
                    <td style={{ color: '#64748B' }}>{r.due_date ?? '—'}</td>
                    <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                      {r.aging_days != null ? r.aging_days : '—'}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                        fontSize: 11.5, fontWeight: 700,
                        background: palette.bg, color: palette.color,
                      }}>
                        {r.aging_bucket}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

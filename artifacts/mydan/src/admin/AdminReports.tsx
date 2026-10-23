import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useScope } from '@/lib/data';
import { BarChart3, Download, Plus, RefreshCw, Trash2, X } from '@/components/Icons';
import { exportToCsv } from '@/lib/csv-export';
import EmptyState from '@/components/EmptyState';
import { ErrorState } from '@/components/States';
import { t } from '@/i18n';

// ─── Types ──────────────────────────────────────────────────────────────────

type ChartType = 'table' | 'bar' | 'kpi';
type RowLimit = 10 | 25 | 50 | 100;

interface ReportConfig {
  id: string;
  name: string;
  source: string;
  columns: string[];
  chartType: ChartType;
  valueCol: string;
  labelCol: string;
  rowLimit: RowLimit;
  createdAt: string;
}

// ─── Data Sources ────────────────────────────────────────────────────────────

const SOURCES = [
  { id: 'vw_daily_kpi_supervisor',  label: t('KPIs المشرفين اليومية') },
  { id: 'vw_perfect_store_index',   label: t('مؤشر المتجر المثالي') },
  { id: 'vw_branch_performance',    label: t('أداء الفروع') },
  { id: 'vw_competitor_heatmap',    label: t('خريطة المنافسين') },
  { id: 'vw_oor_analysis',          label: t('تحليل OOR') },
  { id: 'vw_asset_fleet_health',    label: t('صحة أسطول الأصول') },
];

// ─── LocalStorage helpers ────────────────────────────────────────────────────

function storeKey(cid: string) { return `mydan_reports_${cid}`; }

function loadReports(cid: string): ReportConfig[] {
  try { return JSON.parse(localStorage.getItem(storeKey(cid)) ?? '[]'); }
  catch { return []; }
}

function persist(cid: string, list: ReportConfig[]) {
  try { localStorage.setItem(storeKey(cid), JSON.stringify(list)); } catch { /* quota */ }
}

// ─── Chart Renderers ─────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function ReportTable({ data, cols }: { data: Row[]; cols: string[] }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>{cols.map((c) => <td key={c}>{String(row[c] ?? '—')}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarChart({ data, labelCol, valueCol }: { data: Row[]; labelCol: string; valueCol: string }) {
  const max = Math.max(...data.map((r) => Number(r[valueCol]) || 0), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((row, i) => {
        const val = Number(row[valueCol]) || 0;
        const pct = (val / max) * 100;
        return (
          <div key={i} className="s-hbar">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(row[labelCol] ?? `#${i + 1}`)}
            </span>
            <div className="bar" style={{ height: 14 }}>
              <div style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--color-primary)', borderRadius: 99 }} />
            </div>
            <span style={{ textAlign: 'end', fontWeight: 700 }}>{val}</span>
          </div>
        );
      })}
    </div>
  );
}

function KpiCards({ data, cols }: { data: Row[]; cols: string[] }) {
  const row = data[0];
  if (!row) return <p className="muted">{t('لا توجد بيانات')}</p>;
  return (
    <div className="adm-kpis">
      {cols.map((c) => (
        <div key={c} className="kpi">
          <span className="muted" style={{ fontSize: 12 }}>{c}</span>
          <span className="big" style={{ fontSize: 22 }}>{String(row[c] ?? '—')}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Report Viewer ────────────────────────────────────────────────────────────

function ReportViewer({ config, onClose }: { config: ReportConfig; onClose: () => void }) {
  const sc = useScope();
  const q = useQuery({
    queryKey: ['mydan', 'report', sc.companyId, config.id, config.source, config.rowLimit],
    queryFn: async () => {
      const isAllowed = SOURCES.some((s) => s.id === config.source);
      if (!isAllowed) throw new Error(t('مصدر التقرير المطلوب غير مصرح به'));
      let query = (supabase as any).from(config.source).select('*');
      if (sc.companyId) query = query.eq('company_id', sc.companyId);
      const limit = Math.min(Number(config.rowLimit) || 100, 200);
      const { data, error } = await query.limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
  });

  const handleExport = () => {
    if (!q.data?.length) return;
    const cols = config.columns.length > 0 ? config.columns : Object.keys(q.data[0]);
    exportToCsv(
      `${config.name}_${new Date().toISOString().slice(0, 10)}`,
      cols.map((c) => ({ header: c, accessor: (row) => row[c] ?? '' })),
      q.data
    );
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row between">
        <h3 style={{ margin: 0 }}>{config.name}</h3>
        <div className="row gap-1">
          <button
            className="icon-btn"
            aria-label={t('تصدير Excel')}
            title={t('تصدير التقرير إلى Excel')}
            onClick={handleExport}
            disabled={!q.data?.length}
          >
            <Download size={18} />
          </button>
          <button className="icon-btn" aria-label={t('تحديث')} onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw size={18} style={{ animation: q.isFetching ? 'spin .8s linear infinite' : 'none' }} />
          </button>
          <button className="icon-btn" aria-label={t('إغلاق')} onClick={onClose}><X /></button>
        </div>
      </div>
      <span className="badge b-blue" style={{ alignSelf: 'flex-start' }}>
        {SOURCES.find((s) => s.id === config.source)?.label ?? config.source}
      </span>

      {q.isPending && <div className="skel" style={{ height: 200 }} />}
      {q.isError && <ErrorState error={q.error} onRetry={q.refetch} />}
      {q.data && (
        <>
          <span className="muted" style={{ fontSize: 13 }}>{t('{n} صف', { n: q.data.length })}</span>
          {config.chartType === 'table' && <ReportTable data={q.data} cols={config.columns} />}
          {config.chartType === 'bar'   && <BarChart data={q.data} labelCol={config.labelCol} valueCol={config.valueCol} />}
          {config.chartType === 'kpi'   && <KpiCards data={q.data} cols={config.columns} />}
        </>
      )}
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

interface WizardState {
  step: 1 | 2 | 3;
  source: string;
  columns: string[];
  chartType: ChartType;
  valueCol: string;
  labelCol: string;
  rowLimit: RowLimit;
  name: string;
}

const initWizard = (): WizardState => ({
  step: 1, source: SOURCES[0].id, columns: [], chartType: 'table',
  valueCol: '', labelCol: '', rowLimit: 25, name: '',
});

function ReportWizard({
  wizard, onChange, onClose, onSave,
}: {
  wizard: WizardState;
  onChange: (w: WizardState) => void;
  onClose: () => void;
  onSave: (w: WizardState) => void;
}) {
  const set = <K extends keyof WizardState>(k: K, v: WizardState[K]) => onChange({ ...wizard, [k]: v } as WizardState);

  // ── Step 2: column discovery ──────────────────────────────────────────────
  const previewQ = useQuery({
    queryKey: ['mydan', 'report-preview', wizard.source],
    queryFn: async () => {
      const isAllowed = SOURCES.some((s) => s.id === wizard.source);
      if (!isAllowed) throw new Error(t('مصدر التقرير المطلوب غير مصرح به'));
      const { data, error } = await (supabase as any).from(wizard.source).select('*').limit(3);
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
    enabled: wizard.step === 2 && SOURCES.some((s) => s.id === wizard.source),
  });

  const allCols = previewQ.data?.[0] ? Object.keys(previewQ.data[0]) : [];

  // ── Drag-and-drop for column reordering ────────────────────────────────────
  const dragIdx = useRef<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const onDragStart = (i: number) => { dragIdx.current = i; };
  const onDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); setDropIdx(i); };
  const onDrop = (i: number) => {
    const from = dragIdx.current;
    if (from == null || from === i) { setDropIdx(null); return; }
    const cols = [...wizard.columns];
    const [item] = cols.splice(from, 1);
    cols.splice(i, 0, item);
    onChange({ ...wizard, columns: cols });
    dragIdx.current = null; setDropIdx(null);
  };
  const onDragEnd = () => { dragIdx.current = null; setDropIdx(null); };

  const toggleCol = (col: string, checked: boolean) => {
    const cols = checked ? [...wizard.columns, col] : wizard.columns.filter((c) => c !== col);
    onChange({ ...wizard, columns: cols });
  };

  // ── Navigation ─────────────────────────────────────────────────────────────

  const next = () => {
    if (wizard.step === 1) {
      onChange({ ...wizard, step: 2, columns: [] });
    } else if (wizard.step === 2) {
      const cols = wizard.columns;
      onChange({
        ...wizard, step: 3,
        labelCol: wizard.labelCol || cols[0] || '',
        valueCol: wizard.valueCol || cols[1] || cols[0] || '',
      });
    } else {
      if (!wizard.name.trim()) return;
      onSave(wizard);
    }
  };

  const back = () => onChange({ ...wizard, step: (wizard.step - 1) as 1 | 2 | 3 });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="adm-modal-bg" onClick={onClose}>
      <div className="adm-drawer" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="row between" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{t('إنشاء تقرير جديد')}</h3>
          <button className="icon-btn" aria-label={t('إغلاق')} onClick={onClose}><X /></button>
        </div>

        {/* Step indicator */}
        <div className="s-steps" style={{ marginBottom: 20 }}>
          {(['1', '2', '3'] as const).map((s, i) => (
            <div key={s} className={(i + 1) < wizard.step ? 'done' : (i + 1) === wizard.step ? 'on' : ''}>
              {i + 1}. {[t('مصدر البيانات'), t('الأعمدة'), t('التصور')][i]}
            </div>
          ))}
        </div>

        {/* ── Step 1: Source ───────────────────────────────────────────── */}
        {wizard.step === 1 && (
          <div className="col">
            <label className="f">
              {t('اختر مصدر البيانات (Supabase View)')}
              <select
                className="input"
                value={wizard.source}
                onChange={(e) => set('source', e.target.value)}
              >
                {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <div className="alert ok" style={{ fontSize: 13 }}>
              {t('عدد الصفوف في التقرير')}:&nbsp;
              <select
                style={{ border: 'none', background: 'transparent', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}
                value={wizard.rowLimit}
                onChange={(e) => set('rowLimit', Number(e.target.value) as RowLimit)}
              >
                {([10, 25, 50, 100] as RowLimit[]).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Step 2: Columns ──────────────────────────────────────────── */}
        {wizard.step === 2 && (
          <div className="col">
            {previewQ.isPending && <div className="skel" style={{ height: 160 }} />}
            {previewQ.isError && <ErrorState error={previewQ.error} onRetry={previewQ.refetch} />}

            {previewQ.data && allCols.length > 0 && <>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {t('اختر الأعمدة التي تريد عرضها، ثم اسحبها لترتيبها')}
              </p>

              {/* All columns checkboxes */}
              <div className="col" style={{ gap: 4 }}>
                {allCols.map((col) => (
                  <label key={col} className="adm-toggle" style={{ cursor: 'pointer' }}>
                    <span style={{ fontSize: 14 }}>{col}</span>
                    <input
                      type="checkbox"
                      checked={wizard.columns.includes(col)}
                      onChange={(e) => toggleCol(col, e.target.checked)}
                    />
                  </label>
                ))}
              </div>

              {/* Selected columns — drag to reorder */}
              {wizard.columns.length > 0 && <>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{t('ترتيب الأعمدة المحددة (اسحب للترتيب):')}</p>
                <div className="col" style={{ gap: 6 }}>
                  {wizard.columns.map((col, i) => (
                    <div
                      key={col}
                      draggable
                      onDragStart={() => onDragStart(i)}
                      onDragOver={(e) => onDragOver(e, i)}
                      onDrop={() => onDrop(i)}
                      onDragEnd={onDragEnd}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 10, cursor: 'grab',
                        background: dropIdx === i ? '#EEF4FF' : '#F3F5F9',
                        border: `2px solid ${dropIdx === i ? 'var(--color-primary)' : 'transparent'}`,
                        fontSize: 14, fontWeight: 600,
                        transition: 'background .15s',
                      }}
                    >
                      <span style={{ color: 'var(--muted)', fontSize: 18, userSelect: 'none' }}>⠿</span>
                      {col}
                    </div>
                  ))}
                </div>
              </>}
            </>}
          </div>
        )}

        {/* ── Step 3: Visualization & Name ─────────────────────────────── */}
        {wizard.step === 3 && (
          <div className="col">
            <label className="f">
              {t('اسم التقرير')}
              <input
                className="input"
                placeholder={t('مثال: أداء الفروع الشهري')}
                value={wizard.name}
                onChange={(e) => set('name', e.target.value)}
                autoFocus
              />
            </label>

            <div>
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 14 }}>{t('نوع التصور')}</p>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {([
                  { k: 'table', label: t('جدول') },
                  { k: 'bar',   label: t('أعمدة بيانية') },
                  { k: 'kpi',   label: t('بطاقات KPI') },
                ] as const).map(({ k, label }) => (
                  <button
                    key={k} type="button"
                    className={`chip${wizard.chartType === k ? ' on' : ''}`}
                    onClick={() => set('chartType', k)}
                  >{label}</button>
                ))}
              </div>
            </div>

            {wizard.chartType === 'bar' && (
              <div className="col">
                <label className="f">
                  {t('عمود التسمية (المحور X)')}
                  <select className="input" value={wizard.labelCol} onChange={(e) => set('labelCol', e.target.value)}>
                    {wizard.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="f">
                  {t('عمود القيمة (المحور Y)')}
                  <select className="input" value={wizard.valueCol} onChange={(e) => set('valueCol', e.target.value)}>
                    {wizard.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="row" style={{ marginTop: 24, gap: 10 }}>
          {wizard.step > 1 && (
            <button className="btn ghost" style={{ flex: 1 }} onClick={back}>{t('رجوع')}</button>
          )}
          <button
            className="btn"
            style={{ flex: 2 }}
            onClick={next}
            disabled={
              (wizard.step === 2 && wizard.columns.length === 0) ||
              (wizard.step === 3 && !wizard.name.trim())
            }
          >
            {wizard.step === 3 ? t('حفظ التقرير') : t('التالي')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminReports() {
  const sc = useScope();
  const [reports, setReports] = useState<ReportConfig[]>(() => loadReports(sc.companyId));
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [viewing, setViewing] = useState<ReportConfig | null>(null);

  const save = useCallback((list: ReportConfig[]) => {
    setReports(list);
    persist(sc.companyId, list);
  }, [sc.companyId]);

  const deleteReport = useCallback((id: string) => {
    save(reports.filter((r) => r.id !== id));
    if (viewing?.id === id) setViewing(null);
  }, [reports, save, viewing]);

  const handleSave = useCallback((w: WizardState) => {
    const cfg: ReportConfig = {
      id: `${Date.now()}`,
      name: w.name,
      source: w.source,
      columns: w.columns,
      chartType: w.chartType,
      valueCol: w.valueCol,
      labelCol: w.labelCol,
      rowLimit: w.rowLimit,
      createdAt: new Date().toISOString(),
    };
    save([...reports, cfg]);
    setWizard(null);
    setViewing(cfg);
  }, [reports, save]);

  return (
    <div>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>{t('التقارير المخصصة')}</h2>
        <button className="btn" onClick={() => setWizard(initWizard())}><Plus size={18} /> {t('تقرير جديد')}</button>
      </div>

      {viewing ? (
        <ReportViewer config={viewing} onClose={() => setViewing(null)} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={32} />}
          title={t('لا توجد تقارير بعد')}
          text={t('أنشئ تقريرك الأول من مصادر بيانات Supabase')}
          action={{ label: t('تقرير جديد'), onClick: () => setWizard(initWizard()) }}
        />
      ) : (
        <div className="adm-grid">
          {reports.map((r) => (
            <div key={r.id} className="adm-table-wrap" style={{ padding: 16, borderRadius: 14 }}>
              <div className="row between">
                <div className="grow">
                  <div className="title">{r.name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {SOURCES.find((s) => s.id === r.source)?.label ?? r.source} &nbsp;·&nbsp;
                    {r.chartType === 'table' ? t('جدول') : r.chartType === 'bar' ? t('أعمدة بيانية') : t('بطاقات KPI')}
                    &nbsp;·&nbsp; {r.rowLimit} {t('صف')}
                  </div>
                </div>
                <div className="row">
                  <button className="btn sm" onClick={() => setViewing(r)}>{t('عرض التقرير')}</button>
                  <button
                    className="icon-btn"
                    aria-label={t('حذف')}
                    onClick={() => deleteReport(r.id)}
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {wizard && (
        <ReportWizard
          wizard={wizard}
          onChange={setWizard}
          onClose={() => setWizard(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

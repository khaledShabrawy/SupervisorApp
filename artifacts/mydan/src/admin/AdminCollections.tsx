import { useState, useCallback } from 'react';
import { useCollections, useCreateCollection, CollectionRow, useAdminCustomers } from '@/lib/admin-data';
import { useSupervisors } from '@/lib/data';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { t } from '@/i18n';
import { exportToCsv } from '@/lib/csv-export';
import { todayStr } from '@/lib/format';

const PAYMENT_TYPE_LABEL: Record<number, string> = {
  1: 'نقداً',
  2: 'شيك',
  3: 'تحويل',
};
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:   { bg: '#FFFBEB', color: '#92400E' },
  confirmed: { bg: '#ECFDF5', color: '#065F46' },
  bounced:   { bg: '#FEF2F2', color: '#B91C1C' },
  cancelled: { bg: '#F1F5F9', color: '#475569' },
};
const STATUS_LABEL: Record<string, string> = {
  pending:   'معلق',
  confirmed: 'مؤكد',
  bounced:   'مرتجع',
  cancelled: 'ملغى',
};

function fmt(n: number) {
  return n.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface FormState {
  collection_no: string;
  customer_id:   string;
  supervisor_id: string;
  payment_type:  number;
  amount:        string;
  cheque_no:     string;
  cheque_bank:   string;
  cheque_date:   string;
  collection_date: string;
  notes: string;
}

function emptyForm(): FormState {
  return {
    collection_no: '',
    customer_id:   '',
    supervisor_id: '',
    payment_type:  1,
    amount:        '',
    cheque_no:     '',
    cheque_bank:   '',
    cheque_date:   '',
    collection_date: todayStr(),
    notes:         '',
  };
}

export default function AdminCollections() {
  const [supervisorId, setSupervisorId] = useState('all');
  const [paymentType, setPaymentType]   = useState<number | undefined>(undefined);
  const [status, setStatus]             = useState('all');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [showModal, setShowModal]           = useState(false);
  const [form, setForm]                     = useState<FormState>(emptyForm());
  const [customerSearch, setCustomerSearch] = useState('');

  const { items: rows, isLoading, error, fetchNextPage, hasNextPage } = useCollections({
    supervisorId: supervisorId !== 'all' ? supervisorId : undefined,
    paymentType,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    status: status !== 'all' ? status : undefined,
  });

  const { data: supervisors = [] } = useSupervisors();

  const debouncedCustomerSearch = useDebouncedValue(customerSearch, 300);
  const { items: customers, isLoading: custLoading } = useAdminCustomers(debouncedCustomerSearch, undefined, undefined);

  const createMutation = useCreateCollection();

  const handleOpenModal = useCallback(() => {
    setCustomerSearch('');
    setForm(emptyForm());
    setShowModal(true);
  }, []);

  function handleExport() {
    exportToCsv(
      rows.map((r) => ({
        'رقم التحصيل':    r.collection_no,
        'العميل':          r.customers?.name ?? '',
        'المشرف':          r.supervisors?.full_name ?? '',
        'نوع الدفع':      PAYMENT_TYPE_LABEL[r.payment_type] ?? '',
        'المبلغ':          r.amount,
        'تاريخ التحصيل': r.collection_date,
        'الحالة':          STATUS_LABEL[r.status] ?? r.status,
        'ملاحظات':        r.notes ?? '',
      })),
      `collections-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createMutation.mutateAsync({
      collection_no:   form.collection_no.trim(),
      customer_id:     form.customer_id,
      supervisor_id:   form.supervisor_id,
      payment_type:    form.payment_type,
      amount:          parseFloat(form.amount),
      cheque_no:       form.cheque_no || undefined,
      cheque_bank:     form.cheque_bank || undefined,
      cheque_date:     form.cheque_date || undefined,
      collection_date: form.collection_date,
      notes:           form.notes || undefined,
    });
    setShowModal(false);
    setForm(emptyForm());
  }

  const labelStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 5,
    fontSize: 13, fontWeight: 600, color: '#374151',
  };

  return (
    <section className="adm-section">
      {/* ── Header ── */}
      <div className="adm-section-header">
        <h1>{t('التحصيلات')}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={handleExport}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span>⬇</span> {t('تصدير CSV')}
          </button>
          <button className="btn primary"
            onClick={handleOpenModal}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span>+</span> {t('تحصيل جديد')}
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="adm-filter-bar">
        <select className="adm-field" style={{ maxWidth: 180 }}
          value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
          <option value="all">{t('كل المشرفين')}</option>
          {supervisors.map((s: any) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
        <select className="adm-field" style={{ maxWidth: 160 }}
          value={paymentType ?? 'all'}
          onChange={(e) => setPaymentType(e.target.value === 'all' ? undefined : Number(e.target.value))}>
          <option value="all">{t('كل أنواع الدفع')}</option>
          <option value="1">{t('نقداً')}</option>
          <option value="2">{t('شيك')}</option>
          <option value="3">{t('تحويل')}</option>
        </select>
        <select className="adm-field" style={{ maxWidth: 140 }}
          value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">{t('كل الحالات')}</option>
          <option value="pending">{t('معلق')}</option>
          <option value="confirmed">{t('مؤكد')}</option>
          <option value="bounced">{t('مرتجع')}</option>
          <option value="cancelled">{t('ملغى')}</option>
        </select>
        <input className="adm-field" type="date" style={{ maxWidth: 150 }}
          value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input className="adm-field" type="date" style={{ maxWidth: 150 }}
          value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="adm-empty">{t('جارٍ التحميل...')}</div>
      ) : error ? (
        <div className="adm-empty" style={{ color: '#EF4444' }}>{t('تعذر تحميل البيانات')}</div>
      ) : rows.length === 0 ? (
        <div className="adm-empty">{t('لا توجد تحصيلات')}</div>
      ) : (
        <>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>{t('رقم التحصيل')}</th>
                  <th>{t('العميل')}</th>
                  <th>{t('المشرف')}</th>
                  <th>{t('نوع الدفع')}</th>
                  <th style={{ textAlign: 'end' }}>{t('المبلغ')}</th>
                  <th>{t('تاريخ التحصيل')}</th>
                  <th>{t('الحالة')}</th>
                  <th>{t('ملاحظات')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: CollectionRow) => {
                  const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending;
                  return (
                    <tr key={r.id}>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{r.collection_no}</td>
                      <td style={{ fontWeight: 600, color: '#0F172A' }}>{r.customers?.name ?? '—'}</td>
                      <td>{r.supervisors?.full_name ?? '—'}</td>
                      <td style={{ color: '#475569' }}>{PAYMENT_TYPE_LABEL[r.payment_type] ?? r.payment_type}</td>
                      <td style={{ textAlign: 'end', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#065F46' }}>
                        {fmt(Number(r.amount))}
                      </td>
                      <td style={{ color: '#64748B' }}>{r.collection_date}</td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                          fontSize: 11.5, fontWeight: 700, background: st.bg, color: st.color,
                        }}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td style={{ color: '#94A3B8', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.notes ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasNextPage && (
            <div style={{ textAlign: 'center', paddingTop: 8 }}>
              <button onClick={() => void fetchNextPage()}
                style={{ fontSize: 13, color: '#1A56DB', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                {t('تحميل المزيد')}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── New collection modal ── */}
      {showModal && (
        <div className="adm-modal-bg" onClick={() => setShowModal(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0F172A' }}>
                {t('تسجيل تحصيل جديد')}
              </h2>
              <button onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 22, lineHeight: 1 }}>×</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <label style={labelStyle}>
                {t('رقم التحصيل')} *
                <input className="adm-field" type="text" required
                  value={form.collection_no}
                  onChange={(e) => setForm((f) => ({ ...f, collection_no: e.target.value }))} />
              </label>

              {/* Customer — live-search combobox */}
              <label style={labelStyle}>
                {t('العميل')} *
                <input
                  className="adm-field"
                  type="text"
                  placeholder={t('ابحث باسم العميل...')}
                  value={customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setForm((f) => ({ ...f, customer_id: '' })); }}
                  style={{ marginBottom: 4 }}
                />
                {customerSearch.length >= 2 && (
                  <select
                    className="adm-field"
                    required
                    size={Math.min(customers.length + 1, 5)}
                    value={form.customer_id}
                    onChange={(e) => {
                      const sel = customers.find((c: any) => c.id === e.target.value);
                      setForm((f) => ({ ...f, customer_id: e.target.value }));
                      if (sel) setCustomerSearch((sel as any).name);
                    }}
                  >
                    <option value="">{custLoading ? t('جارٍ البحث...') : t('اختر من النتائج')}</option>
                    {customers.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                {form.customer_id && (
                  <span style={{ fontSize: 12, color: '#065F46', marginTop: 2, display: 'block' }}>
                    ✓ {customers.find((c: any) => c.id === form.customer_id)?.name ?? t('تم الاختيار')}
                  </span>
                )}
                <input type="text" required value={form.customer_id} readOnly style={{ display: 'none' }} />
              </label>

              <label style={labelStyle}>
                {t('المشرف')} *
                <select className="adm-field" required
                  value={form.supervisor_id}
                  onChange={(e) => setForm((f) => ({ ...f, supervisor_id: e.target.value }))}>
                  <option value="">{t('اختر المشرف')}</option>
                  {supervisors.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={labelStyle}>
                  {t('نوع الدفع')} *
                  <select className="adm-field" required
                    value={form.payment_type}
                    onChange={(e) => setForm((f) => ({ ...f, payment_type: Number(e.target.value) }))}>
                    <option value={1}>{t('نقداً')}</option>
                    <option value={2}>{t('شيك')}</option>
                    <option value={3}>{t('تحويل')}</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  {t('المبلغ')} *
                  <input className="adm-field" type="number" required min="0.01" step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
                </label>
              </div>

              {form.payment_type === 2 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label style={labelStyle}>
                    {t('رقم الشيك')} *
                    <input className="adm-field" type="text" required
                      value={form.cheque_no}
                      onChange={(e) => setForm((f) => ({ ...f, cheque_no: e.target.value }))} />
                  </label>
                  <label style={labelStyle}>
                    {t('البنك')}
                    <input className="adm-field" type="text"
                      value={form.cheque_bank}
                      onChange={(e) => setForm((f) => ({ ...f, cheque_bank: e.target.value }))} />
                  </label>
                  <label style={{ ...labelStyle, gridColumn: '1/-1' }}>
                    {t('تاريخ الشيك')}
                    <input className="adm-field" type="date"
                      value={form.cheque_date}
                      onChange={(e) => setForm((f) => ({ ...f, cheque_date: e.target.value }))} />
                  </label>
                </div>
              )}

              <label style={labelStyle}>
                {t('تاريخ التحصيل')} *
                <input className="adm-field" type="date" required
                  value={form.collection_date}
                  onChange={(e) => setForm((f) => ({ ...f, collection_date: e.target.value }))} />
              </label>

              <label style={labelStyle}>
                {t('ملاحظات')}
                <textarea className="adm-field" rows={2} style={{ resize: 'none' }}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8, borderTop: '1px solid #E2E8F0', marginTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)}
                  style={{ minHeight: 38, padding: '0 18px', borderRadius: 8, fontWeight: 600, fontSize: 13.5,
                    background: 'transparent', border: '1px solid #CBD5E1', color: '#374151', cursor: 'pointer' }}>
                  {t('إلغاء')}
                </button>
                <button type="submit" disabled={createMutation.isPending}
                  style={{ minHeight: 38, padding: '0 22px', borderRadius: 8, fontWeight: 700, fontSize: 13.5,
                    background: 'linear-gradient(135deg, #1344A8 0%, #2563EB 100%)', color: '#fff',
                    border: 'none', cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
                    opacity: createMutation.isPending ? 0.65 : 1 }}>
                  {createMutation.isPending ? t('جارٍ الحفظ...') : t('حفظ التحصيل')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

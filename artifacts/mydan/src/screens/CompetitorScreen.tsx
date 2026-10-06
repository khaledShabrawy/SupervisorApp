import { memo, useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Plus, XCircle } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useScope } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/toast';
import { PageTitle } from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import { ErrorState, SkeletonList } from '@/components/States';
import { num, fmtDate } from '@/lib/format';
import { useInput } from './shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { t } from '@/i18n';

interface CompetitorProduct { id: string; brand_name: string; product_name: string | null; quantity: number | null; notes: string | null; created_at: string; }

function useCompetitorProducts(visitId: string) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'competitors', visitId],
    enabled: !!visitId,
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('competitor_products').select('id,brand_name,product_name,quantity,notes,created_at').eq('company_id', sc.companyId).eq('visit_id', visitId).order('created_at', { ascending: false }).abortSignal(signal);
      if (error) throw new Error(t('تعذر تحميل منتجات المنافسين.'));
      return (data ?? []) as CompetitorProduct[];
    },
  });
}

function useAddCompetitor() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { visitId: string; brandName: string; productName: string; quantity: number; notes: string; }) => {
      const { error } = await supabase.from('competitor_products').insert({ visit_id: v.visitId, company_id: sc.companyId, brand_name: v.brandName.trim(), product_name: v.productName.trim() || null, quantity: v.quantity || null, notes: v.notes.trim() || null });
      if (error) throw new Error(t('تعذر الحفظ: {msg}', { msg: error.message }));
    },
    onSuccess: (_d, v) => {
      notify(t('✅ تم تسجيل منتج {brand}', { brand: v.brandName }), 'success');
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[4]) === `competitors` });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

function useDeleteCompetitor() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('competitor_products').delete().eq('id', id).eq('company_id', sc.companyId);
      if (error) throw new Error(t('تعذر الحذف.'));
    },
    onSuccess: () => {
      notify(t('تم الحذف'), 'info');
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[4]) === 'competitors' });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

// Stored as brand_name and read by the competitor heatmap: keep one spelling in every language.
const KNOWN_BRANDS = ['كادبوري', 'جالكسي', 'كيندر', 'فريرو', 'سنيكرز', 'ماكنتوش', 'ريكس', 'أخرى'];

const CompetitorItem = memo(function CompetitorItem({ item, onDelete }: { item: CompetitorProduct; onDelete: (id: string) => void; }) {
  const del = useCallback(() => { if (!window.confirm(t('حذف هذا المنتج؟'))) return; onDelete(item.id); }, [onDelete, item.id]);
  return (
    <div className="card row" style={{ padding: '10px 14px', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="title" style={{ fontSize: 15 }}>{item.brand_name}</div>
        {item.product_name && <div className="muted" style={{ fontSize: 13 }}>{item.product_name}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {item.quantity != null && <span className="badge b-blue">{t('{n} وحدة', { n: num(item.quantity) })}</span>}
          <span className="badge b-gray">{fmtDate(item.created_at)}</span>
        </div>
        {item.notes && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{item.notes}</div>}
      </div>
      <button className="icon-btn" aria-label={t('حذف')} onClick={del} style={{ color: 'var(--color-danger)', flexShrink: 0 }}><XCircle size={18} /></button>
    </div>
  );
});

export default function CompetitorScreen() {
  const { supervisor } = useAuth();
  const settings = useAppSettings();
  const [params] = useSearchParams();
  const visitId = params.get('visit') ?? '';
  const customerName = params.get('name') ?? t('الزيارة الحالية');
  const list = useCompetitorProducts(visitId);
  const add = useAddCompetitor();
  const del = useDeleteCompetitor();
  const [brand, setBrand] = useState('');
  const [product, setProduct] = useState('');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [showForm, setShowForm] = useState(false);
  const onBrand = useInput(setBrand);
  const onProduct = useInput(setProduct);
  const onQty = useInput(setQty);
  const onNotes = useInput(setNotes);

  const submit = useCallback(() => {
    if (!brand.trim() || !visitId) return;
    add.mutate({ visitId, brandName: brand, productName: product, quantity: Number(qty) || 0, notes }, { onSuccess: () => { setBrand(''); setProduct(''); setQty(''); setNotes(''); setShowForm(false); } });
  }, [add, visitId, brand, product, qty, notes]);

  const refetch = useCallback(() => { void list.refetch(); }, [list]);
  const onDelete = useCallback((id: string) => del.mutate(id), [del]);

  if (!visitId) return (
    <div className="page"><PageTitle>{t('منتجات المنافسين')}</PageTitle><div className="alert warn">{t('يجب فتح هذه الشاشة من داخل زيارة نشطة.')}</div></div>
  );

  return (
    <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
      <PageTitle>{t('منتجات المنافسين')}</PageTitle>
      <div className="muted" style={{ fontSize: 13 }}><strong>{customerName}</strong></div>
      {showForm ? (
        <div className="card col" style={{ gap: 12 }}>
          <div className="title">{t('إضافة منتج منافس')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {KNOWN_BRANDS.map((b) => <button key={b} className={`chip${brand === b ? ' on' : ''}`} style={{ minHeight: 36, fontSize: 13 }} onClick={() => setBrand(b)}>{t(b)}</button>)}
          </div>
          <label className="f">{t('العلامة التجارية *')}<input className="input" value={brand} onChange={onBrand} placeholder={t('مثال: كادبوري، جالكسي...')} /></label>
          <label className="f">{t('اسم المنتج (اختياري)')}<input className="input" value={product} onChange={onProduct} placeholder={t('مثال: شوكولاتة حليب 100 جم')} /></label>
          <label className="f">{t('الكمية الملاحظة (اختياري)')}<input className="input" type="number" inputMode="numeric" value={qty} onChange={onQty} placeholder={t('عدد الوحدات')} min="0" /></label>
          <label className="f">{t('ملاحظات (اختياري)')}<textarea className="input" rows={2} value={notes} onChange={onNotes} placeholder={t('موضع العرض، التخفيضات، ملاحظات أخرى...')} /></label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn success grow" disabled={!brand.trim() || add.isPending} onClick={submit}><Plus size={18} />{add.isPending ? t('جاري الحفظ...') : t('حفظ')}</button>
            <button className="btn ghost" onClick={() => { setShowForm(false); setBrand(''); setProduct(''); setQty(''); setNotes(''); }}>{t('إلغاء')}</button>
          </div>
        </div>
      ) : (
        <button className="btn block" onClick={() => setShowForm(true)}><Plus size={20} />{t('إضافة منتج منافس')}</button>
      )}
      {list.isPending ? <SkeletonList n={3} /> : list.isError ? <ErrorState error={list.error} onRetry={refetch} /> : list.data?.length === 0 ? <EmptyState icon={<Eye />} title={t('لا توجد منتجات مسجّلة')} text={t('أضف منتجات المنافسين التي لاحظتها في هذه الزيارة.')} /> : (
        <div className="col" style={{ gap: 8 }}>
          <div className="muted" style={{ fontSize: 13 }}>{t('{n} منتج مسجّل في هذه الزيارة', { n: num(list.data.length) })}</div>
          {list.data.map((item) => <CompetitorItem key={item.id} item={item} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}

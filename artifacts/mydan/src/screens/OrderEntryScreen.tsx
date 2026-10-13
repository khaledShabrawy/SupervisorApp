import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ShoppingBag } from '@/components/Icons';
import { PageTitle } from '@/components/Layout';
import { ErrorState, SkeletonList } from '@/components/States';
import { fmtDate } from '@/lib/format';
import { useCreateOrder, useOrderProducts, useOrderVisit } from '@/lib/screen-orders';
import { useRefetch } from './shared';
import { t } from '@/i18n';

export default function OrderEntryScreen() {
  const nav = useNavigate(); const [params] = useSearchParams(); const visitId = params.get('visit') ?? '';
  const visit = useOrderVisit(visitId); const products = useOrderProducts(); const create = useCreateOrder();
  const [productId, setProductId] = useState(''); const [quantity, setQuantity] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const productRetry = useRefetch(products.refetch); const visitRetry = useRefetch(visit.refetch);
  const amount = Number(quantity);
  const valid = !!visit.data && !!products.items.find((p) => p.id === productId) && Number.isSafeInteger(amount) && amount > 0 && amount <= 2147483647;
  const save = (e: FormEvent) => { e.preventDefault(); if (valid && visitId) create.mutate({ id: requestId, visitId, productId, quantity: amount }, { onSuccess: () => nav('/orders', { replace: true }) }); };
  return <div className="page">
    <PageTitle action={<button className="btn sm ghost" onClick={() => nav(-1)}><ArrowRight size={16} className="flip-ltr" /> {t('رجوع')}</button>}>{t('طلب جديد')}</PageTitle>
    {!visitId ? <div className="alert err">{t('الزيارة غير نشطة أو لا تخص حسابك.')}</div>
      : visit.isPending ? <SkeletonList n={2} /> : visit.isError ? <ErrorState error={visit.error} onRetry={visitRetry} />
      : visit.data && <form className="card col" onSubmit={save} data-testid="form-create-order">
        <div className="title">{visit.data.customers?.name ?? t('العميل')} · {fmtDate(visit.data.visit_date)}</div>
        {products.isError ? <ErrorState error={products.error} onRetry={productRetry} /> : <label className="f">{t('المنتج')}
          <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)} required data-testid="select-order-product">
            <option value="">{products.isPending ? t('جاري التحميل...') : t('اختر المنتج')}</option>
            {products.items.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select></label>}
        {!products.isPending && !products.isError && products.items.length === 0 && <div className="alert warn">{t('لا توجد منتجات متاحة.')}</div>}
        <label className="f">{t('الكمية')}<input className="input" type="number" min="1" max="2147483647" step="1" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} required data-testid="input-order-quantity" /></label>
        {create.isError && <div className="alert err" role="alert">{create.error.message || t('تعذر حفظ الطلب.')}</div>}
        <button className="btn" type="submit" disabled={!valid || create.isPending || products.isError} data-testid="button-save-order">
          <ShoppingBag size={18} /> {create.isPending ? t('جاري حفظ الطلب...') : t('حفظ الطلب')}
        </button>
      </form>}
  </div>;
}

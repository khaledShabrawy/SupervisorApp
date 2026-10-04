import { memo, useCallback, useState } from 'react';
import { PackageOpen, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useCreateOrder, useVisitOptions, type OrderRow } from '@/lib/data';
import { useOrdersFiltered, useOrderCount, useOrderProducts } from '@/lib/screen-data';
import { PageTitle } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import { fmtDateTime, num } from '@/lib/format';
import { Chip, SelectOption, useInput, useRefetch } from './shared';

type F = 'all' | 'pending' | 'confirmed' | 'delivered' | 'cancelled';
const FILTERS: [F, string][] = [['all', 'الكل'], ['pending', 'معلقة'], ['confirmed', 'مؤكدة'], ['delivered', 'تم التسليم'], ['cancelled', 'ملغية']];

const Item = memo(function Item({ o }: { o: OrderRow }) {
  return <div className="card row between" data-testid={`card-order-${o.id}`}>
    <div className="grow"><div className="title">{o.customers?.name ?? 'عميل'}</div>
      <div>{o.products?.name ?? 'منتج غير متاح'}</div>
      <div className="muted">الكمية: <b data-testid={`quantity-${o.id}`}>{num(o.quantity)}</b></div>
      <div className="muted">{fmtDateTime(o.created_at)}</div></div>
    <StatusBadge status={o.status} />
  </div>;
});
function NewOrder({ onClose }: { onClose: () => void }) {
  const visits = useVisitOptions(); const products = useOrderProducts(); const m = useCreateOrder();
  const [vid, setVid] = useState(''); const [pid, setPid] = useState(''); const [qty, setQty] = useState('');
  const onVisit = useInput(setVid); const onProduct = useInput(setPid); const onQuantity = useInput(setQty);
  const retryVisits = useRefetch(visits.refetch); const retryProducts = useRefetch(products.refetch);
  const quantity = Number(qty); const visit = visits.data?.find((v) => v.id === vid);
  const product = products.items.find(p => p.id === pid);
  const valid = !!visit && !!product && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 2_147_483_647;
  const save = useCallback(() => { if (valid && visit) m.mutate({ visit, product_id: pid, quantity }, { onSuccess: onClose }); }, [valid, visit, pid, quantity, m, onClose]);
  return <Sheet title="أمر بيع جديد" onClose={onClose}><div className="col">
    {visits.isError ? <ErrorState error={visits.error} onRetry={retryVisits} /> :
      <label className="f">الزيارة (العميل)
        <select className="input" value={vid} onChange={onVisit} data-testid="select-order-visit">
          <option value="">{visits.isPending ? 'جاري التحميل...' : 'اختر زيارة'}</option>
          {visits.data?.map((v) => <SelectOption key={v.id} value={v.id} label={`${v.customers?.name ?? 'عميل'} · ${v.visit_date}`} />)}
        </select></label>}
    {visits.data?.length === 0 && <div className="alert warn">لا توجد زيارات. ابدأ زيارة أولا لربط الطلب بها.</div>}
    {products.isError ? <ErrorState error={products.error} onRetry={retryProducts} /> :
      <label className="f">المنتج<select className="input" value={pid} onChange={onProduct} data-testid="select-order-product">
        <option value="">{products.isPending ? 'جاري تحميل المنتجات...' : 'اختر المنتج'}</option>
        {products.items.map(p => <SelectOption key={p.id} value={p.id} label={p.name} />)}
      </select></label>}
    <LoadMore q={products} />
    {!products.isPending && !products.isError && products.items.length === 0 && <div className="alert warn">لا توجد منتجات متاحة.</div>}
    <label className="f">الكمية<input className="input" type="number" inputMode="numeric" min="1" max="2147483647" step="1" value={qty} onChange={onQuantity} data-testid="input-order-quantity" /></label>
    <button className="btn" disabled={!valid || products.isError || visits.isError || m.isPending} data-testid="button-save-order" onClick={save}>{m.isPending ? 'جاري الحفظ...' : 'حفظ أمر البيع'}</button>
  </div></Sheet>;
}
export default function OrdersScreen() {
  const { supervisor } = useAuth(); const settings = useAppSettings();
  const [f, setF] = useState<F>('all'); const onFilter = useCallback((v: string) => setF(v as F), []); const q = useOrdersFiltered(f); const total = useOrderCount(f);
  const [open, setOpen] = useState(false);
  const retryQ = useRefetch(q.refetch); const retryTotal = useRefetch(total.refetch);
  const show = useCallback(() => setOpen(true), []); const hide = useCallback(() => setOpen(false), []);
  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle action={<button className="btn sm" data-testid="button-new-order" onClick={show}><Plus size={18} /> أمر بيع</button>}>أوامر البيع</PageTitle>
    <div className="card row between"><span className="muted">عدد أوامر البيع</span>
      {total.isPending ? <span className="skel" style={{ width: 90, height: 24 }} /> : total.isError ? <button className="btn sm ghost" onClick={retryTotal}>إعادة المحاولة</button>
        : <b className="big" style={{ fontSize: 22 }} data-testid="text-order-count">{num(total.data ?? 0)}</b>}</div>
    <div className="tabs">{FILTERS.map(([k, l]) => <Chip key={k} value={k} label={l} active={f === k} onSelect={onFilter} testId={`filter-${k}`} />)}</div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retryQ} />
      : q.items.length === 0 ? <EmptyState icon={<PackageOpen />} title="لا توجد أوامر بيع" action={{ label: 'إنشاء أمر بيع', onClick: show }} />
      : <>{(q.items as OrderRow[]).map((o) => <Item key={o.id} o={o} />)}<LoadMore q={q} /></>}
    {open && <NewOrder onClose={hide} />}
  </div>;
}

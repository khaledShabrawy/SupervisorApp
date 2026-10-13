import { useCallback, useState } from 'react';
import { PackageOpen } from '@/components/Icons';
import { PageTitle } from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import { fmtDateTime, num } from '@/lib/format';
import { useMyOrderKpis, useMyOrders, type OrderRow } from '@/lib/screen-orders';
import { Chip, useRefetch } from './shared';
import { t } from '@/i18n';

type Filter = 'all' | 'pending' | 'confirmed' | 'delivered' | 'cancelled';
const FILTERS: [Filter, string][] = [['all', 'الكل'], ['pending', 'معلق'], ['confirmed', 'مؤكد'], ['delivered', 'تم التسليم'], ['cancelled', 'ملغي']];

export default function OrdersScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const onFilter = useCallback((value: string) => setFilter(value as Filter), []);
  const orders = useMyOrders(filter); const kpis = useMyOrderKpis();
  const retryOrders = useRefetch(orders.refetch); const retryKpis = useRefetch(kpis.refetch);
  return <div className="page">
    <PageTitle>{t('الطلبات')}</PageTitle>
    {kpis.isError ? <ErrorState error={kpis.error} onRetry={retryKpis} /> : <div className="s-kpis" aria-label={t('مؤشرات الطلبات')}>
      <div className="card col"><span className="muted">{t('إجمالي الطلبات')}</span>{kpis.isPending ? <div className="skel" style={{ height: 25, width: 65 }} /> : <b className="big">{num(kpis.data?.total ?? 0)}</b>}</div>
      <div className="card col"><span className="muted">{t('تم التسليم')}</span>{kpis.isPending ? <div className="skel" style={{ height: 25, width: 65 }} /> : <b className="big">{num(kpis.data?.delivered ?? 0)}</b>}</div>
      <div className="card col"><span className="muted">{t('نسبة الإنجاز')}</span>{kpis.isPending ? <div className="skel" style={{ height: 25, width: 65 }} /> : <b className="big">{num(Math.round(kpis.data?.completion ?? 0))}%</b>}</div>
    </div>}
    <div className="tabs">{FILTERS.map(([key, label]) => <Chip key={key} value={key} label={t(label)} active={filter === key} onSelect={onFilter} testId={'orders-filter-' + key} />)}</div>
    {orders.isPending ? <SkeletonList /> : orders.isError ? <ErrorState error={orders.error} onRetry={retryOrders} />
      : orders.items.length === 0 ? <div className="card"><EmptyState icon={<PackageOpen />} title={t('لا توجد طلبات')} description={t('ابدأ من زيارة نشطة لإنشاء طلب.')} /></div>
      : <>{(orders.items as OrderRow[]).map((o) => <div className="card row between" key={o.id} data-testid={'card-order-' + o.id}>
          <div className="grow"><div className="title">{o.customers?.name ?? '—'}</div><div>{o.products?.name ?? '—'}</div>
            <div className="muted">{t('الكمية')}: <b>{num(o.quantity)}</b> · {fmtDateTime(o.created_at)}</div></div>
          <StatusBadge status={o.status} />
        </div>)}<LoadMore q={orders} /></>}
  </div>;
}

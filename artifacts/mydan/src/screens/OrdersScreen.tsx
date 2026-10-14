import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronUp, Clock, Package, RefreshCw, Search, ShoppingCart, Store, X } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { PageTitle } from '@/components/Layout';
import { ErrorState, SkeletonList } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import { fmtDate, fmtTime, num } from '@/lib/format';
import { t } from '@/i18n';
import { Chip, useRefetch } from './shared';
import { useSupervisorOrders, type OrderRecord } from '@/lib/screen-orders';

type Period = 'today' | 'week' | 'month' | 'all';
const TABS: [Period, string][] = [
  ['today', 'اليوم'],
  ['week', 'الأسبوع'],
  ['month', 'الشهر'],
  ['all', 'الكل'],
];

const OrderCard = memo(function OrderCard({ order }: { order: OrderRecord }) {
  const [expanded, setExpanded] = useState(false);
  const totalUnits = useMemo(() => order.items.reduce((s, l) => s + l.quantity, 0), [order.items]);

  const isDelivered = order.status === 'delivered';

  return (
    <div
      className="card col"
      style={{
        padding: '14px 16px',
        borderInlineStart: `5px solid ${isDelivered ? 'var(--color-success)' : 'var(--color-warning, #F59E0B)'}`,
      }}
      data-testid={`order-card-${order.id}`}
    >
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title" style={{ fontSize: 16 }}>
            {order.customers?.name ?? t('عميل غير معروف')}
          </div>
          {order.customers?.address && (
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {order.customers.address}
            </div>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            📅 {fmtDate(order.order_date || order.created_at)}
            {order.created_at && ` · ${fmtTime(order.created_at)}`}
          </div>
        </div>

        <div className="col" style={{ alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <span className={`badge ${isDelivered ? 'b-green' : 'b-amber'}`} style={{ fontSize: 12 }}>
            {isDelivered ? `✅ ${t('تم التسليم')}` : `⏳ ${t('قيد المتابعة')}`}
          </span>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--color-primary)' }}>
            {num(order.total_amount)} <span style={{ fontSize: 13, fontWeight: 500 }}>{t('ج.م')}</span>
          </div>
        </div>
      </div>

      <div className="row between" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: 13 }}>
        <span className="muted">
          {t('{n} صنف', { n: num(order.items.length) })} · {t('{n} وحدة', { n: num(totalUnits) })}
        </span>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => setExpanded((x) => !x)}
          style={{ fontSize: 12, padding: '2px 8px', minHeight: 28 }}
        >
          {expanded ? t('إخفاء التفاصيل') : t('عرض الأصناف')}
        </button>
      </div>

      {expanded && (
        <div className="col" style={{ marginTop: 8, gap: 6, background: '#F8FAFC', padding: 10, borderRadius: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--muted)' }}>{t('الأصناف المطلوبة')}:</div>
          {order.items.map((it, idx) => (
            <div key={idx} className="row between" style={{ fontSize: 13, padding: '2px 0' }}>
              <span>{it.name} × {num(it.quantity)}</span>
              <span style={{ fontWeight: 600 }}>{num(it.unit_price * it.quantity)} {t('ج.م')}</span>
            </div>
          ))}

          {order.notes && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)', borderTop: '1px dashed var(--line)', paddingTop: 4 }}>
              💬 {t('ملاحظات')}: {order.notes}
            </div>
          )}

          {isDelivered && order.delivered_at && (
            <div style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600 }}>
              🎉 {t('تم تأكيد التسليم في')}: {fmtDate(order.delivered_at)}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default function OrdersScreen() {
  const nav = useNavigate();
  const { supervisor } = useAuth();
  const settings = useAppSettings();

  const [period, setPeriod] = useState<Period>('today');
  const [search, setSearch] = useState('');

  const q = useSupervisorOrders(period);
  const retry = useRefetch(q.refetch);

  const filteredOrders = useMemo(() => {
    if (!q.data) return [];
    if (!search.trim()) return q.data;
    const term = search.trim().toLowerCase();
    return q.data.filter((o) =>
      o.customers?.name?.toLowerCase().includes(term) ||
      o.notes?.toLowerCase().includes(term) ||
      o.items.some((it) => it.name.toLowerCase().includes(term))
    );
  }, [q.data, search]);

  const kpi = q.kpi;

  return (
    <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
      <PageTitle
        action={
          <button className="icon-btn" aria-label={t('تحديث')} onClick={retry} data-testid="button-refresh-orders">
            <RefreshCw className={q.isFetching ? 's-spin' : ''} />
          </button>
        }
      >
        {t('أوردراتي (الفرص البيعية)')}
      </PageTitle>

      {/* KPI Performance Bar */}
      <div className="card col" style={{ padding: 14, gap: 10, background: 'linear-gradient(135deg, #0F1B2D 0%, #1A2E4C 100%)', color: '#fff' }}>
        <div className="row between">
          <div style={{ fontWeight: 700, fontSize: 15 }}>📊 {t('مؤشرات إنجاز الأوردرات')}</div>
          <span className="badge" style={{ background: kpi.deliveryRate === 100 ? '#10B981' : kpi.deliveryRate > 0 ? '#F59E0B' : '#EF4444', color: '#fff', fontWeight: 800 }}>
            {t('نسبة الإنجاز: {n}%', { n: num(kpi.deliveryRate) })}
          </span>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' }}>
          <div
            style={{
              width: `${Math.min(100, kpi.deliveryRate)}%`,
              height: '100%',
              background: kpi.deliveryRate === 100 ? '#10B981' : '#3B82F6',
              transition: 'width 0.4s ease',
            }}
          />
        </div>

        <div className="row" style={{ gap: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="col" style={{ background: 'rgba(255,255,255,0.08)', padding: '8px 10px', borderRadius: 8, alignItems: 'center', textAlign: 'center' }}>
            <span style={{ fontSize: 11, opacity: 0.8 }}>{t('إجمالي المسجل')}</span>
            <strong style={{ fontSize: 16 }}>{num(kpi.totalOrders)}</strong>
            <span style={{ fontSize: 11, opacity: 0.8 }}>{num(kpi.totalAmount)} {t('ج.م')}</span>
          </div>

          <div className="col" style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16,185,129,0.3)', padding: '8px 10px', borderRadius: 8, alignItems: 'center', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: '#6EE7B7' }}>{t('تم التسليم')}</span>
            <strong style={{ fontSize: 16, color: '#10B981' }}>{num(kpi.deliveredOrders)}</strong>
            <span style={{ fontSize: 11, color: '#6EE7B7' }}>{num(kpi.deliveredAmount)} {t('ج.م')}</span>
          </div>

          <div className="col" style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245,158,11,0.3)', padding: '8px 10px', borderRadius: 8, alignItems: 'center', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: '#FCD34D' }}>{t('قيد المتابعة')}</span>
            <strong style={{ fontSize: 16, color: '#F59E0B' }}>{num(kpi.pendingOrders)}</strong>
            <span style={{ fontSize: 11, color: '#FCD34D' }}>{num(kpi.pendingAmount)} {t('ج.م')}</span>
          </div>
        </div>

        <div style={{ fontSize: 11.5, opacity: 0.75, textAlign: 'center' }}>
          💡 {t('تسجيل الأوردرات كفرص بيعية لا يمنح نسبة إنجاز إلا بعد تأكيد التسليم في لوحة التحكم')}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <Chip
            key={k}
            role="tab"
            value={k}
            label={t(l)}
            active={period === k}
            onSelect={(v) => setPeriod(v as Period)}
            testId={`tab-orders-${k}`}
          />
        ))}
      </div>

      {/* Search Bar */}
      <div className="row" style={{ position: 'relative' }}>
        <input
          className="input grow"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('بحث باسم العميل أو الصنف...')}
          style={{ paddingInlineStart: 38 }}
        />
        <Search size={18} style={{ position: 'absolute', top: 12, insetInlineStart: 12, color: 'var(--muted)', pointerEvents: 'none' }} />
        {search && (
          <button className="icon-btn" style={{ position: 'absolute', top: 8, insetInlineEnd: 8 }} onClick={() => setSearch('')}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* List */}
      {q.isPending ? (
        <SkeletonList n={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={retry} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart />}
          title={search ? t('لا توجد نتائج بحث') : t('لا توجد أوردرات مسجلة')}
          text={
            search
              ? t('لا يوجد عميل يطابق بحثك.')
              : t('أثناء زيارتك للعميل، يمكنك تسجيل فرصة بيعية من زر "تسجيل أوردر" داخل الزيارة.')
          }
          action={{
            label: t('الذهاب للزيارات'),
            onClick: () => nav('/visits'),
          }}
        />
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {filteredOrders.map((ord) => (
            <OrderCard key={ord.id} order={ord} />
          ))}
        </div>
      )}
    </div>
  );
}

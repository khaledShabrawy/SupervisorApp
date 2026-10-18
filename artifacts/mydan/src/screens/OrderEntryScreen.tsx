import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCheck, Package, Plus, Search, ShoppingCart, X, XCircle } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { PageTitle } from '@/components/Layout';
import { ErrorState, SkeletonList } from '@/components/States';
import EmptyState from '@/components/EmptyState';
import { fmtDate, num } from '@/lib/format';
import { t } from '@/i18n';
import { useProductsWithPrices, useSaveOrder, formatOrderWhatsAppMessage, openWhatsAppShare, type OrderLineItem, type PricedProduct } from '@/lib/screen-orders';

const ProductRow = memo(function ProductRow({
  product,
  qty,
  unit,
  onInc,
  onDec,
  onSetUnit,
  onRemove,
}: {
  product: PricedProduct;
  qty: number;
  unit: 'قطعة' | 'كرتونة';
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onSetUnit: (id: string, unit: 'قطعة' | 'كرتونة') => void;
  onRemove: (id: string) => void;
}) {
  const inc = useCallback(() => onInc(product.id), [onInc, product.id]);
  const dec = useCallback(() => onDec(product.id), [onDec, product.id]);
  const remove = useCallback(() => onRemove(product.id), [onRemove, product.id]);

  const hasCarton = Boolean(product.units_per_carton && product.units_per_carton > 1);
  const factor = unit === 'كرتونة' && hasCarton ? product.units_per_carton! : 1;
  const currentPrice = unit === 'كرتونة' && hasCarton
    ? (product.carton_price || product.unit_price * factor)
    : product.unit_price;

  return (
    <div className="card col" style={{ padding: 12, borderRight: qty > 0 ? '4px solid var(--color-primary)' : '1px solid var(--line)' }} data-testid={`order-product-${product.id}`}>
      <div className="row between">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title" style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {product.item_code && <span className="badge b-blue" style={{ fontFamily: 'monospace', fontSize: 11, padding: '1px 6px' }}>{product.item_code}</span>}
            <span>{product.name}</span>
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {currentPrice > 0 ? `${num(currentPrice)} ${t('ج.م')}` : t('بلا سعر')}
            {unit === 'كرتونة' ? ` / ${t('كرتونة')}` : ` / ${product.unit || t('قطعة')}`}
            {hasCarton && unit === 'كرتونة' && (
              <span className="badge b-gray" style={{ marginInlineStart: 6, fontSize: 11 }}>
                ({product.units_per_carton} {product.unit || t('قطعة')} / كرتونة)
              </span>
            )}
            {product.master_brand ? ` · ${product.master_brand}` : product.sku ? ` · ${product.sku}` : ''}
          </div>
        </div>
        {qty > 0 && (
          <button className="icon-btn" aria-label={t('حذف')} onClick={remove} style={{ color: 'var(--color-danger)' }}>
            <XCircle size={18} />
          </button>
        )}
      </div>

      {/* Unit Selector: قطعة vs كرتونة */}
      {hasCarton && (
        <div className="row gap-2" style={{ marginTop: 8 }}>
          <button
            type="button"
            className={`btn sm ${unit === 'قطعة' ? 'primary' : 'ghost'}`}
            style={{ fontSize: 12, padding: '2px 10px', height: 28 }}
            onClick={() => onSetUnit(product.id, 'قطعة')}
          >
            {product.unit || t('قطعة')}
          </button>
          <button
            type="button"
            className={`btn sm ${unit === 'كرتونة' ? 'primary' : 'ghost'}`}
            style={{ fontSize: 12, padding: '2px 10px', height: 28 }}
            onClick={() => onSetUnit(product.id, 'كرتونة')}
          >
            📦 {t('كرتونة ({n} ق)', { n: product.units_per_carton ?? 1 })}
          </button>
        </div>
      )}

      <div className="row between" style={{ marginTop: 8, gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm ghost" style={{ minWidth: 44, padding: '0 12px' }} onClick={dec} disabled={qty === 0} aria-label={t('تقليل')}>
            <X size={18} />
          </button>
          <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 700, fontSize: 18, color: qty > 0 ? 'var(--color-primary)' : 'var(--muted)' }}>
            {num(qty)}
          </span>
          <button className="btn sm" style={{ minWidth: 44, padding: '0 12px' }} onClick={inc} aria-label={t('زيادة')}>
            <Plus size={18} />
          </button>
        </div>
        {qty > 0 && (
          <div style={{ textAlign: 'end' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-primary)' }}>
              = {num(currentPrice * qty)} {t('ج.م')}
            </div>
            {unit === 'كرتونة' && hasCarton && (
              <div className="muted" style={{ fontSize: 11 }}>
                ({num(qty * factor)} {product.unit || t('قطعة')})
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default function OrderEntryScreen() {
  const nav = useNavigate();
  const { supervisor } = useAuth();
  const settings = useAppSettings();
  const [params] = useSearchParams();

  const visitId = params.get('visit') ?? '';
  const customerId = params.get('customer') ?? '';
  const customerType = params.get('type') ?? null;
  const customerName = params.get('name') ?? t('العميل');

  const products = useProductsWithPrices(customerType);
  const save = useSaveOrder();

  const [itemsMap, setItemsMap] = useState<Record<string, { qty: number; unit: 'قطعة' | 'كرتونة' }>>({});
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);

  const inc = useCallback((id: string) => setItemsMap((prev) => {
    const cur = prev[id] ?? { qty: 0, unit: 'قطعة' };
    return { ...prev, [id]: { ...cur, qty: cur.qty + 1 } };
  }), []);

  const dec = useCallback((id: string) => setItemsMap((prev) => {
    const cur = prev[id];
    if (!cur) return prev;
    if (cur.qty <= 1) {
      const { [id]: _, ...rest } = prev;
      return rest;
    }
    return { ...prev, [id]: { ...cur, qty: cur.qty - 1 } };
  }), []);

  const setUnit = useCallback((id: string, unit: 'قطعة' | 'كرتونة') => setItemsMap((prev) => {
    const cur = prev[id] ?? { qty: 0, unit: 'قطعة' };
    return { ...prev, [id]: { ...cur, unit } };
  }), []);

  const remove = useCallback((id: string) => setItemsMap((prev) => {
    const { [id]: _, ...rest } = prev;
    return rest;
  }), []);

  const lines = useMemo<OrderLineItem[]>(() => {
    if (!products.data) return [];
    return products.data
      .filter((p) => (itemsMap[p.id]?.qty ?? 0) > 0)
      .map((p) => {
        const item = itemsMap[p.id];
        const isCarton = item.unit === 'كرتونة';
        const factor = isCarton ? (p.units_per_carton && p.units_per_carton > 1 ? p.units_per_carton : 1) : 1;
        const price = isCarton
          ? (p.carton_price || p.unit_price * factor)
          : p.unit_price;

        return {
          product_id: p.id,
          name: p.name,
          unit_price: price,
          quantity: item.qty,
          unit: item.unit,
          units_per_carton: p.units_per_carton || 1,
          total_pieces: item.qty * factor,
        };
      });
  }, [products.data, itemsMap]);

  const total = useMemo(() => lines.reduce((s, l) => s + l.unit_price * l.quantity, 0), [lines]);
  const totalUnits = useMemo(() => lines.reduce((s, l) => s + (l.total_pieces ?? l.quantity), 0), [lines]);

  const filteredProducts = useMemo(() => {
    if (!products.data) return [];
    if (!search.trim()) return products.data;
    const s = search.trim().toLowerCase();
    return products.data.filter((p) =>
      p.name.toLowerCase().includes(s) ||
      (p.sku && p.sku.toLowerCase().includes(s)) ||
      (p.item_code && p.item_code.toLowerCase().includes(s)) ||
      (p.master_brand && p.master_brand.toLowerCase().includes(s)) ||
      (p.sub_brand && p.sub_brand.toLowerCase().includes(s)) ||
      (p.category && p.category.toLowerCase().includes(s))
    );
  }, [products.data, search]);

  const submit = useCallback(() => {
    if (!visitId || !customerId || lines.length === 0) return;
    save.mutate(
      { visitId, customerId, lines, notes },
      { onSuccess: () => setSaved(true) }
    );
  }, [visitId, customerId, lines, notes, save]);

  const refetch = useCallback(() => { void products.refetch(); }, [products]);

  if (saved) {
    return (
      <div className="page" aria-label={settings.app_name}>
        <PageTitle>{t('تسجيل الأوردر')}</PageTitle>
        <div className="card col" style={{ alignItems: 'center', padding: 32, gap: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>📦</div>
          <div className="title" style={{ fontSize: 20 }}>{t('تم تسجيل فرصة البيع بنجاح!')}</div>
          <div className="muted">{t('تم تسجيل طلب العميل كأوردر قيد الانتظار لمندوب المبيعات.')}</div>
          <div className="card col" style={{ width: '100%', background: '#F8FAFC', padding: 16, gap: 6, margin: '8px 0' }}>
            <div className="row between"><span className="muted">{t('العميل')}:</span><strong>{customerName}</strong></div>
            <div className="row between"><span className="muted">{t('عدد الأصناف')}:</span><strong>{num(lines.length)} {t('صنف')} ({num(totalUnits)} {t('وحدة')})</strong></div>
            <div className="row between"><span className="muted">{t('الإجمالي')}:</span><strong style={{ color: 'var(--color-primary)', fontSize: 18 }}>{num(total)} {t('ج.م')}</strong></div>
          </div>
          <div className="card col" style={{ width: '100%', padding: 14, background: '#F0FDF4', border: '1px solid #BBF7D0', gap: 10, borderRadius: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#166534' }}>
              💬 {t('إرسال تفاصيل الفرصة للمندوب الآن:')}
            </div>
            <button
              type="button"
              className="btn block"
              style={{
                background: '#25D366',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: 15,
                padding: '12px 16px',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
              onClick={() => {
                const msg = formatOrderWhatsAppMessage({
                  customerName,
                  supervisorName: supervisor?.full_name,
                  supervisorPhone: supervisor?.phone,
                  items: lines,
                  totalAmount: total,
                  notes,
                }, settings.app_name);
                openWhatsAppShare(msg);
              }}
            >
              <span style={{ fontSize: 18 }}>💬</span> {t('إرسال تفاصيل الفرصة للمندوب عبر واتساب')}
            </button>
          </div>
          <div className="alert ok" style={{ fontSize: 13, width: '100%' }}>
            💡 {t('بعد تسليم المندوب للبضاعة، يتم تأكيد التسليم في لوحة التحكم لتصل إنتاجيتك إلى 100%')}
          </div>
          <div className="row" style={{ width: '100%', gap: 10 }}>
            {visitId && (
              <button className="btn grow" onClick={() => nav(`/visits/${visitId}`, { replace: true })}>
                <ArrowRight size={16} className="flip-ltr" /> {t('العودة للزيارة')}
              </button>
            )}
            <button className="btn ghost grow" onClick={() => { setItemsMap({}); setNotes(''); setSaved(false); }}>
              {t('أوردر آخر')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
      <PageTitle>{t('تسجيل أوردر')}</PageTitle>

      <div className="card col" style={{ padding: '12px 16px', gap: 4 }}>
        <div className="row between">
          <div className="title" style={{ fontSize: 16 }}>{customerName}</div>
          <span className="badge b-blue">{t('فرصة بيعية')}</span>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          📅 {fmtDate(new Date().toISOString())} · {t('طلب عميل أثناء الزيارة')}
        </div>
      </div>

      <div className="row" style={{ position: 'relative' }}>
        <input
          className="input grow"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('بحث عن صنف بالاسم أو الكود...')}
          style={{ paddingInlineStart: 38 }}
        />
        <Search size={18} style={{ position: 'absolute', top: 12, insetInlineStart: 12, color: 'var(--muted)', pointerEvents: 'none' }} />
        {search && (
          <button className="icon-btn" style={{ position: 'absolute', top: 8, insetInlineEnd: 8 }} onClick={() => setSearch('')}>
            <X size={16} />
          </button>
        )}
      </div>

      {products.isPending ? (
        <SkeletonList n={4} />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={refetch} />
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title={search ? t('لا توجد نتائج بحث') : t('لا توجد منتجات')}
          text={search ? t('جرب البحث بكلمة أخرى.') : t('لم يتم إضافة منتجات لشركتك بعد.')}
        />
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {filteredProducts.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              qty={itemsMap[p.id]?.qty ?? 0}
              unit={itemsMap[p.id]?.unit ?? 'قطعة'}
              onInc={inc}
              onDec={dec}
              onSetUnit={setUnit}
              onRemove={remove}
            />
          ))}
        </div>
      )}

      <label className="f" style={{ marginTop: 8 }}>
        {t('ملاحظات المندوب والتسليم (اختياري)')}
        <textarea
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('أي تعليمات خاصة للمندوب أو مواعيد مفضلة للتسليم...')}
        />
      </label>

      {/* Sticky Bottom Order Summary & Submit Bar */}
      <div style={{ position: 'sticky', bottom: 'calc(var(--bottom-nav-height) + var(--sab) + 8px)', background: 'var(--color-bg)', padding: '10px 0', zIndex: 10 }}>
        <div className="card row between" style={{ padding: '12px 16px', border: lines.length > 0 ? '1.5px solid var(--color-primary)' : '1px solid var(--line)' }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>{t('إجمالي الأوردر')}</div>
            <div className="big" style={{ color: lines.length > 0 ? 'var(--color-primary)' : 'var(--muted)', fontSize: 22, fontWeight: 800 }}>
              {num(total)} <span style={{ fontSize: 15 }}>{t('ج.م')}</span>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 13, textAlign: 'end' }}>
            <div>{t('{n} صنف', { n: num(lines.length) })}</div>
            <div>{t('{n} وحدة', { n: num(totalUnits) })}</div>
          </div>
        </div>

        <button
          className="btn success block"
          style={{ marginTop: 8 }}
          disabled={lines.length === 0 || save.isPending || !visitId}
          onClick={submit}
          data-testid="button-submit-order"
        >
          <ShoppingCart size={18} />
          {save.isPending ? t('جاري الحفظ...') : t('تأكيد وتسجيل الأوردر')}
        </button>

        {!visitId && (
          <div className="alert warn" style={{ marginTop: 8, fontSize: 13 }}>
            ⚠️ {t('يجب فتح هذه الشاشة من داخل زيارة نشطة لربط الأوردر بالعميل.')}
          </div>
        )}
      </div>
    </div>
  );
}

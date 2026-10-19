import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useScope } from '@/lib/data';
import { notify } from '@/lib/toast';
import { fmtDate, num } from '@/lib/format';
import { enqueueOfflineAction } from './offline-sync';
import { t } from '@/i18n';

export interface OrderLineItem {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  unit?: string;
  units_per_carton?: number;
  total_pieces?: number;
}

export interface OrderRecord {
  id: string;
  visit_id: string;
  supervisor_id: string;
  customer_id: string;
  company_id: string;
  items: OrderLineItem[];
  total_amount: number;
  status: 'pending' | 'delivered' | 'cancelled';
  notes: string | null;
  order_date: string;
  delivered_at: string | null;
  created_at: string;
  customers?: {
    id: string;
    name: string;
    address?: string | null;
    customer_type?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    branch?: string | null;
    customer_code?: string | null;
  } | null;
  supervisors?: { id: string; full_name: string; phone?: string | null; branch_id?: string | null } | null;
}

export interface PricedProduct {
  id: string;
  name: string;
  category?: string | null;
  sku?: string | null;
  item_code?: string | null;
  master_brand?: string | null;
  sub_brand?: string | null;
  unit?: string | null;
  unit_price: number;
  units_per_carton?: number;
  carton_price?: number;
  is_active: boolean;
}

export interface OrdersKPI {
  totalOrders: number;
  totalAmount: number;
  deliveredOrders: number;
  deliveredAmount: number;
  pendingOrders: number;
  pendingAmount: number;
  deliveryRate: number; // percentage 0 - 100
}

export function computeOrdersKPI(orders: OrderRecord[]): OrdersKPI {
  let totalOrders = 0;
  let totalAmount = 0;
  let deliveredOrders = 0;
  let deliveredAmount = 0;
  let pendingOrders = 0;
  let pendingAmount = 0;

  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const amount = Number(o.total_amount) || 0;
    totalOrders += 1;
    totalAmount += amount;
    if (o.status === 'delivered') {
      deliveredOrders += 1;
      deliveredAmount += amount;
    } else {
      pendingOrders += 1;
      pendingAmount += amount;
    }
  }

  const deliveryRate = totalOrders === 0 ? 0 : Math.round((deliveredOrders / totalOrders) * 100);

  return {
    totalOrders,
    totalAmount,
    deliveredOrders,
    deliveredAmount,
    pendingOrders,
    pendingAmount,
    deliveryRate,
  };
}

/** Formats a rich, professional Arabic WhatsApp dispatch message for sales opportunities */
export function formatOrderWhatsAppMessage(
  order: {
    customerName?: string;
    customerAddress?: string | null;
    supervisorName?: string;
    supervisorPhone?: string | null;
    orderDate?: string;
    items: OrderLineItem[];
    totalAmount: number;
    notes?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  appName = 'ميدان'
): string {
  const itemsText = order.items
    .map((it, idx) => {
      const unitLabel = it.unit || 'قطعة';
      const convText =
        it.unit === 'كرتونة' && it.units_per_carton && it.units_per_carton > 1
          ? ` (تعادل ${num(it.quantity * it.units_per_carton)} قطعة)`
          : '';
      return `  ${idx + 1}. *${it.name}* : ${num(it.quantity)} ${unitLabel}${convText} × ${num(it.unit_price)} ج.م = ${num(it.quantity * it.unit_price)} ج.م`;
    })
    .join('\n');

  const mapsLink =
    order.latitude != null && order.longitude != null
      ? `\n📍 *موقع العميل:* https://www.google.com/maps/search/?api=1&query=${order.latitude},${order.longitude}`
      : '';

  const address = order.customerAddress ? `\n🏢 *العنوان:* ${order.customerAddress}` : '';
  const supInfo = order.supervisorName
    ? `\n👤 *المشرف الراصد:* ${order.supervisorName}${order.supervisorPhone ? ` (${order.supervisorPhone})` : ''}`
    : '';
  const notesText = order.notes?.trim() ? `\n📝 *ملاحظات المشرف:* ${order.notes}` : '';

  return `🎯 *فرصة بيعية ميدانية (${appName})*
----------------------------------------
🏪 *العميل:* ${order.customerName || 'عميل'}${address}${mapsLink}${supInfo}
📅 *التاريخ:* ${order.orderDate ? fmtDate(order.orderDate) : fmtDate(new Date().toISOString())}

🛒 *الأصناف والكميات المطلوبة:*
${itemsText}

💰 *إجمالي القيمة التقديرية:* ${num(order.totalAmount)} ج.م${notesText}
----------------------------------------
⚡ *تنبيه للمندوب:* يرجى سرعة التواصل مع العميل وتوريد الطلب.`;
}

/** Opens WhatsApp Web or native app with pre-filled message */
export function openWhatsAppShare(text: string, phone?: string) {
  const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
  const url = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function useProductsWithPrices(customerType: string | null) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'products-with-prices', customerType ?? 'all'],
    queryFn: async () => {
      // 1. Attempt full column selection
      let productsRes: any = await supabase
        .from('products')
        .select('id,name,category,sku_code,item_code,master_brand,sub_brand,price,unit,units_per_carton,carton_price,is_active')
        .eq('company_id', sc.companyId)
        .eq('is_active', true)
        .order('name');

      // Fallback if brand/item_code migration not yet applied
      if (productsRes.error) {
        productsRes = await supabase
          .from('products')
          .select('id,name,category,price,is_active')
          .eq('company_id', sc.companyId)
          .eq('is_active', true)
          .order('name');
      }

      // Final fallback if column naming differs or table unpopulated per company
      if (productsRes.error) {
        productsRes = await supabase
          .from('products')
          .select('id,name,category,is_active')
          .eq('company_id', sc.companyId)
          .eq('is_active', true)
          .limit(100);
      }

      const products = productsRes.data ?? [];

      // 2. Fetch prices from price_lists or fallback to price_list
      const priceMap = new Map<string, number>();
      try {
        let pricesRes = await supabase
          .from('price_lists')
          .select('product_id,customer_type,unit_price')
          .eq('company_id', sc.companyId);

        if (pricesRes.error) {
          pricesRes = await supabase
            .from('price_list')
            .select('product_id,customer_type,unit_price')
            .eq('company_id', sc.companyId);
        }

        const prices = pricesRes.data;
        if (prices && prices.length > 0) {
          for (const p of prices) {
            if (p.customer_type === customerType || p.customer_type === 'default') {
              if (!priceMap.has(p.product_id)) priceMap.set(p.product_id, Number(p.unit_price) || 0);
            }
          }
          for (const p of prices) {
            if (!priceMap.has(p.product_id)) priceMap.set(p.product_id, Number(p.unit_price) || 0);
          }
        }
      } catch {
        // rely on product.price
      }

      return products.map((prod: any) => {
        const basePrice = priceMap.get(prod.id) ?? (Number(prod.price) || 0);
        const upc = Math.max(1, Number(prod.units_per_carton) || 1);
        const cp = Number(prod.carton_price) || (basePrice * upc);
        return {
          id: prod.id,
          name: prod.name,
          category: prod.category ?? null,
          sku: prod.item_code || prod.sku_code || prod.sku || null,
          item_code: prod.item_code || prod.sku_code || null,
          master_brand: prod.master_brand ?? null,
          sub_brand: prod.sub_brand ?? null,
          unit: prod.unit ?? 'قطعة',
          unit_price: basePrice,
          units_per_carton: upc,
          carton_price: cp,
          is_active: prod.is_active !== false,
        };
      }) as PricedProduct[];
    },
  });
}

function parseOrderItems(raw: any, totalAmount?: number): OrderLineItem[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item) => ({
      product_id: item.product_id || '',
      name: item.name || t('منتج غير معروف'),
      unit_price: Number(item.unit_price) || 0,
      quantity: Number(item.quantity) || 1,
      unit: item.unit || 'قطعة',
      units_per_carton: Number(item.units_per_carton) || 1,
      total_pieces: Number(item.total_pieces) || (Number(item.quantity) || 1) * (Number(item.units_per_carton) || 1),
    }));
  }
  return [];
}

export function useSupervisorOrders(period: 'today' | 'week' | 'month' | 'all' = 'today') {
  const sc = useScope();
  const query = useQuery({
    queryKey: [...sc.base, 'supervisor-orders', sc.supervisorId, period],
    queryFn: async () => {
      let q = supabase
        .from('orders')
        .select(`
          id, visit_id, supervisor_id, customer_id, company_id,
          items, total_amount, status, notes, order_date, delivered_at, created_at,
          customers (id, name, address, customer_type, latitude, longitude)
        `)
        .eq('company_id', sc.companyId)
        .eq('supervisor_id', sc.supervisorId)
        .order('created_at', { ascending: false });

      const now = new Date();
      if (period === 'today') {
        const todayStr = now.toISOString().slice(0, 10);
        q = q.gte('created_at', `${todayStr}T00:00:00`);
      } else if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        q = q.gte('created_at', `${weekAgo}T00:00:00`);
      } else if (period === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        q = q.gte('created_at', `${monthAgo}T00:00:00`);
      }

      const { data, error } = await q.limit(200);
      if (error) throw new Error(t('تعذر تحميل أوردرات المشرف.'));

      return (data ?? []).map((row: any) => ({
        ...row,
        total_amount: Number(row.total_amount) || 0,
        items: parseOrderItems(row.items, row.total_amount),
      })) as OrderRecord[];
    },
  });

  const kpi = useMemo(() => computeOrdersKPI(query.data ?? []), [query.data]);

  return { ...query, kpi };
}

export function useVisitOrders(visitId: string) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'visit-orders', visitId],
    enabled: Boolean(visitId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, visit_id, supervisor_id, customer_id, company_id,
          items, total_amount, status, notes, order_date, delivered_at, created_at,
          customers!customer_id (id, name, address, customer_type, latitude, longitude)
        `)
        .eq('visit_id', visitId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(t('تعذر تحميل أوردرات الزيارة.'));

      return (data ?? []).map((row: any) => ({
        ...row,
        total_amount: Number(row.total_amount) || 0,
        items: parseOrderItems(row.items, row.total_amount),
      })) as OrderRecord[];
    },
  });
}

export interface AdminOrdersFilter {
  status?: string;
  supervisorId?: string;
  branchId?: string;
  regionId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export function useAdminOrders(filter?: AdminOrdersFilter) {
  const sc = useScope();
  const query = useQuery({
    queryKey: [
      ...sc.base,
      'admin-orders',
      filter?.status ?? 'all',
      filter?.supervisorId ?? 'all',
      filter?.branchId ?? 'all',
      filter?.regionId ?? 'all',
      filter?.dateFrom ?? '',
      filter?.dateTo ?? '',
    ],
    queryFn: async () => {
      let q = supabase
        .from('orders')
        .select(`
          id, visit_id, supervisor_id, customer_id, company_id,
          items, total_amount, status, notes, order_date, delivered_at, created_at,
          customers!customer_id (id, name, address, customer_type, latitude, longitude, branch, customer_code),
          supervisors!supervisor_id (id, full_name, phone, branch_id)
        `)
        .eq('company_id', sc.companyId)
        .order('created_at', { ascending: false });

      if (filter?.status && filter.status !== 'all') {
        q = q.eq('status', filter.status);
      }
      if (filter?.supervisorId && filter.supervisorId !== 'all') {
        q = q.eq('supervisor_id', filter.supervisorId);
      }
      if (filter?.dateFrom) {
        q = q.gte('order_date', filter.dateFrom);
      }
      if (filter?.dateTo) {
        q = q.lte('order_date', filter.dateTo);
      }

      const { data, error } = await q.limit(500);
      if (error) {
        if (error.code === '42703' || error.message?.includes('items') || error.message?.includes('total_amount')) {
          throw new Error('يرجى تطبيق ملف التحديث (10_orders_opportunity.sql) في Supabase SQL Editor لتفعيل حقول الأوردرات.');
        }
        throw new Error(error.message || t('تعذر تحميل جدول أوردرات الشركة.'));
      }

      let orders = (data ?? []).map((row: any) => ({
        ...row,
        total_amount: Number(row.total_amount) || 0,
        items: parseOrderItems(row.items, row.total_amount),
      })) as OrderRecord[];

      if (filter?.branchId && filter.branchId !== 'all') {
        orders = orders.filter((o) => o.supervisors?.branch_id === filter.branchId);
      }

      if (filter?.regionId && filter.regionId !== 'all') {
        const { data: regionBranches } = await supabase
          .from('branches')
          .select('id')
          .eq('company_id', sc.companyId)
          .eq('region', filter.regionId);
        const regionBranchIds = new Set((regionBranches ?? []).map((b: any) => b.id));
        orders = regionBranchIds.size > 0
          ? orders.filter((o) => o.supervisors?.branch_id && regionBranchIds.has(o.supervisors.branch_id))
          : [];
      }


      return orders;
    },
  });

  const filteredData = useMemo(() => {
    let list = query.data ?? [];
    if (filter?.search && filter.search.trim()) {
      const term = filter.search.trim().toLowerCase();
      list = list.filter((o) =>
        o.customers?.name?.toLowerCase().includes(term) ||
        o.customers?.customer_code?.toLowerCase().includes(term) ||
        o.supervisors?.full_name?.toLowerCase().includes(term) ||
        o.notes?.toLowerCase().includes(term)
      );
    }
    return list;
  }, [query.data, filter?.search]);

  const kpi = useMemo(() => computeOrdersKPI(filteredData), [filteredData]);

  return { ...query, data: filteredData, allOrders: query.data ?? [], kpi };
}

export function useSaveOrder() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      visitId,
      customerId,
      lines,
      notes,
    }: {
      visitId: string;
      customerId: string;
      lines: OrderLineItem[];
      notes: string;
    }) => {
      const total = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);
      const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
      const primaryProductId = lines[0]?.product_id || null;

      const payload: Record<string, any> = {
        visit_id: visitId,
        supervisor_id: sc.supervisorId,
        customer_id: customerId,
        company_id: sc.companyId,
        items: lines,
        total_amount: total,
        notes: notes.trim() || null,
        order_date: new Date().toISOString().slice(0, 10),
        status: 'pending',
      };

      if (primaryProductId) {
        payload.product_id = primaryProductId;
        payload.quantity = totalQty;
      }

      if (!navigator.onLine) {
        enqueueOfflineAction({
          type: 'save_order',
          companyId: sc.companyId,
          supervisorId: sc.supervisorId,
          payload,
        });
        return total;
      }

      const { error } = await supabase.from('orders').insert(payload);
      if (error) {
        throw new Error(error.message || t('تعذر حفظ الأوردر. تحقق من الصلاحيات أو تواصل مع المدير.'));
      }
      return total;
    },
    onSuccess: (total) => {
      const msg = navigator.onLine
        ? `✅ ${t('تم تسجيل الأوردر بنجاح — الإجمالي:')} ${num(total)} ${t('ج.م')}`
        : `📶 ${t('تم حفظ الأوردر محلياً دون اتصال — الإجمالي:')} ${num(total)} ${t('ج.م. اضغط "رفع البيانات" عند توفر الشبكة')}`;
      notify(msg, 'success');
      qc.invalidateQueries({ queryKey: [...sc.base, 'supervisor-orders'] });
      qc.invalidateQueries({ queryKey: [...sc.base, 'admin-orders'] });
      qc.invalidateQueries({ queryKey: [...sc.base, 'visit-orders'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function useUpdateOrderStatus() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: 'pending' | 'delivered' | 'cancelled';
    }) => {
      const patch: Record<string, any> = {
        status,
        delivered_at: status === 'delivered' ? new Date().toISOString() : null,
      };

      const { error } = await supabase
        .from('orders')
        .update(patch)
        .eq('id', id)
        .eq('company_id', sc.companyId);

      if (error) throw new Error(`${t('تعذر تحديث حالة الأوردر')}: ${error.message}`);
      return status;
    },
    onSuccess: (status) => {
      if (status === 'delivered') {
        notify(`🎉 ${t('تم تأكيد تسليم الأوردر — الإنتاجية 100%!')}`, 'success');
      } else {
        notify(t('تم تحديث حالة الأوردر'), 'success');
      }
      qc.invalidateQueries({ queryKey: [...sc.base, 'supervisor-orders'] });
      qc.invalidateQueries({ queryKey: [...sc.base, 'admin-orders'] });
      qc.invalidateQueries({ queryKey: [...sc.base, 'visit-orders'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

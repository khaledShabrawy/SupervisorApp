import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useScope } from '@/lib/data';
import { notify } from '@/lib/toast';
import { num } from '@/lib/format';
import { t } from '@/i18n';

export interface OrderLineItem {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
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
  customers?: { id: string; name: string; address?: string | null; customer_type?: string | null } | null;
  supervisors?: { id: string; full_name: string; phone?: string | null } | null;
}

export interface PricedProduct {
  id: string;
  name: string;
  category?: string | null;
  sku?: string | null;
  unit?: string | null;
  unit_price: number;
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

export function useProductsWithPrices(customerType: string | null) {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'products-with-prices', customerType ?? 'all'],
    queryFn: async () => {
      const { data: products, error: pErr } = await supabase
        .from('products')
        .select('id,name,category,sku,unit,is_active')
        .eq('company_id', sc.companyId)
        .eq('is_active', true)
        .order('name');
      if (pErr) throw new Error(t('تعذر تحميل قائمة المنتجات.'));

      const { data: prices } = await supabase
        .from('price_lists')
        .select('product_id,customer_type,unit_price')
        .eq('company_id', sc.companyId);

      const priceMap = new Map<string, number>();
      for (const p of prices ?? []) {
        if (p.customer_type === customerType || p.customer_type === 'default') {
          if (!priceMap.has(p.product_id)) priceMap.set(p.product_id, Number(p.unit_price) || 0);
        }
      }
      for (const p of prices ?? []) {
        if (!priceMap.has(p.product_id)) priceMap.set(p.product_id, Number(p.unit_price) || 0);
      }

      return (products ?? []).map((prod) => ({
        ...prod,
        unit_price: priceMap.get(prod.id) ?? 0,
      })) as PricedProduct[];
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
          customers (id, name, address, customer_type)
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

      const { data, error } = await q;
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
          items, total_amount, status, notes, order_date, delivered_at, created_at
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

export function useAdminOrders(filter?: { status?: string; supervisorId?: string; search?: string }) {
  const sc = useScope();
  const query = useQuery({
    queryKey: [...sc.base, 'admin-orders', filter?.status ?? 'all', filter?.supervisorId ?? 'all', filter?.search ?? ''],
    queryFn: async () => {
      let q = supabase
        .from('orders')
        .select(`
          id, visit_id, supervisor_id, customer_id, company_id,
          items, total_amount, status, notes, order_date, delivered_at, created_at,
          customers!customer_id (id, name, address, customer_type),
          supervisors!supervisor_id (id, full_name, phone)
        `)
        .eq('company_id', sc.companyId)
        .order('created_at', { ascending: false });

      if (filter?.status && filter.status !== 'all') {
        q = q.eq('status', filter.status);
      }
      if (filter?.supervisorId && filter.supervisorId !== 'all') {
        q = q.eq('supervisor_id', filter.supervisorId);
      }

      const { data, error } = await q;
      if (error) {
        if (error.code === '42703' || error.message?.includes('items') || error.message?.includes('total_amount')) {
          throw new Error('يرجى تطبيق ملف التحديث (10_orders_opportunity.sql) في Supabase SQL Editor لتفعيل حقول الأوردرات.');
        }
        throw new Error(error.message || t('تعذر تحميل جدول أوردرات الشركة.'));
      }

      let list = (data ?? []).map((row: any) => ({
        ...row,
        total_amount: Number(row.total_amount) || 0,
        items: parseOrderItems(row.items, row.total_amount),
      })) as OrderRecord[];

      if (filter?.search && filter.search.trim()) {
        const queryTerm = filter.search.trim().toLowerCase();
        list = list.filter((o) =>
          o.customers?.name?.toLowerCase().includes(queryTerm) ||
          o.supervisors?.full_name?.toLowerCase().includes(queryTerm) ||
          o.notes?.toLowerCase().includes(queryTerm)
        );
      }

      return list;
    },
  });

  const kpi = useMemo(() => computeOrdersKPI(query.data ?? []), [query.data]);

  return { ...query, kpi };
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

      const { error } = await supabase.from('orders').insert(payload);
      if (error) throw new Error(`${t('تعذر حفظ الأوردر')}: ${error.message}`);
      return total;
    },
    onSuccess: (total) => {
      notify(`✅ ${t('تم تسجيل الأوردر بنجاح — الإجمالي:')} ${num(total)} ${t('ج.م')}`, 'success');
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

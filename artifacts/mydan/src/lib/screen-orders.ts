import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { usePaged, useScope } from './data';
import { ORDER_COLUMNS } from './columns';
import { readExactCount } from './read-count';
import { notify } from './toast';
import { t } from '@/i18n';
import type { Order, OrderStatus } from '@/types/database';

type Scope = ReturnType<typeof useScope>;
const fail = (message: string, error: { message?: string } | null): never => {
  throw new Error(error?.message ? message + ' (' + error.message + ')' : message);
};
export type OrderRow = Order & { customers: { name: string } | null; products: { name: string } | null };
export type OrderAdminRow = OrderRow & { supervisors: { full_name: string } | null };
export type OrderVisit = { id: string; customer_id: string; supervisor_id: string; company_id: string; status: string; visit_date: string; customers: { name: string } | null };
export type OrderProduct = { id: string; name: string; is_active: boolean; company_id: string };
export type OrderKpis = { total: number; delivered: number; completion: number };

function countOrders(sc: Scope, signal: AbortSignal, status?: OrderStatus) {
  return readExactCount((head) => {
    let q = head(supabase.from('orders').select('id', { count: 'exact', head }).eq('company_id', sc.companyId).eq('supervisor_id', sc.supervisorId));
    if (status) q = q.eq('status', status);
    return q;
  }, signal, t('تعذر تحميل مؤشرات الطلبات.'));
}

export function useMyOrderKpis() {
  const sc = useScope();
  return useQuery({ queryKey: [...sc.base, 'orders', 'kpis'], retry: 1, queryFn: async ({ signal }): Promise<OrderKpis> => {
    const [total, delivered] = await Promise.all([countOrders(sc, signal), countOrders(sc, signal, 'delivered')]);
    return { total, delivered, completion: total ? delivered / total * 100 : 0 };
  } });
}

export function useMyOrders(status = 'all') {
  const sc = useScope();
  return usePaged<OrderRow>(sc, 'orders', ['mine', status], async (from, to, signal) => {
    let q = supabase.from('orders').select(ORDER_COLUMNS + ',customers(name),products(name)')
      .eq('company_id', sc.companyId).eq('supervisor_id', sc.supervisorId);
    if (status !== 'all') q = q.eq('status', status);
    const r = await q.order('created_at', { ascending: false }).order('id').range(from, to).abortSignal(signal);
    if (r.error) fail(t('تعذر تحميل الطلبات.'), r.error);
    return (r.data ?? []) as OrderRow[];
  });
}

export function useOrderVisit(visitId: string) {
  const sc = useScope();
  return useQuery({ queryKey: [...sc.base, 'order-visit', visitId], enabled: !!visitId, retry: 1, queryFn: async ({ signal }) => {
    const r = await supabase.from('visits').select('id,customer_id,supervisor_id,company_id,status,visit_date,customers(name)')
      .eq('id', visitId).eq('company_id', sc.companyId).eq('supervisor_id', sc.supervisorId)
      .eq('status', 'in_progress').abortSignal(signal).maybeSingle();
    if (r.error) fail(t('تعذر تحميل الزيارة.'), r.error);
    if (!r.data) throw new Error(t('الزيارة غير نشطة أو لا تخص حسابك.'));
    return r.data as OrderVisit;
  } });
}

export function useOrderProducts() {
  const sc = useScope();
  return usePaged<OrderProduct>(sc, 'order-products', [], async (from, to, signal) => {
    const r = await supabase.from('products').select('id,name,is_active,company_id')
      .eq('company_id', sc.companyId).eq('is_active', true).order('name').order('id').range(from, to).abortSignal(signal);
    if (r.error) fail(t('تعذر تحميل المنتجات.'), r.error);
    return (r.data ?? []) as OrderProduct[];
  });
}

export function useCreateOrder() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({ mutationFn: async (input: { id: string; visitId: string; productId: string; quantity: number }) => {
    if (!input.id || !input.visitId || !input.productId || !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 2147483647)
      throw new Error(t('أدخل كمية صحيحة أكبر من صفر.'));
    const visit = await supabase.from('visits').select('id,customer_id,supervisor_id,company_id,status')
      .eq('id', input.visitId).eq('company_id', sc.companyId).eq('supervisor_id', sc.supervisorId)
      .eq('status', 'in_progress').maybeSingle();
    if (visit.error) fail(t('تعذر تحميل الزيارة.'), visit.error);
    if (!visit.data) throw new Error(t('الزيارة غير نشطة أو لا تخص حسابك.'));
    const product = await supabase.from('products').select('id').eq('id', input.productId)
      .eq('company_id', sc.companyId).eq('is_active', true).maybeSingle();
    if (product.error) fail(t('تعذر تحميل المنتجات.'), product.error);
    if (!product.data) throw new Error(t('لا توجد منتجات متاحة.'));
    const record = { id: input.id, visit_id: visit.data.id, customer_id: visit.data.customer_id,
      supervisor_id: sc.supervisorId, company_id: sc.companyId, product_id: input.productId, quantity: input.quantity, status: 'pending' as const };
    const inserted = await supabase.from('orders').insert(record);
    if (inserted.error) {
      const check = await supabase.from('orders').select('id,visit_id,product_id,quantity')
        .eq('id', input.id).eq('company_id', sc.companyId).eq('supervisor_id', sc.supervisorId).maybeSingle();
      if (check.error || !check.data || check.data.visit_id !== record.visit_id || check.data.product_id !== record.product_id || check.data.quantity !== record.quantity)
        fail(t('تعذر حفظ الطلب.'), inserted.error);
    }
    return record;
  }, onSuccess: async () => {
    notify(t('تم إنشاء الطلب'), 'success');
    await Promise.all(['orders', 'dashboard', 'targets'].map(name => qc.invalidateQueries({ queryKey: [...sc.base, name] })));
  } });
}

export function useAdminOrders() {
  const sc = useScope();
  return usePaged<OrderAdminRow>(sc, 'admin-orders', [], async (from, to, signal) => {
    const r = await supabase.from('orders').select(ORDER_COLUMNS + ',customers(name),products(name),supervisors(full_name)')
      .eq('company_id', sc.companyId).order('created_at', { ascending: false }).order('id').range(from, to).abortSignal(signal);
    if (r.error) fail(t('تعذر تحميل الطلبات.'), r.error);
    return (r.data ?? []) as OrderAdminRow[];
  }, sc.isAdmin);
}

export function useMarkOrderDelivered() {
  const sc = useScope(); const qc = useQueryClient();
  return useMutation({ mutationFn: async (input: { id: string; expectedStatus: OrderStatus }) => {
    if (!sc.isAdmin) throw new Error(t('هذه العملية للمدراء فقط.'));
    if (input.expectedStatus !== 'pending' && input.expectedStatus !== 'confirmed')
      throw new Error(t('تعذر تحديث حالة الطلب؛ راجع صلاحيات Supabase.'));
    const r = await supabase.from('orders').update({ status: 'delivered' })
      .eq('id', input.id).eq('company_id', sc.companyId).eq('status', input.expectedStatus).select('id');
    if (r.error) fail(t('تعذر تحديث حالة الطلب؛ راجع صلاحيات Supabase.'), r.error);
    if (!r.data?.length) throw new Error(t('تعذر تحديث حالة الطلب؛ راجع صلاحيات Supabase.'));
    return input.id;
  }, onSuccess: async () => {
    notify(t('تم تحديث حالة الطلب'), 'success');
    await qc.invalidateQueries({ queryKey: [...sc.base, 'admin-orders'] });
  } });
}

export type CountTargetInput = {
  supervisor_id: string; month: number; year: number;
  visits_target: number; audit_target: number;
};
export function countTargetRecord(input: CountTargetInput) {
  if (!input.supervisor_id?.trim() || !Number.isInteger(input.month) || input.month < 1 || input.month > 12
    || !Number.isInteger(input.year) || input.year < 2000 || input.year > 9999
    || ![input.visits_target, input.audit_target]
      .every(n => Number.isSafeInteger(n) && n >= 0 && n <= 2_147_483_647)) {
    throw new Error('قيم الأهداف غير صالحة.');
  }
  return {
    supervisor_id: input.supervisor_id, month: input.month, year: input.year,
    visits_target: input.visits_target, audit_target: input.audit_target,
  };
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

export function computeOrdersKPI(orders: { status: string; total_amount: number }[]): OrdersKPI {
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

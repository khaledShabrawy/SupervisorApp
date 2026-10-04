import type { Visit } from '../types/database.ts';

export type QuantityOrderInput = {
  visit: Pick<Visit, 'id' | 'customer_id' | 'supervisor_id' | 'company_id'>;
  product_id: string;
  quantity: number;
};
export function quantityOrderRecord(input: QuantityOrderInput, scope: {
  companyId: string; supervisorId: string; isAdmin: boolean;
}) {
  const visit = input.visit;
  if (!visit?.id || !visit.customer_id || !visit.supervisor_id || !input.product_id?.trim()
    || !Number.isSafeInteger(input.quantity) || input.quantity <= 0 || input.quantity > 2_147_483_647) {
    throw new Error('اختر زيارة ومنتجًا وكمية صحيحة أكبر من صفر.');
  }
  if (!scope.companyId || visit.company_id !== scope.companyId
    || (!scope.isAdmin && visit.supervisor_id !== scope.supervisorId)) {
    throw new Error('الزيارة غير متاحة لحسابك.');
  }
  return {
    visit_id: visit.id, customer_id: visit.customer_id, supervisor_id: visit.supervisor_id,
    company_id: scope.companyId, product_id: input.product_id, quantity: input.quantity, status: 'pending' as const,
  };
}

export type CountTargetInput = {
  supervisor_id: string; month: number; year: number;
  visits_target: number; audit_target: number; orders_target: number;
};
export function countTargetRecord(input: CountTargetInput) {
  if (!input.supervisor_id?.trim() || !Number.isInteger(input.month) || input.month < 1 || input.month > 12
    || !Number.isInteger(input.year) || input.year < 2000 || input.year > 9999
    || ![input.visits_target, input.audit_target, input.orders_target]
      .every(n => Number.isSafeInteger(n) && n >= 0 && n <= 2_147_483_647)) {
    throw new Error('قيم الأهداف غير صالحة.');
  }
  return {
    supervisor_id: input.supervisor_id, month: input.month, year: input.year,
    visits_target: input.visits_target, audit_target: input.audit_target, orders_target: input.orders_target,
  };
}
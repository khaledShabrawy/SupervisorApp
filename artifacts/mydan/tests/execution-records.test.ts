import test from 'node:test';
import assert from 'node:assert/strict';
import { countTargetRecord, computeOrdersKPI } from '../src/lib/execution-records.ts';

const target = { supervisor_id: 'supervisor', month: 10, year: 2026, visits_target: 12, audit_target: 8 };

test('target records whitelist visit and audit goals; old sales fields cannot be sent', () => {
  assert.deepEqual(countTargetRecord({ ...target, orders_target: 99, actual_orders: 1, ignored: 99 } as typeof target), target);
});

test('invalid goal counts fail before saving', () => {
  assert.doesNotThrow(() => countTargetRecord({ ...target, audit_target: 0 }));
  for (const n of [-1, 0.5, NaN, Infinity, 2_147_483_648]) {
    assert.throws(() => countTargetRecord({ ...target, audit_target: n }));
    assert.throws(() => countTargetRecord({ ...target, visits_target: n }));
  }
});

test('computes orders KPI correctly: 100% when delivered, 0% when pending', () => {
  const pendingOrders = [
    { id: '1', visit_id: 'v1', supervisor_id: 's1', customer_id: 'c1', company_id: 'co1', items: [], total_amount: 500, status: 'pending' as const, notes: null, order_date: '2026-10-14', delivered_at: null, created_at: '2026-10-14' }
  ];
  const pendingKpi = computeOrdersKPI(pendingOrders);
  assert.equal(pendingKpi.totalOrders, 1);
  assert.equal(pendingKpi.deliveredOrders, 0);
  assert.equal(pendingKpi.deliveryRate, 0);

  const deliveredOrders = [
    { id: '1', visit_id: 'v1', supervisor_id: 's1', customer_id: 'c1', company_id: 'co1', items: [], total_amount: 500, status: 'delivered' as const, notes: null, order_date: '2026-10-14', delivered_at: '2026-10-14', created_at: '2026-10-14' }
  ];
  const deliveredKpi = computeOrdersKPI(deliveredOrders);
  assert.equal(deliveredKpi.totalOrders, 1);
  assert.equal(deliveredKpi.deliveredOrders, 1);
  assert.equal(deliveredKpi.deliveryRate, 100);
});
import test from 'node:test';
import assert from 'node:assert/strict';
import { countTargetRecord } from '../src/lib/execution-records.ts';

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

import test from 'node:test';
import assert from 'node:assert/strict';
import { quantityOrderRecord, countTargetRecord } from '../src/lib/execution-records.ts';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const visit = { id: 'visit', customer_id: 'customer', supervisor_id: 'supervisor', company_id: 'company' };
const scope = { companyId: 'company', supervisorId: 'supervisor', isAdmin: false };
const target = { supervisor_id: 'supervisor', month: 10, year: 2026, visits_target: 12, audit_target: 8, orders_target: 5 };

test('order records contain only identity, product, quantity and status', () => {
  const record = quantityOrderRecord({ visit, product_id: 'product', quantity: 3, ignored: 99 } as Parameters<typeof quantityOrderRecord>[0], scope);
  assert.deepEqual(record, {
    visit_id: 'visit', customer_id: 'customer', supervisor_id: 'supervisor', company_id: 'company',
    product_id: 'product', quantity: 3, status: 'pending',
  });
});
test('invalid quantities and inaccessible visits fail before saving', () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, 2_147_483_648]) {
    assert.throws(() => quantityOrderRecord({ visit, product_id: 'product', quantity }, scope));
  }
  assert.throws(() => quantityOrderRecord({ visit: { ...visit, company_id: 'other' }, product_id: 'product', quantity: 1 }, scope));
  assert.throws(() => quantityOrderRecord({ visit: { ...visit, supervisor_id: 'other' }, product_id: 'product', quantity: 1 }, scope));
});
test('target records whitelist only three count goals and their period/owner', () => {
  assert.deepEqual(countTargetRecord({ ...target, ignored: 99 } as typeof target), target);
  assert.doesNotThrow(() => countTargetRecord({ ...target, audit_target: 0 }));
  for (const audit_target of [-1, 0.5, NaN, Infinity, 2_147_483_648]) {
    assert.throws(() => countTargetRecord({ ...target, audit_target }));
  }
});
test('web source stays free of monetary fields and native app is removed', () => {
  const forbidden = /\b(?:formatCurrency|total_amount|unit_price|total_price|target_revenue|actual_revenue|revenue|EGP)\b|ج\.م|جنيه/;
  function check(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) check(file);
      else if (/\.(?:tsx?|jsx?)$/.test(file)) assert.doesNotMatch(readFileSync(file, 'utf8'), forbidden, file);
    }
  }
  check(new URL('../src', import.meta.url).pathname);
  assert.equal(existsSync(new URL('../../mobile/package.json', import.meta.url)), false);
});
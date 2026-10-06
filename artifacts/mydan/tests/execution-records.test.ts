import test from 'node:test';
import assert from 'node:assert/strict';
import { countTargetRecord } from '../src/lib/execution-records.ts';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
test('web source has no sales orders or financial features and native app is removed', () => {
  const forbidden = /\b(?:orders|orders_target|actual_orders|OrderRow|QuantityOrderInput|quantityOrderRecord|OrdersScreen|formatCurrency|total_amount|unit_price|total_price|target_revenue|actual_revenue|revenue|EGP)\b|أوامر البيع|أمر بيع|ج\.م|جنيه/;
  function check(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) check(file);
      else if (/\.(?:tsx?|jsx?)$/.test(file)) assert.doesNotMatch(readFileSync(file, 'utf8'), forbidden, file);
    }
  }
  const srcDir = fileURLToPath(new URL('../src', import.meta.url));
  check(srcDir);
  assert.equal(existsSync(fileURLToPath(new URL('../../mobile/package.json', import.meta.url))), false);
});
test('the discontinued sales-order screen cannot be navigated to', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /path=["']orders["']|OrdersScreen/);
  assert.equal(existsSync(new URL('../src/screens/OrdersScreen.tsx', import.meta.url)), false);
});
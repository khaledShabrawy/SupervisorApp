import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { customerRecord, type CustomerInput } from '../src/lib/customer-record.ts';

const input: CustomerInput = {
  name: ' عميل اختبار ', type: ' بقالة ', address: ' عنوان اختبار ',
  latitude: 30, longitude: 31, is_active: true,
};

test('customer writes normalize source type and exclude generated and ownership fields', () => {
  const result = customerRecord({ ...input, customer_type: 'generated', company_id: 'other', supervisor_id: 'other' } as CustomerInput);
  assert.deepEqual(result, { name: 'عميل اختبار', type: 'بقالة', address: 'عنوان اختبار', latitude: 30, longitude: 31, is_active: true });
});
test('customer coordinates allow a null pair and reject incomplete or invalid coordinates', () => {
  assert.doesNotThrow(() => customerRecord({ ...input, latitude: null, longitude: null }));
  assert.doesNotThrow(() => customerRecord({ ...input, latitude: 0, longitude: 0 }));
  for (const coords of [
    { latitude: null, longitude: 31 }, { latitude: 30, longitude: null },
    { latitude: 91, longitude: 31 }, { latitude: 30, longitude: -181 },
    { latitude: NaN, longitude: 31 }, { latitude: 30, longitude: Infinity },
  ]) assert.throws(() => customerRecord({ ...input, ...coords }));
});
test('customer writes reject blank mandatory fields and invalid active flags', () => {
  for (const field of ['name', 'type', 'address']) assert.throws(() => customerRecord({ ...input, [field]: ' ' }));
  assert.throws(() => customerRecord({ ...input, is_active: 'true' } as unknown as CustomerInput));
});
test('visit GPS refresh remains available after a far fix without reloading form data', () => {
  const screen = readFileSync(new URL('../src/screens/NewVisitScreen.tsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/hooks/useGeolocation.ts', import.meta.url), 'utf8');
  assert.match(screen, /\{!gps\.loading && <button[^>]+onClick=\{gps\.retry\}/);
  assert.doesNotMatch(screen, /window\.location\.reload/);
  assert.match(hook, /maximumAge: 0/);
});

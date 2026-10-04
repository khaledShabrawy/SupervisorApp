import test from 'node:test';
import assert from 'node:assert/strict';
import { customerTypeLabel, relativeArabicTime, visitDateRange, progressPercent } from '../src/lib/screen-helpers.ts';

test('customer categories normalize both legacy English and Arabic; unknown categories are other', () => {
  assert.equal(customerTypeLabel('grocery'), 'بقالة');
  assert.equal(customerTypeLabel('سوبرماركت'), 'سوبر ماركت');
  assert.equal(customerTypeLabel('hypermarket'), 'هايبر ماركت');
  assert.equal(customerTypeLabel('coffee_shop'), 'كافيه');
  assert.equal(customerTypeLabel('صيدلية'), 'أخرى');
});

test('relative timestamps use Arabic since labels and reject invalid dates', () => {
  const now = new Date('2026-10-04T10:00:00Z').getTime();
  assert.equal(relativeArabicTime('2026-10-04T09:59:45Z', now), 'الآن');
  assert.equal(relativeArabicTime('2026-10-04T09:55:00Z', now), 'منذ ٥ دقائق');
  assert.equal(relativeArabicTime('2026-10-04T09:00:00Z', now), 'منذ ساعة');
  assert.equal(relativeArabicTime('2026-10-04T08:00:00Z', now), 'منذ ساعتين');
  assert.equal(relativeArabicTime('not-a-date', now), 'وقت غير متاح');
});

test('visit week starts Saturday and has an exclusive end; leap-month bounds are correct', () => {
  const sunday = visitDateRange('week', new Date(2026, 9, 4));
  assert.equal(sunday.start, '2026-10-03');
  assert.equal(sunday.end, '2026-10-10');
  const leap = visitDateRange('month', new Date(2024, 1, 29));
  assert.equal(leap.start, '2024-02-01');
  assert.equal(leap.end, '2024-03-01');
  const year = visitDateRange('today', new Date(2026, 11, 31));
  assert.equal(year.start, '2026-12-31');
  assert.equal(year.end, '2027-01-01');
});

test('progress percentages retain overachievement without dividing by zero', () => {
  assert.equal(progressPercent(5, 10), 50);
  assert.equal(progressPercent(15, 10), 150);
  assert.equal(progressPercent(0, 0), 0);
});
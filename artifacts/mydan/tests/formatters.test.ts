import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, formatArabicDate, formatRelativeTime, getDayName } from '../src/utils/formatters.ts';

test('Arabic digits and invalid counts', () => {
  assert.equal(formatNumber(1234), '١٬٢٣٤');
  assert.equal(formatNumber(NaN), '—');
});
test('Arabic relative time, yesterday, future and invalid date', () => {
  const now = new Date(2026, 9, 4, 12).getTime();
  assert.equal(formatRelativeTime(now - 5 * 60000, now), 'منذ ٥ دقائق');
  assert.equal(formatRelativeTime(now - 3600000, now), 'منذ ساعة');
  assert.equal(formatRelativeTime(new Date(2026, 9, 3, 10), now), 'أمس');
  assert.match(formatRelativeTime(now + 3600000, now), /ساعة/);
  assert.equal(formatRelativeTime('invalid', now), 'وقت غير متاح');
});
test('Full Arabic calendar and JavaScript weekday indexes', () => {
  assert.match(formatArabicDate('2026-10-04'), /الأحد.*أكتوبر.*٢٠٢٦/);
  assert.equal(getDayName(6), 'السبت');
  assert.equal(getDayName(-1), 'يوم غير متاح');
});
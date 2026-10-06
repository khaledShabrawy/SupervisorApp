import { LANG, LOCALE } from '../i18n/lang.ts';

type DateInput = Date | string | number;
const number = new Intl.NumberFormat(LOCALE);
const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'always' });
const relativeAuto = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
export const ARABIC_DAYS = LANG === 'en'
  ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  : ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function toDate(value: DateInput): Date {
  // Date-only strings represent local days, not UTC midnight.
  return new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
}
export const formatNumber = (n: number): string => Number.isFinite(n) ? number.format(n) : '—';
export function formatArabicDate(value: DateInput): string {
  const date = toDate(value);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : LANG === 'en' ? 'Date unavailable' : 'تاريخ غير متاح';
}
export const getDayName = (dayIndex: number): string =>
  Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex <= 6 ? ARABIC_DAYS[dayIndex] : LANG === 'en' ? 'Unknown day' : 'يوم غير متاح';

function since(amount: number, one: string, two: string, many: string): string {
  return `منذ ${amount === 1 ? one : amount === 2 ? two : `${number.format(amount)} ${amount <= 10 ? many : one}`}`;
}
export function formatRelativeTime(value: DateInput, now = Date.now()): string {
  const date = toDate(value), seconds = (date.getTime() - now) / 1000;
  if (!Number.isFinite(seconds)) return LANG === 'en' ? 'Time unavailable' : 'وقت غير متاح';
  const elapsed = Math.abs(seconds);
  if (elapsed < 60) return LANG === 'en' ? 'just now' : 'الآن';
  if (LANG === 'en') return englishRelative(seconds, elapsed);
  if (seconds > 0) return elapsed < 3600 ? relative.format(Math.trunc(seconds / 60), 'minute')
    : elapsed < 86400 ? relative.format(Math.trunc(seconds / 3600), 'hour') : relative.format(Math.trunc(seconds / 86400), 'day');
  if (elapsed < 3600) return since(Math.trunc(elapsed / 60), 'دقيقة', 'دقيقتين', 'دقائق');
  if (elapsed < 86400) return since(Math.trunc(elapsed / 3600), 'ساعة', 'ساعتين', 'ساعات');
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'أمس';
  if (elapsed < 30 * 86400) return since(Math.trunc(elapsed / 86400), 'يوم', 'يومين', 'أيام');
  if (elapsed < 365 * 86400) return since(Math.trunc(elapsed / (30 * 86400)), 'شهر', 'شهرين', 'أشهر');
  return since(Math.trunc(elapsed / (365 * 86400)), 'سنة', 'سنتين', 'سنوات');
}
// English has regular plurals, so Intl covers every range directly.
function englishRelative(seconds: number, elapsed: number): string {
  const sign = seconds < 0 ? -1 : 1;
  if (elapsed < 3600) return relativeAuto.format(sign * Math.trunc(elapsed / 60), 'minute');
  if (elapsed < 86400) return relativeAuto.format(sign * Math.trunc(elapsed / 3600), 'hour');
  if (elapsed < 30 * 86400) return relativeAuto.format(sign * Math.trunc(elapsed / 86400), 'day');
  if (elapsed < 365 * 86400) return relativeAuto.format(sign * Math.trunc(elapsed / (30 * 86400)), 'month');
  return relativeAuto.format(sign * Math.trunc(elapsed / (365 * 86400)), 'year');
}

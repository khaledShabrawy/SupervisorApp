import { LANG, LOCALE } from '../i18n/lang.ts';
export { formatNumber as num } from '../utils/formatters.ts';
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const time = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' });
function formatDateValue(value: string | null, formatter: Intl.DateTimeFormat): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? formatter.format(parsed) : LANG === 'en' ? 'Date unavailable' : 'تاريخ غير متاح';
}
export const fmtTime = (v: string | null) => formatDateValue(v, time);
export const fmtDateTime = (v: string | null) => formatDateValue(v, dateTime);
export const fmtDate = (v: string) => formatDateValue(v.length === 10 ? `${v}T00:00:00` : v, date);
export { ARABIC_DAYS as DAYS } from '../utils/formatters.ts';
export const MONTHS = LANG === 'en'
  ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  : ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const visitMinutes = (checkIn: string | null, checkOut: string | null) => {
  if (!checkIn || !checkOut) return null;
  const ms = Date.parse(checkOut) - Date.parse(checkIn);
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60_000) : null;
};

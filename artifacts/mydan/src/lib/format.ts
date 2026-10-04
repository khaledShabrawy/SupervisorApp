export { formatNumber as num } from '../utils/formatters.ts';
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const time = new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' });
const dateTime = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' });
function formatDateValue(value: string | null, formatter: Intl.DateTimeFormat): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? formatter.format(parsed) : 'تاريخ غير متاح';
}
export const fmtTime = (v: string | null) => formatDateValue(v, time);
export const fmtDateTime = (v: string | null) => formatDateValue(v, dateTime);
export const fmtDate = (v: string) => formatDateValue(v.length === 10 ? `${v}T00:00:00` : v, date);
export { ARABIC_DAYS as DAYS } from '../utils/formatters.ts';
export const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

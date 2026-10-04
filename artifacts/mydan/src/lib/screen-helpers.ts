export const CUSTOMER_TYPES: Record<string, string[]> = {
  'بقالة': ['بقالة', 'grocery', 'grocery_store'],
  'سوبر ماركت': ['سوبر ماركت', 'سوبرماركت', 'supermarket'],
  'هايبر ماركت': ['هايبر ماركت', 'هايبرماركت', 'hypermarket'],
  'كافيه': ['كافيه', 'cafe', 'coffee_shop'],
  'أخرى': ['أخرى', 'other'],
};
export function customerTypeLabel(value: string): string {
  return Object.entries(CUSTOMER_TYPES).find(([, values]) => values.includes(value))?.[0] ?? 'أخرى';
}
export { formatRelativeTime as relativeArabicTime } from '../utils/formatters.ts';
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function visitDateRange(period: 'today' | 'week' | 'month', now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 1) % 7));
  if (period === 'month') start.setDate(1);
  const end = new Date(start);
  if (period === 'month') end.setMonth(end.getMonth() + 1);
  else end.setDate(end.getDate() + (period === 'week' ? 7 : 1));
  return { start: dateKey(start), end: dateKey(end), startIso: start.toISOString(), endIso: end.toISOString() };
}
export function progressPercent(actual: number, target: number): number {
  return target > 0 ? Math.round((actual / target) * 100) : 0;
}
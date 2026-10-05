import { requireExactCount } from './policy.ts';

type Row = { id: string };
// Do not interpret a short page as the end: the server may impose a smaller cap.
async function scanRows<T extends Row>(make: () => any, signal: AbortSignal,
  message: string, consume: (rows: T[]) => void): Promise<void> {
  let cursor: string | null = null;
  for (;;) {
    signal.throwIfAborted();
    let query = make().order('id', { ascending: true }).limit(200);
    if (cursor !== null) query = query.gt('id', cursor);
    const result = await query.abortSignal(signal);
    if (result.error) throw new Error(message);
    if (!Array.isArray(result.data)) throw new Error('استجابة البيانات غير مكتملة.');
    const rows = result.data as T[];
    if (!rows.length) return;
    let previous: string | null = cursor;
    for (const row of rows) {
      if (typeof row.id !== 'string' || !row.id || (previous !== null && row.id <= previous)) {
        throw new Error('تعذر تحميل جميع السجلات بترتيب صحيح. أعد المحاولة.');
      }
      previous = row.id;
    }
    consume(rows);
    cursor = previous;
  }
}

export async function readAllRows<T extends Row>(make: () => any, signal: AbortSignal,
  message: string): Promise<T[]> {
  const rows: T[] = [];
  await scanRows<T>(make, signal, message, page => rows.push(...page));
  return rows;
}

export async function readExactCount(make: (head: boolean) => any, signal: AbortSignal,
  message: string): Promise<number> {
  signal.throwIfAborted();
  const result = await make(true).abortSignal(signal);
  if (result.error) throw new Error(message);
  if (typeof result.count === 'number' && Number.isSafeInteger(result.count) && result.count >= 0) {
    return result.count;
  }
  // Some responses omit count metadata or provide an unknown total (*).
  // Count every accessible ID instead;
  // never substitute zero or the length of only the first page.
  let count = 0;
  await scanRows<Row>(() => make(false), signal, message, page => { count += page.length; });
  return requireExactCount(count);
}

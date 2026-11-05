export type MutationResult<T> = { data: T | null; error: unknown };

/** Recover an acknowledged record after a duplicate or a lost HTTP response, without overwriting it. */
export async function withMutationReceipt<T>(
  write: () => PromiseLike<MutationResult<T>>,
  read: () => PromiseLike<MutationResult<T>>,
  matches: (row: T) => boolean,
): Promise<T> {
  let failure: unknown;
  try {
    const result = await write();
    if (!result.error && result.data !== null) return result.data;
    failure = result.error ?? new Error('No mutation receipt was returned');
  } catch (error) { failure = error; }
  try {
    const result = await read();
    if (!result.error && result.data !== null && matches(result.data)) return result.data;
  } catch { /* Preserve the original failure so the caller can retain the pending action. */ }
  throw failure;
}

export function newMutationId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export const isRecordId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function sameInstant(left: unknown, right: unknown): boolean {
  return typeof left === 'string' && typeof right === 'string'
    && Number.isFinite(Date.parse(left)) && Date.parse(left) === Date.parse(right);
}

/** Constraint/authorization failures need correction, not an indefinitely retried offline success. */
export function isRetryableMutationError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return !code || ['PGRST000','PGRST001','PGRST002','PGRST003','57014','53300','57P01'].includes(code);
}

/** JSONB may reorder object keys; equivalent receipts must still be recognized. */
export function sameJsonValue(left: unknown, right: unknown): boolean {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

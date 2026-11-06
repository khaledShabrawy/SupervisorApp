import test from 'node:test';
import assert from 'node:assert/strict';
import { withMutationReceipt, sameJsonValue, sameInstant, newMutationId, isRecordId, isRetryableMutationError } from '../src/lib/mutation-receipt.ts';

test('a committed write with a lost response is recovered by its scoped receipt', async () => {
  const row = { id: 'operation', status: 'completed' };
  let writes = 0;
  const result = await withMutationReceipt(
    async () => { writes++; return { data: null, error: new Error('Connection lost after commit') }; },
    async () => ({ data: row, error: null }),
    value => value.id === 'operation',
  );
  assert.equal(result, row);
  assert.equal(writes, 1);
  assert.equal(result.status, 'completed');
});
test('unrelated receipts and failed lookups preserve the original failure', async () => {
  const failure = { code: '23505', message: 'Different operation owns this key' };
  await assert.rejects(withMutationReceipt(
    async () => ({ data: null, error: failure }),
    async () => ({ data: { id: 'other' }, error: null }),
    value => value.id === 'operation',
  ), error => error === failure);
  await assert.rejects(withMutationReceipt(
    async () => { throw failure; },
    async () => { throw new Error('Offline'); },
    () => true,
  ), error => error === failure);
});
test('JSONB key order and equivalent timestamps do not create false receipt conflicts', () => {
  assert.equal(sameJsonValue([{ quantity: 2, product_id: 'p' }], [{ product_id: 'p', quantity: 2 }]), true);
  assert.equal(sameJsonValue({ n: 2 }, { n: 3 }), false);
  assert.equal(sameInstant('2026-11-05T10:00:00Z', '2026-11-05T12:00:00+02:00'), true);
  assert.equal(sameInstant('invalid', 'invalid'), false);
});
test('new identities fit PostgreSQL UUIDs; permanent validation failures are not queued as network success', () => {
  assert.equal(isRecordId(newMutationId()), true);
  assert.equal(isRecordId('offline-123'), false);
  for (const code of ['23505','23503','42501','PGRST116']) assert.equal(isRetryableMutationError({ code }), false);
  assert.equal(isRetryableMutationError(new Error('Network lost')), true);
});

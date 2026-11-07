import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRegisteredPush, registerPush, unregisterPush } from '../src/lib/push-registration.ts';

const scope = { supervisorId: 'supervisor-a', companyId: 'company-a' };

function fixture({ existing = true, row = { id: 'saved' }, readError = null, writeError = null, deleteError = null } = {}) {
  const calls = { filters: [], subscribe: 0, unsubscribe: 0, writes: [] };
  const subscription = {
    endpoint: 'https://push.invalid/device',
    toJSON: () => ({ endpoint: 'https://push.invalid/device', keys: { p256dh: 'public', auth: 'auth' } }),
    unsubscribe: async () => { calls.unsubscribe++; return true; },
  };
  const registration = { pushManager: {
    getSubscription: async () => existing ? subscription : null,
    subscribe: async () => { calls.subscribe++; return subscription; },
  } };
  const chain = {
    select: () => chain,
    eq: (key, value) => { calls.filters.push([key, value]); return chain; },
    maybeSingle: async () => ({ data: row, error: readError }),
    upsert: async (value, options) => { calls.writes.push({ value, options }); return { error: writeError }; },
    delete: () => ({
      eq(key, value) { calls.filters.push([key, value]); return this; },
      then(resolve) { return Promise.resolve({ error: deleteError }).then(resolve); },
    }),
  };
  return { client: { from: () => chain }, registration, calls };
}

test('permission without a browser and server subscription is not registered', async () => {
  const absent = fixture({ existing: false });
  assert.equal(await hasRegisteredPush(absent.client, absent.registration, scope), false);
  assert.deepEqual(absent.calls.filters, []);
  const missingRow = fixture({ row: null });
  assert.equal(await hasRegisteredPush(missingRow.client, missingRow.registration, scope), false);
  assert.deepEqual(missingRow.calls.filters, [['supervisor_id', scope.supervisorId], ['company_id', scope.companyId], ['endpoint', 'https://push.invalid/device']]);
});

test('server read errors do not look like an enabled subscription', async () => {
  const f = fixture({ readError: new Error('database unavailable') });
  await assert.rejects(hasRegisteredPush(f.client, f.registration, scope), /database unavailable/);
});

test('successful registration reuses an existing browser subscription and stores its scope', async () => {
  const f = fixture();
  await registerPush(f.client, f.registration, scope, new Uint8Array([1]));
  assert.equal(f.calls.subscribe, 0);
  assert.equal(f.calls.unsubscribe, 0);
  assert.deepEqual(f.calls.writes[0].value, {
    supervisor_id: scope.supervisorId, company_id: scope.companyId,
    endpoint: 'https://push.invalid/device', p256dh: 'public', auth: 'auth',
  });
  assert.equal(f.calls.writes[0].options.onConflict, 'supervisor_id,endpoint');
});

test('failed server registration is surfaced and retains the browser subscription for retry', async () => {
  const f = fixture({ writeError: new Error('save denied') });
  await assert.rejects(registerPush(f.client, f.registration, scope, new Uint8Array([1])), /save denied/);
  assert.equal(f.calls.subscribe, 0);
  assert.equal(f.calls.unsubscribe, 0);
});

test('failed server deletion preserves the browser subscription', async () => {
  const f = fixture({ deleteError: new Error('delete denied') });
  await assert.rejects(unregisterPush(f.client, f.registration, scope), /delete denied/);
  assert.equal(f.calls.unsubscribe, 0);
  assert.deepEqual(f.calls.filters, [['supervisor_id', scope.supervisorId], ['company_id', scope.companyId], ['endpoint', 'https://push.invalid/device']]);
});

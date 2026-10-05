import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { readAllRows, readExactCount } from '../src/lib/read-count.ts';

const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1).padStart(4, '0'), visits_target: i + 1 }));
function fixture(options: { count?: string; headError?: boolean; pageError?: boolean; malformed?: boolean } = {}) {
  const calls: { method: string; url: URL }[] = [];
  const client = createClient('https://fixture.invalid', 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const method = init?.method ?? 'GET', url = new URL(String(input));
      calls.push({ method, url });
      if ((method === 'HEAD' && options.headError)
        || (method === 'GET' && options.pageError && url.searchParams.has('id'))) {
        return new Response(method === 'HEAD' ? null : JSON.stringify({ message: 'denied', code: '42501' }), { status: 403 });
      }
      if (method === 'HEAD') return new Response(null, {
        status: 200, headers: options.count === undefined ? {} : { 'Content-Range': `*/${options.count}` },
      });
      const cursor = url.searchParams.get('id')?.replace(/^gt\./, '') ?? '';
      const page = rows.filter(row => row.id > cursor).slice(0, 2); // Server cap smaller than requested 200.
      return new Response(JSON.stringify(options.malformed ? {} : page), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } },
  });
  const make = (head: boolean) => client.from('visits').select('id,visits_target', { count: 'exact', head })
    .eq('company_id', 'fixture-company').eq('supervisor_id', 'fixture-supervisor').eq('visit_date', '2026-10-05');
  return { make, calls };
}

test('missing count metadata counts ALL IDs despite a lower server cap, retaining every scope filter', async () => {
  const { make, calls } = fixture();
  assert.equal(await readExactCount(make, new AbortController().signal, 'failed'), 5);
  assert.equal(calls.filter(c => c.method === 'HEAD').length, 1);
  assert.equal(calls.filter(c => c.method === 'GET').length, 4);
  for (const { url } of calls) {
    assert.equal(url.searchParams.get('company_id'), 'eq.fixture-company');
    assert.equal(url.searchParams.get('supervisor_id'), 'eq.fixture-supervisor');
    assert.equal(url.searchParams.get('visit_date'), 'eq.2026-10-05');
  }
});
test('valid exact metadata, including zero, uses only the fast HEAD request', async () => {
  for (const count of ['0', '5']) {
    const { make, calls } = fixture({ count });
    assert.equal(await readExactCount(make, new AbortController().signal, 'failed'), Number(count));
    assert.equal(calls.length, 1);
  }
});
test('target collection reads every page without depending on count metadata', async () => {
  const { make } = fixture();
  assert.deepEqual(await readAllRows(() => make(false), new AbortController().signal, 'failed'), rows);
});
test('permission failures on HEAD or a later page are never changed into zero or partial totals', async () => {
  for (const options of [{ headError: true }, { pageError: true }]) {
    const { make } = fixture(options);
    await assert.rejects(readExactCount(make, new AbortController().signal, 'read failed'), /read failed/);
  }
});
test('unknown or invalid count metadata is recalculated from every row, not substituted with zero', async () => {
  for (const count of ['*', 'unknown', '-1']) {
    const { make } = fixture({ count });
    assert.equal(await readExactCount(make, new AbortController().signal, 'failed'), 5);
  }
});
test('malformed rows and cancelled queries fail explicitly', async () => {
  const malformed = fixture({ malformed: true });
  await assert.rejects(readExactCount(malformed.make, new AbortController().signal, 'failed'));
  const { make, calls } = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readExactCount(make, controller.signal, 'failed'), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});
test('non-advancing ID pages fail instead of looping forever or accepting an incomplete total', async () => {
  const query = {
    order() { return this; }, limit() { return this; }, gt() { return this; },
    async abortSignal() { return { data: [{ id: '0001' }], error: null }; },
  };
  await assert.rejects(readAllRows(() => query, new AbortController().signal, 'failed'), /ترتيب صحيح/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient as realStorageClient } from '@supabase/supabase-js';

// Run the checked-in handler against an in-memory SDK. No Auth, Storage or AI
// service is contacted, and every attempted provider call is intercepted.
const source = readFileSync(new URL('../../../supabase/functions/analyze-shelf/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function fixture(options = {}) {
  let serve;
  let quotaIndex = 0;
  const calls = { ai: 0, storage: 0, writes: [], storageUrls: [] };
  const caller = { id: 'supervisor', company_id: 'company', role: 'supervisor', is_active: true };
  const audit = { id: 'audit', company_id: 'company', supervisor_id: caller.id, photo_url: options.photoPath ?? 'company/supervisor/audit.jpg', status: 'pending' };
  const settings = Object.hasOwn(options, 'settings') ? options.settings : { ai_audit_enabled: true, target_brand_name: 'Synthetic', competitor_brands: [] };
  const defaults = { data: null, count: 0, error: null };
  const storage = realStorageClient('https://review.invalid', 'synthetic-storage-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      calls.storageUrls.push(new Request(url, init).url);
      return new Response('synthetic-image', { headers: { 'Content-Type': 'image/jpeg' } });
    } },
  });
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user' } } }) },
    storage: { from: bucket => ({ download: async path => { calls.storage++; return storage.storage.from(bucket).download(path); } }) },
    from(table) {
      let operation = 'read';
      let countQuery = false;
      const query = {
        select(_columns, options) { countQuery = options?.count === 'exact'; return query; },
        eq() { return query; }, gte() { return query; }, or() { return query; }, not() { return query; },
        update(patch) { operation = 'write'; calls.writes.push({ table, patch }); return query; },
        maybeSingle: async () => ({ data: table === 'supervisors' ? caller : table === 'app_settings' ? settings : audit, error: table === 'app_settings' ? options.settingsError ?? null : null }),
        then(resolve, reject) {
          if (table === 'shelf_audit' && operation === 'read' && countQuery) {
            const index = quotaIndex++;
            if (options.quotaReject === index) return Promise.reject(new Error('Synthetic quota transport failure')).then(resolve, reject);
            return Promise.resolve(options.quotas?.[index] ?? defaults).then(resolve, reject);
          }
          return Promise.resolve({ data: [{ id: 'audit' }], count: 1, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  // Schema validation itself is outside this guard test. This stub only permits
  // initialization and the synthetic success response; it performs no IO.
  const z = { string: () => ({}), number: () => ({}), boolean: () => ({}), array: () => ({}), object: () => ({ parse: value => value }) };
  vm.runInNewContext(compiled, {
    Deno: { env: { get: name => ({ SUPABASE_URL: 'https://review.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-key', GEMINI_API_KEY: 'synthetic-ai-key', ...options.env })[name] }, serve: fn => { serve = fn; } },
    createClient: () => admin, z, zodOutputFormat: () => ({}), Anthropic: class { constructor() { throw new Error('Unexpected Anthropic call'); } },
    encodeBase64: data => Buffer.from(data).toString('base64'), Response, Blob, URL, console,
    fetch: async url => {
      calls.ai++;
      assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\//);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ score: 50, audit_summary_ar: 'Synthetic', target_brand_metrics: { out_of_stock: false, oos_items: [] } }) }] } }] }));
    },
  });
  return { calls, invoke: () => serve(new Request('https://review.invalid/analyze', { method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify({ audit_id: audit.id }) })) };
}

async function deniedBeforeCost(options, status) {
  const f = fixture(options);
  const response = await f.invoke();
  assert.equal(response.status, status);
  assert.equal(f.calls.ai, 0);
  assert.equal(f.calls.storage, 0);
  assert.equal(f.calls.writes.length, 0);
}

test('settings read errors and missing settings block AI before any claim or provider request', async () => {
  await deniedBeforeCost({ settingsError: { code: '42501' } }, 503);
  await deniedBeforeCost({ settings: null }, 503);
});

test('AI requires an explicit enabled setting', async () => {
  for (const value of [false, null, undefined]) await deniedBeforeCost({ settings: { ai_audit_enabled: value } }, 403);
});

test('each failed quota read blocks AI instead of being treated as zero', async () => {
  for (let index = 0; index < 3; index++) {
    const quotas = Array.from({ length: 3 }, () => ({ data: null, count: 0, error: null }));
    quotas[index] = { count: null, error: { code: 'PGRST001' } };
    await deniedBeforeCost({ quotas }, 503);
    await deniedBeforeCost({ quotaReject: index }, 503);
  }
});

test('missing, malformed and negative quota counts fail closed', async () => {
  for (const count of [null, undefined, -1, NaN, 0.5, '0']) {
    await deniedBeforeCost({ quotas: [{ count, error: null }] }, 503);
  }
});

test('invalid configured quota values fail closed', async () => {
  for (const value of ['NaN', '-1', '1oops', '', '9007199254740992']) {
    await deniedBeforeCost({ env: { MAX_AUDITS_PER_DAY: value } }, 503);
  }
});

test('reached quotas, including an intentional zero limit, deny analysis', async () => {
  await deniedBeforeCost({ quotas: [{ count: 100, error: null }] }, 429);
  await deniedBeforeCost({ env: { MAX_AUDITS_PER_DAY: '0' } }, 429);
});

test('confirmed enabled settings and explicit zero counts allow the normal analysis path', async () => {
  const f = fixture();
  const response = await f.invoke();
  assert.equal(response.status, 200);
  assert.equal(f.calls.ai, 1);
  assert.equal(f.calls.storage, 1);
  assert.ok(f.calls.writes.some(write => write.patch.status === 'completed'));
});

test('audit photo keys cannot escape a tenant folder through URL normalization', async () => {
  const unsafe = [
    'company/../foreign/photo.jpg', 'company/./photo.jpg',
    'company/supervisor/../../foreign/photo.jpg', 'company/../../other-bucket/photo.jpg',
    'company/%2e%2e/foreign/photo.jpg', 'company/%252e%252e/foreign/photo.jpg',
    'company/%2f../foreign/photo.jpg', 'company/..\\foreign/photo.jpg',
    'company//photo.jpg', 'company/photo.jpg?download=1', 'company/photo.jpg#fragment',
    'company/\n../foreign/photo.jpg', 'company/\tphoto.jpg', 'company/\u0085photo.jpg',
    'https://review.invalid/storage/v1/object/public/shelf-photos/company/../foreign/photo.jpg',
    'https://review.invalid/storage/v1/object/public/shelf-photos/company/%2e%2e/foreign/photo.jpg',
    'https://unrelated.invalid/storage/v1/object/public/shelf-photos/company/photo.jpg',
  ];
  for (const photoPath of unsafe) await deniedBeforeCost({ photoPath }, 400);
});

test('safe audit UUID keys and same-project legacy signed URLs reach only their expected SDK URL', async () => {
  const key = 'company/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg';
  for (const photoPath of [key, `https://review.invalid/storage/v1/object/sign/shelf-photos/${key}?token=synthetic`]) {
    const f = fixture({ photoPath });
    assert.equal((await f.invoke()).status, 200);
    assert.deepEqual(f.calls.storageUrls, [`https://review.invalid/storage/v1/object/shelf-photos/${key}`]);
  }
});

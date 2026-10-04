import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL(process.env.MYDAN_TEST_BUILT_SW === '1' ? '../dist/public/sw.js' : '../public/sw.js', import.meta.url), 'utf8');
function worker(entries = []) {
  const handlers = {};
  const added = [];
  const requests = [];
  const removed = [];
  const shell = new Response('<html dir="rtl"></html>');
  const context = {
    URL, Response, Request,
    self: { __WB_MANIFEST: entries, location: { href: 'https://example.test/mydan/sw.js' }, addEventListener: (name, fn) => handlers[name] = fn,
      skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async () => ({ addAll: async urls => { requests.push(...urls); added.push(...urls.map(url => typeof url === 'string' ? url : url.url)); } }),
      keys: async () => ['unrelated-cache', 'mydan-shell:/mydan/:old', 'mydan-shell:/mydan/:new'],
      delete: async name => removed.push(name), match: async url => url === 'https://example.test/mydan/' ? shell : undefined },
    fetch: async () => new Response(JSON.stringify({ version: 'new', assets: ['assets/app-test.js', 'assets/app-test.css'] })),
  };
  vm.runInNewContext(source, context);
  return { context, handlers, added, requests, removed, shell };
}
test('install pre-caches only public shell and its versioned assets', async () => {
  const w = worker();
  let done;
  w.handlers.install({ waitUntil: promise => done = promise }); await done;
  assert.ok(w.added.includes('https://example.test/mydan/'));
  assert.ok(w.added.includes('https://example.test/mydan/assets/app-test.js'));
  assert.ok(w.added.every(url => url.startsWith('https://example.test/mydan/') && !url.includes('/api/')));
});
test('PWA injected entries do not duplicate Cache.addAll requests', async () => {
  const w = worker([{ url: 'assets/app-test.js' }, { url: '/mydan/assets/app-test.js' }, { url: 'icons/icon-192.png' }]);
  let done;
  w.handlers.install({ waitUntil: promise => done = promise }); await done;
  assert.equal(w.added.length, new Set(w.added).size);
});
test('release assets bypass stale browser HTTP cache', async () => {
  const w = worker(); let done;
  w.handlers.install({ waitUntil: promise => done = promise }); await done;
  assert.ok(w.requests.every(request => request.cache === 'reload'));
});
test('API, Supabase, photo and mutation requests are not intercepted or cached', () => {
  const w = worker();
  for (const request of [
    { url: 'https://project.supabase.co/rest/v1/customers', method: 'GET', mode: 'cors' },
    { url: 'https://example.test/mydan/api/orders', method: 'GET', mode: 'cors' },
    { url: 'https://example.test/mydan/photos/private.png', method: 'GET', mode: 'cors' },
    { url: 'https://example.test/mydan/orders', method: 'POST', mode: 'cors' },
  ]) {
    let intercepted = false;
    w.handlers.fetch({ request, respondWith: () => intercepted = true });
    assert.equal(intercepted, false);
  }
});
test('offline route navigation falls back only to the public app shell', async () => {
  const w = worker();
  w.context.fetch = async () => { throw new Error('offline'); };
  let response;
  w.handlers.fetch({ request: { url: 'https://example.test/mydan/visits', method: 'GET', mode: 'navigate' },
    respondWith: promise => response = promise });
  assert.equal(await response, w.shell);
});
test('activation removes only stale caches belonging to this artifact', async () => {
  const w = worker(); let done;
  w.handlers.activate({ waitUntil: promise => done = promise }); await done;
  assert.deepEqual(w.removed, ['mydan-shell:/mydan/:old']);
});
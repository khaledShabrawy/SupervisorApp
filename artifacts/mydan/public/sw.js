/* Authenticated APIs, photos, tokens and business data are NEVER cached. */
const BASE = new URL('./', self.location.href);
// VitePWA injects public build revisions here, making every release detectable.
const BUILD_ASSETS = self.__WB_MANIFEST || [];
const PREFIX = `mydan-shell:${BASE.pathname}:`;
let CACHE;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(new URL('asset-manifest.json', BASE), { cache: 'no-store' });
    if (!response.ok) throw new Error('Missing app-shell build manifest');
    const manifest = await response.json();
    CACHE = PREFIX + manifest.version;
    const cache = await caches.open(CACHE);
    await cache.addAll([...new Set(['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
      ...manifest.assets, ...BUILD_ASSETS.map(entry => entry.url)].map(path => new URL(path, BASE).href))]
      .map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Worker globals can be restarted independently of installation.
    if (!CACHE) {
      const response = await fetch(new URL('asset-manifest.json', BASE), { cache: 'no-store' });
      const manifest = await response.json();
      CACHE = PREFIX + manifest.version;
    }
    await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const isAsset = /\/assets\/[^/]+\.(js|css|woff2?|png|svg)$/.test(url.pathname);
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const shell = await caches.match(BASE.href);
      return shell || new Response('التطبيق غير متاح دون اتصال. افتحه مرة واحدة متصلًا بالإنترنت.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }));
  } else if (isAsset) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});
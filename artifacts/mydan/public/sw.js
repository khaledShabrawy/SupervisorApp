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
    // Reject installation when any public asset is unavailable. The browser keeps
    // the previous worker active, and its complete cache remains available.
    await cache.addAll([...new Set(['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
      ...manifest.assets, ...BUILD_ASSETS.map(entry => entry.url)].map(path => new URL(path, BASE).href))]
      .map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      if (!CACHE) {
        const response = await fetch(new URL('asset-manifest.json', BASE), { cache: 'no-store' });
        const manifest = await response.json();
        CACHE = PREFIX + manifest.version;
      }
      await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE)
        .map(key => caches.delete(key)));
    } catch {}
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  // These HTML routes stay online-only; their public JS/CSS chunks remain cacheable.
  const route = url.pathname.slice(BASE.pathname.length);
  if (request.mode === 'navigate' && /^(admin|login|landing|set-password)(\/|$)/.test(route)) return;
  const isAsset = /\/assets\/[^/]+\.(js|css|woff2?|png|svg)$/.test(url.pathname)
    || /^icons\/[^/]+\.(png|svg)$/.test(route)
    || ['manifest.webmanifest', 'favicon.svg'].includes(route);
  if (request.mode === 'navigate') {
    // Cache-first for the app shell: serve cached index.html instantly so returning
    // to the app from the background doesn't cause a visible reload.
    event.respondWith((async () => {
      const cached = await caches.match(BASE.href);
      if (cached) {
        // A new worker installs the next HTML and asset set together. Never
        // overwrite this shell with HTML whose chunks have not been cached.
        return cached;
      }
      // No cache yet — go to network, fallback to offline message
      return fetch(request).catch(() =>
        new Response('التطبيق غير متاح دون اتصال. افتحه مرة واحدة متصلًا بالإنترنت.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      );
    })());
  } else if (isAsset) {
    event.respondWith(caches.match(request, { ignoreVary: true }).then(cached => cached || fetch(request)));
  }
});

/* ── Web Push Event Listeners ── */
self.addEventListener('push', event => {
  let payload = { title: 'ميدان', body: 'لديك إشعار جديد' };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }
  const title = payload.title || 'تطبيق ميدان';
  const options = {
    body: payload.body || '',
    icon: new URL('icons/icon-192.png', BASE).href,
    badge: new URL('icons/icon-192.png', BASE).href,
    dir: 'rtl',
    lang: 'ar',
    vibrate: [200, 100, 200],
    data: { url: payload.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
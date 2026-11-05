/* Authenticated APIs, photos, tokens and business data are NEVER cached. */
const BASE = new URL('./', self.location.href);
// VitePWA injects public build revisions here, making every release detectable.
const BUILD_ASSETS = self.__WB_MANIFEST || [];
const PREFIX = `mydan-shell:${BASE.pathname}:`;
// Bound to this worker's injected revision list, including after its process restarts.
const VERSION = [...JSON.stringify(BUILD_ASSETS)].reduce((hash, ch) => Math.imul(hash ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;
const CACHE = PREFIX + VERSION.toString(16);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const paths = BUILD_ASSETS.length ? BUILD_ASSETS.map(entry => entry.url) : ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
    // An incomplete install rejects and leaves the previous release active.
    await cache.addAll([...new Set(paths.map(path => new URL(path, BASE).href))].map(url => new Request(url, {cache:'reload'})));
    // No skipWaiting: an active visit/form is never interrupted by an update.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  // Never intercept admin, login, auth or landing routes; let browser load them live
  if (
    url.pathname.includes('/admin') ||
    url.pathname.includes('/login') ||
    url.pathname.includes('/landing') ||
    url.pathname.includes('/set-password')
  ) {
    return;
  }
  const isAsset = /\/assets\/[^/]+\.(js|css|woff2?|png|svg)$/.test(url.pathname);
  if (request.mode === 'navigate') {
    // Cache-first for the app shell: serve cached index.html instantly so returning
    // to the app from the background keeps the same installed release.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(new URL('index.html', BASE).href) || await cache.match(BASE.href);
      if (cached) return cached;
      // No cache yet — go to network, fallback to offline message
      return fetch(request).catch(() =>
        new Response('التطبيق غير متاح دون اتصال. افتحه مرة واحدة متصلًا بالإنترنت.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      );
    })());
  } else if (isAsset) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(request)).then(cached => cached || fetch(request)));
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
  let targetUrl = BASE.href;
  try { const target = new URL(event.notification.data?.url || './', BASE); if (target.origin === BASE.origin && target.pathname.startsWith(BASE.pathname)) targetUrl = target.href; } catch {}
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
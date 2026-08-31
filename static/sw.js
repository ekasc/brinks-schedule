// Schedule service worker.
// Strategy:
//  - Map tiles: cache-first (immutable, safe to keep across sessions).
//  - Hashed immutable app assets (/_app/immutable/...): cache-first.
//  - Everything else (page navigations, __data, forms): NETWORK-FIRST, so we
//    never serve a stale app shell that references deleted hashed bundles.
//  - Offline: fall back to the cache, then to the network.
const CACHE = 'schedule-v4';
const TILE_CACHE = 'schedule-tiles-v2';
const IMMUTABLE = /\/_app\/immutable\//;

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== TILE_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    // Map tiles: cache-first, then network (and cache the result).
    if (url.hostname.includes('tile.openstreetmap.org')) {
      e.respondWith(
        caches.open(TILE_CACHE).then(async (cache) => {
          const cached = await cache.match(req);
          if (cached) return cached;
          try {
            const res = await fetch(req);
            if (res.ok) cache.put(req, res.clone());
            return res;
          } catch {
            return cached || Response.error();
          }
        })
      );
    }
    return;
  }

  // Never cache app-data, form posts, or SvelteKit invalidations.
  if (
    url.pathname.startsWith('/__data') ||
    url.searchParams.has('x-sveltekit-invalidated')
  ) {
    return;
  }

  // Immutable hashed assets: cache-first (safe — content-addressed).
  if (IMMUTABLE.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Pages / navigations: network-first, fall back to cache when offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || Response.error()))
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Brinks Schedule', {
    body: data.body || '',
    tag: data.tag,
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let target = new URL(event.notification.data?.url || '/', self.location.origin);
  if (target.origin !== self.location.origin) target = new URL('/', self.location.origin);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(target.href);
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});

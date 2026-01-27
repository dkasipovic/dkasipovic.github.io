const PRECACHE_NAME = 'exif-inspector-precache-v2';
const RUNTIME_NAME = 'exif-inspector-runtime-v2';

// App shell (must succeed for offline to work)
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
];

// Best-effort third-party assets (do NOT block install if they fail)
const BEST_EFFORT_EXTERNAL_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/exif-js',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // 1) Always precache local shell (fail-fast)
    const precache = await caches.open(PRECACHE_NAME);
    await precache.addAll(PRECACHE_ASSETS);

    // 2) Best-effort cache external deps so "offline after first load" is reliable
    const runtime = await caches.open(RUNTIME_NAME);
    await Promise.allSettled(
      BEST_EFFORT_EXTERNAL_ASSETS.map(async (url) => {
        try {
          const request = new Request(url, { mode: 'no-cors' });
          const response = await fetch(request);
          await runtime.put(request, response);
        } catch {
          // Ignore third-party caching failures.
        }
      })
    );

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PRECACHE_NAME, RUNTIME_NAME]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Offline reload support for navigations
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        // Keep the latest HTML around
        const cache = await caches.open(PRECACHE_NAME);
        cache.put('./index.html', response.clone());
        return response;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Cache-first for same-origin static assets
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(RUNTIME_NAME);
          cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Cross-origin (CDNs, tiles, fonts): stale-while-revalidate-ish
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const fetchPromise = (async () => {
      const response = await fetch(event.request);
      // Opaque responses are expected for many cross-origin no-cors requests
      if (response.ok || response.type === 'opaque') {
        const cache = await caches.open(RUNTIME_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    })();

    return cached || fetchPromise.catch(() => cached || Response.error());
  })());
});

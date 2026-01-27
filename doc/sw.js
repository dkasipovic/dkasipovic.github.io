const PRECACHE_NAME = 'docedit-precache-v1';
const RUNTIME_NAME = 'docedit-runtime-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
];

// Best-effort external assets (fonts). App should still work if these fail.
const BEST_EFFORT_EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const precache = await caches.open(PRECACHE_NAME);
    await precache.addAll(PRECACHE_ASSETS);

    const runtime = await caches.open(RUNTIME_NAME);
    await Promise.allSettled(
      BEST_EFFORT_EXTERNAL_ASSETS.map(async (url) => {
        try {
          const request = new Request(url, { mode: 'no-cors' });
          const response = await fetch(request);
          await runtime.put(request, response);
        } catch {
          // ignore
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

  // Offline reload support
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        const cache = await caches.open(PRECACHE_NAME);
        cache.put('./index.html', response.clone());
        return response;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Cache-first for same-origin assets
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

  // Cross-origin (fonts): cache fallback
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    try {
      const response = await fetch(event.request);
      if (response.ok || response.type === 'opaque') {
        const cache = await caches.open(RUNTIME_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});

const PRECACHE_NAME = 'image-editor-precache-v1';
const RUNTIME_NAME = 'image-editor-runtime-v1';

// App shell (must succeed for offline to work)
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Always precache local shell (fail-fast)
    const precache = await caches.open(PRECACHE_NAME);
    await precache.addAll(PRECACHE_ASSETS);

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
});

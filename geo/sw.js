const PRECACHE_NAME = 'geo-precache-v2';
const RUNTIME_NAME = 'geo-runtime-v2';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './data.json',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './maps/europe.svg',
  './maps/asia.svg',
  './maps/africa.svg',
  './maps/north-america.svg',
  './maps/south-america.svg',
  './maps/oceania.svg',
  '/shared/styles.css',
  '/shared/app.js',
];

const BEST_EFFORT_EXTERNAL_ASSETS = [];

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

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const fetchPromise = (async () => {
      const response = await fetch(event.request);
      if (response.ok || response.type === 'opaque') {
        const cache = await caches.open(RUNTIME_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    })();

    return cached || fetchPromise.catch(() => cached || Response.error());
  })());
});

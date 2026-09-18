// WebTorrent streams files to <video> through a service worker rather than through
// MediaSource: client.createServer() hands this worker a MessageChannel, and the worker
// answers range requests under `<scope>/webtorrent/...` by pulling pieces from the page.
//
// Its handler only calls respondWith() for URLs under `registration.scope + 'webtorrent/'`
// and returns null for everything else, so it layers cleanly beneath the precache handler
// further down. A service worker's own script must be same-origin, but importScripts() may
// pull cross-origin — and imported scripts are stored in the registration's script map, so
// this keeps working offline once installed.
importScripts('https://cdn.jsdelivr.net/npm/webtorrent@3.0.21/dist/sw.min.js');

const PRECACHE_NAME = 'torrent-precache-v1';
const RUNTIME_NAME = 'torrent-runtime-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './icon.svg',
  '/shared/styles.css',
  '/shared/app.js',
];

// The WebTorrent bundle itself. Unlike the no-cors best-effort pattern the other tools use,
// these must be fetched with CORS: an opaque response cannot satisfy a `type="module"`
// import, and the browser would refuse the cached copy. jsDelivr sends
// `access-control-allow-origin: *`, so a plain cache.add() gets a usable 'cors' response.
const BEST_EFFORT_EXTERNAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/webtorrent@3.0.21/dist/webtorrent.min.js',
  'https://cdn.jsdelivr.net/npm/webtorrent@3.0.21/dist/sw.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const precache = await caches.open(PRECACHE_NAME);
    await precache.addAll(PRECACHE_ASSETS);

    const runtime = await caches.open(RUNTIME_NAME);
    await Promise.allSettled(
      BEST_EFFORT_EXTERNAL_ASSETS.map((url) => runtime.add(url))
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

  // Streaming routes belong to the WebTorrent handler imported above, which has already
  // claimed them. A second respondWith() on the same event throws InvalidStateError, and
  // caching torrent pieces would be pointless anyway.
  if (url.pathname.includes('/webtorrent/')) return;

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

  // Cross-origin. Tracker traffic is WebSocket and WebRTC, which never reaches a fetch
  // handler, so in practice this only serves the WebTorrent bundle and any web seed.
  // Web seeds are range requests that must go to the network untouched.
  if (event.request.headers.has('range')) return;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const fetchPromise = (async () => {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(RUNTIME_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    })();

    return cached || fetchPromise.catch(() => cached || Response.error());
  })());
});

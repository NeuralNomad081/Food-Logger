/* Food Logger service worker — cache-first app shell.
 * Bump CACHE_VERSION on every deploy that changes any shell file. */
const CACHE_VERSION = 'v3';
const CACHE_NAME = `food-logger-${CACHE_VERSION}`;

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'db.js',
  'config.js',
  'logger.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.info(`[sw] activated ${CACHE_NAME}`);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('food-logger-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // jsdelivr serves the supabase-js module — cache it so the shell loads offline.
  const cacheable = url.origin === self.location.origin || url.host === 'cdn.jsdelivr.net';
  // Never intercept API calls or Supabase REST/storage/auth — always live.
  if (!cacheable || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => {
        // Offline navigation fallback.
        if (request.mode === 'navigate') return caches.match('index.html');
        throw new Error('offline');
      });
    })
  );
});

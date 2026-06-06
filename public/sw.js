const CACHE_NAME = 'henosis-offline-cache-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  // Note: Vite creates dynamic names for JS/CSS in production, so we only cache the root.
  // The service worker will mainly serve as a fallback.
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching core assets');
      return cache.addAll(CORE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;

  // Network First, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache the latest version of the asset if it's a valid response
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        console.log('[ServiceWorker] Network request failed, falling back to cache:', event.request.url);
        return caches.match(event.request).then((cachedResponse) => {
          // If we have a cached response, return it
          if (cachedResponse) {
            return cachedResponse;
          }
          // If it's a navigation request and we're offline, return index.html for SPA routing
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          // Nothing we can do
          return new Response('Offline resource not found', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

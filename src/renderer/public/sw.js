// Service worker do app web (celular): rede primeiro, cache só como reserva offline.
const CACHE_NAME = 'pc-sentinel-web-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API e WebSocket nunca passam pelo cache
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.protocol.startsWith('ws')) {
    return;
  }

  // O token fica na query string: o cache usa só o caminho para não guardar uma cópia por token
  const cacheKey = url.origin + url.pathname;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
        }
        return response;
      })
      .catch(() => caches.match(cacheKey)),
  );
});

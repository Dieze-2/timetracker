const CACHE_NAME = 'time-tracker-v1';
const APP_SHELL = [
  './',
  './index.html'
];

// Installation : pré-cache de la page principale
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activation : suppression des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch :
// - pour la navigation HTML => network first
// - pour le reste => cache first avec mise à jour en arrière-plan
self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  // Requêtes de navigation : toujours tenter le réseau d'abord
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put('./index.html', responseClone);
            cache.put('./', responseClone.clone());
          });
          return response;
        })
        .catch(() => caches.match('./index.html').then(cached => cached || caches.match('./')))
    );
    return;
  }

  // Autres ressources : cache first, puis réseau, puis mise en cache
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }

          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });

          return response;
        });
    })
  );
});

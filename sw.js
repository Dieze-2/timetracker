const CACHE_NAME = 'time-tracker-v4';
const APP_SHELL = [
  './',
  './index.html',
  './fonts/bricolage-grotesque-latin.woff2',
  './fonts/instrument-sans-latin.woff2',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
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
          // On ne met en cache que la vraie page : une 404, une erreur serveur
          // ou une redirection remplaceraient sinon l'app hors ligne.
          if (response.ok && response.type === 'basic' && !response.redirected) {
            // Deux copies prises AVANT tout put() : cloner un corps déjà lu échoue.
            const forIndex = response.clone();
            const forRoot = response.clone();
            caches.open(CACHE_NAME).then(cache => Promise.all([
              cache.put('./index.html', forIndex),
              cache.put('./', forRoot)
            ])).catch(() => {});
          }
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

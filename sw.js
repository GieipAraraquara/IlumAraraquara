const CACHE_NAME = 'luz-araraquara-pwa-v201';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './Login.html',
  './Login-Servidor.html',
  './Abrir.html',
  './Painel.html',
  './Painel-Manutentor.html',
  './Finalizar.html',
  './Auditoria.html',
  './Mapa.html',
  './manifest.json',
  './favicon.svg',
  './js/config/supabaseClient.js',
  './js/config/cloudinaryConfig.js',
  './js/guards/authGuard.js',
  './js/domain/ChamadoModel.js',
  './js/repositories/ChamadosRepository.js',
  './js/services/ChamadosService.js',
  './js/controllers/AuditoriaController.js',
  './js/services/CloudinaryService.js',
  './js/services/OfflineSyncService.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of ASSETS_TO_CACHE) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn('⚠️ [Service Worker] Ignorando item não localizado no pré-cache:', url);
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('🧹 [Service Worker] Limpando cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque' || networkResponse.type === 'cors')) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        console.log('📡 [Service Worker] Servindo do cache offline:', request.url);
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
            return caches.match('./Login.html');
          }
          return new Response('Sem conexão com a internet', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

const CACHE_NAME = 'luz-araraquara-pwa-v115';
const ASSETS_TO_CACHE = [
  './',
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
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/material-symbols.css',
  './fonts/material-symbols-outlined.woff2',
  './js/config/supabaseClient.js',
  './js/config/cloudinaryConfig.js',
  './js/guards/authGuard.js',
  './js/domain/ChamadoModel.js',
  './js/repositories/ChamadosRepository.js',
  './js/services/ChamadosService.js',
  './js/controllers/AuditoriaController.js',
  './js/services/CloudinaryService.js',
  './js/services/OfflineSyncService.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap'
];

self.addEventListener('install', (event) => {
  console.log('⚡ [Service Worker] Instalando PWA Luz Araraquara...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of ASSETS_TO_CACHE) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn('⚠️ [Service Worker] Ignorando asset com falha no pré-cache:', url);
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
            console.log('🧹 [Service Worker] Removendo cache legado:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET' || request.url.includes('mapbox.com') || request.url.includes('supabase.co')) {
    event.respondWith(fetch(request));
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
        console.log('📡 [Service Worker] Modo Offline: Servindo arquivo do cache para:', request.url);
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
            return caches.match('./Login.html');
          }
          return new Response('', { status: 408, statusText: 'Request Timeout' });
        });
      })
  );
});

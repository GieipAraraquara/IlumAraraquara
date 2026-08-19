const CACHE_NAME = 'sistema-os-pwa-v43';
const ASSETS_TO_CACHE = [
  './',
  './Login.html',
  './Login-Servidor.html',
  './Finalizar.html',
  './Abrir.html',
  './Painel-Manutentor.html',
  './manifest.json',
  './js/config/supabaseClient.js',
  './js/config/cloudinaryConfig.js',
  './js/guards/authGuard.js?v=20',
  './js/domain/ChamadoModel.js?v=20',
  './js/repositories/ChamadosRepository.js?v=20',
  './js/services/ChamadosService.js?v=20',
  './js/services/CloudinaryService.js',
  './js/services/OfflineSyncService.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('⚡ [Service Worker] Instalando PWA e pré-carregando páginas e assets...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('⚠️ [Service Worker] Alguns arquivos falharam no pré-cache inicial, prosseguindo...', err);
      });
    }).then(() => self.skipWaiting())
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

  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
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
        });
      })
  );
});

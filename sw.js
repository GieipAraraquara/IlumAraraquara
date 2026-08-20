const CACHE_NAME = 'sistema-os-pwa-v100';
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
  './fonts/material-symbols.css',
  './fonts/material-symbols-outlined.woff2',
  './js/config/supabaseClient.js',
  './js/config/cloudinaryConfig.js',
  './js/guards/authGuard.js?v=30',
  './js/domain/ChamadoModel.js?v=43',
  './js/repositories/ChamadosRepository.js?v=30',
  './js/services/ChamadosService.js?v=30',
  './js/controllers/AuditoriaController.js?v=44',
  './js/services/CloudinaryService.js',
  './js/services/OfflineSyncService.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap'
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

  // Ignora requisições externas do Mapbox e Supabase para permitir manuseio nativo de CORS e tiles pelo navegador
  if (request.url.includes('mapbox.com') || request.url.includes('supabase.co')) {
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

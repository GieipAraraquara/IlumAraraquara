const CACHE_NAME = 'luz-araraquara-v150';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './Login.html',
  './Login-Servidor.html',
  './Abrir.html',
  './Finalizar.html',
  './Painel.html',
  './manifest.json',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pré-carregando recursos estáticos...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Alguns recursos estáticos não puderam ser pré-cacheados:', err);
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
            console.log('[SW] Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
            return caches.match('./Login.html');
          }
        });
      })
  );
});

// ==========================================
// WEB PUSH NOTIFICATIONS EVENT LISTENERS
// ==========================================
self.addEventListener('push', (event) => {
  let data = { title: 'Sistema OS', body: 'Nova notificação recebida' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const title = data.title || 'Sistema OS';
  const options = {
    body: data.body || 'Você possui uma nova notificação.',
    icon: data.icon || './icons/icon-192.png',
    badge: data.badge || './icons/icon-192.png',
    data: { url: data.url || './Painel.html' },
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || 'os-push-notification',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './Painel.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});


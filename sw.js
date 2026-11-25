const CACHE_NAME = 'sanstech-erp-v27'; 
const urlsToCache = [
  './',
  './index.html',
  './config.js',
  './app.js',
  './manifest.json',
  './logo1.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Membuka cache dan menyimpan file PWA terbaru (' + CACHE_NAME + ')...');
      const requests = urlsToCache.map(url => new Request(url, { cache: 'reload' }));
      return cache.addAll(requests);
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  // Jangan cache request API eksternal (Google Apps Script, dll)
  if (requestUrl.origin !== self.location.origin) return;

  // Network-First dengan fallback ke Cache agar saat buka aplikasi selalu dapat versi terbaru otomatis
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Menerima perintah dari app.js untuk memaksa SW baru langsung aktif (Force Update)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

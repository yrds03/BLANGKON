const CACHE_NAME = 'sanstech-erp-v13'; 
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './logo1.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Membuka cache dan menyimpan file PWA...');
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Jika file ada di cache, gunakan cache. Jika tidak, ambil dari internet.
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Hapus semua cache versi lama (v1 sampai v12)
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Menerima perintah dari app.js untuk memaksa SW baru langsung aktif (Force Update)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// SBTÜ PWA Service Worker (Minimal Cache)
const CACHE_NAME = 'sbtu-hazirlik-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Statik kaynakları offline kullanım için sun
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
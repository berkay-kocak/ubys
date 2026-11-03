// SBTÜ PWA Service Worker
const CACHE_NAME = 'sbtu-hazirlik-v2';
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './grades.js',
    './attendance.js',
    './shareCard.js',
    './backup.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const requestUrl = new URL(event.request.url);
                if (requestUrl.origin === self.location.origin && response.ok) {
                    const copy = response.clone();
                    event.waitUntil(
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
                    );
                }
                return response;
            })
            .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
});

// SBTÜ Hazırlık & İŞKUR PWA Service Worker
const CACHE_NAME = 'sbtu-hazirlik-v4';
const APP_SHELL = [
    './',
    './index.html',
    './not-hesapla/',
    './not-hesapla/index.html',
    './devamsizlik/',
    './devamsizlik/index.html',
    './iskur/',
    './iskur/index.html',
    './style.css',
    './app.js',
    './grades.js',
    './attendance.js',
    './shareCard.js',
    './backup.js',
    './supabase-auth.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
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

    let requestUrl;
    try {
        requestUrl = new URL(event.request.url);
    } catch (e) {
        return;
    }

    // Supabase API ve kimlik doğrulama isteklerini kesinlikle önbelleğe alma
    if (requestUrl.hostname === 'supabase.co' || requestUrl.hostname.endsWith('.supabase.co')) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (requestUrl.origin === self.location.origin && response.ok) {
                    const copy = response.clone();
                    event.waitUntil(
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
                    );
                }
                return response;
            })
            .catch(() => caches.match(event.request, { ignoreSearch: true }).then((cached) => {
                if (cached) return cached;
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                return undefined;
            }))
    );
});

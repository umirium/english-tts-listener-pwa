const APP_VERSION = '6.1.0';
const CACHE_NAME = `english-tts-listener-v${APP_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './storage.js',
  './speech.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

function isSameOriginRequest(request) {
  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin;
  } catch (_) {
    return false;
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || !isSameOriginRequest(request)) return;

  event.respondWith(
    fetch(request)
      .then(networkResponse => {
        const clonedResponse = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clonedResponse));
        return networkResponse;
      })
      .catch(() => caches.match(request).then(response => response || caches.match('./index.html')))
  );
});

const CACHE_NAME = 'english-tts-listener-v7-0';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './app.js',
  './storage.js',
  './speech.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

const NETWORK_FIRST_PATHS = new Set([
  '/',
  '/index.html',
  '/app.js',
  '/storage.js',
  '/speech.js',
  '/manifest.json'
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

function isNetworkFirstRequest(requestUrl) {
  return NETWORK_FIRST_PATHS.has(requestUrl.pathname);
}

async function handleNetworkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function handleCacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (isNetworkFirstRequest(requestUrl)) {
    event.respondWith(handleNetworkFirst(event.request));
    return;
  }

  event.respondWith(handleCacheFirst(event.request));
});

// Cache-first service worker so the app opens with no connection. Bump VERSION on every release.
// A new version waits until the app asks for it (the Update bar), so it never reloads mid-session.
const VERSION = 'steady-3';
const ASSETS = ['./', './index.html', './app.css', './app.js', './logic.js', './plan.js', './icons.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const isPage = e.request.mode === 'navigate';
  e.respondWith(
    caches.match(isPage ? './index.html' : e.request, { ignoreSearch: true })
      .then((hit) => hit || fetch(e.request)),
  );
});

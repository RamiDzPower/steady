// Cache-first service worker so the app opens with no connection. Bump VERSION on every release.
// A new version waits until the app asks for it (the Update bar), so it never reloads mid-session.
const VERSION = 'steady-18';
const ASSETS = ['./', './index.html', './app.css', './app.js', './logic.js', './plan.js', './pdf.js', './icons.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './img/ex/dead-bug-3.svg', './img/ex/dumbbell-romanian-deadlift-1.svg', './img/ex/farmer-carry-1.svg', './img/ex/glute-bridge-1.svg', './img/ex/goblet-squat-1.svg', './img/ex/hip-thrust-1.svg', './img/ex/incline-push-up-2.svg', './img/ex/lat-pulldown-3.svg', './img/ex/leg-curl-1.svg', './img/ex/leg-press-2.svg', './img/ex/machine-chest-press-1.svg', './img/ex/machine-shoulder-press-1.svg', './img/ex/one-arm-dumbbell-row-1.svg', './img/ex/pallof-press-1.svg', './img/ex/plank-1.svg', './img/ex/plank-3.svg', './img/ex/seated-row-1.svg', './img/ex/step-up-2.svg'];

// Straight from the server: a fresh HTTP-cache copy of an unchanged URL would mix the last release's files into this one.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
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

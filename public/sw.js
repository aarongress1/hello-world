// Minimal service worker — enables "install to home screen" and offline shell.
// Network-first for everything; falls back to cache for the app shell so a
// flaky connection still opens the app. Chat itself needs the network.
const CACHE = 'curio-shell-v6';
const SHELL = ['/', '/index.html', '/parent.html', '/kid.html', '/css/styles.css', '/js/common.js', '/js/parent.js', '/js/kid.js', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const { request } = e;
  // Never cache API calls — always go to the network.
  if (new URL(request.url).pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(request).then((res) => {
      if (request.method === 'GET' && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
      return res;
    }).catch(() => caches.match(request).then((r) => r || caches.match('/')))
  );
});

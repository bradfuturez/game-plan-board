/* Game plan board service worker: works offline after the first visit and picks up new versions promptly. */
const VERSION = 'gpb-v5';
const SHELL = ['./', './index.html', './styles.css?v=v5', './media-db.js?v=v5', './board.js?v=v5', './gestures.js?v=v5',
  './save-open.js?v=v5', './app.js?v=v5', './github-sync.js?v=v5', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  // cache:'reload' skips the HTTP cache so the new version's files really are new.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== VERSION + '-fonts').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Pages: network first (skipping the HTTP cache) so updates show up; cached app when offline.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(4000)]);
        if (res && res.ok) { const c = await caches.open(VERSION); c.put('./index.html', res.clone()); }
        return res;
      } catch (_) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }
  // Google Fonts: cache-first (they never change).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION + '-fonts').then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res;
    }));
    return;
  }
  // Own files: versioned URLs, so cache-first is safe; fall back to the network.
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res;
    }));
  }
});

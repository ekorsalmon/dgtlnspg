/* DGTLN POS — service worker: app tetap kebuka walau sinyal hilang */
const VERSION = 'dgtln-v3';
const CORE = ['./', 'index.html', 'app.js', 'config.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'supabase.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.startsWith('/admin') || url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return; // data selalu langsung ke server
  const sameOrigin = url.origin === location.origin;
  if (sameOrigin) {
    // file app: ambil versi terbaru kalau online, pakai cache kalau offline
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)) } return r })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else {
    // library & font dari CDN: cache dulu
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)) } return r })));
  }
});

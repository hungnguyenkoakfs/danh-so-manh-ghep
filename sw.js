// Lưu sẵn ứng dụng để dùng cả khi không có mạng. Đổi VERSION mỗi lần cập nhật file.
const VERSION = 'v1';
const FILES = ['./', 'index.html', 'core.js', 'lib.json', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))); self.clients.claim(); });
// Ưu tiên bản mới trên mạng, mất mạng thì dùng bản đã lưu
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});

// Service worker: caches the app shell only. API responses (client data) are never cached.
const VERSION = 'mbcc-v1.1.0';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest', '/favicon.png',
  '/js/app.js', '/js/ui.js', '/js/api.js', '/js/icons.js', '/js/shared.js', '/js/charts.js', '/js/forms.js',
  '/icons/icon-192.png', '/icons/icon-512.png', '/img/avatar.jpg', '/img/hero.jpg', '/img/identity.jpg',
  '/fonts/tajawal-arabic-400-normal.woff2', '/fonts/tajawal-arabic-500-normal.woff2', '/fonts/tajawal-arabic-700-normal.woff2', '/fonts/tajawal-arabic-800-normal.woff2',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Media Buyer Control Center', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-96.png', dir: 'rtl', lang: 'ar', tag: d.tag || 'mbcc-daily', renotify: true, data: { url: d.url || '/#/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '/#/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.location.origin)) { c.navigate(target).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Network-first so updates arrive immediately; cache as offline fallback.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
  );
});

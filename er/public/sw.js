// E&R service worker: app shell offline cache + push notifications. API responses are never cached.
const VERSION = 'er-__BUILD__';
const SHELL = ['/', '/index.html', '/css/app.css', '/manifest.webmanifest', '/js/boot.js', '/js/app.js', '/js/api.js', '/js/store.js', '/js/ui.js', '/js/form.js', '/js/icons.js', '/js/dates.js', '/js/labels.js', '/js/editors.js', '/js/agenda.js', '/js/cycle-math.js', '/js/push.js', '/fonts/plex-ar-400.woff2', '/fonts/plex-ar-500.woff2', '/fonts/plex-ar-600.woff2', '/fonts/corm-600.woff2', '/fonts/corm-500i.woff2', '/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'E&R', { body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', dir: 'rtl', lang: 'ar', tag: d.tag || 'er', renotify: true, data: { url: d.url || '/#/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '/#/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.location.origin)) { c.navigate(target).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});

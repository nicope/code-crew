// Service worker: shows push notifications and opens the right Bot when tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'Bots', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Bots', { body: d.body || '', tag: d.tag, renotify: true, data: d, icon: '/icon-180.png', badge: '/icon-180.png' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { if ('navigate' in c) c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});

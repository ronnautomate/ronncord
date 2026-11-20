// RONNCORD: service worker (instalar como app + notificação com a aba fechada)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// chegou notificação do servidor (DM, menção ou /aviso com o RONNCORD fechado)
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'RONNCORD', body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'RONNCORD', {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: self.registration.scope }
  }));
});

// clicou na notificação: volta pra aba do RONNCORD ou abre uma nova
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find(c => c.url.startsWith(self.registration.scope));
    if (open) return open.focus();
    return self.clients.openWindow(url);
  })());
});

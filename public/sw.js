// Service worker do RONNCORD: deixa o site instalável como app (Chrome, Edge, Opera).
// Não guarda cache: sempre pega a versão mais nova do site.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

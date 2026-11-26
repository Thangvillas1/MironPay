// Minimal service worker: makes the PWA installable. No offline caching on
// purpose — a wallet should always show live balances, and a cached app
// shell would keep serving old code after a deploy.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

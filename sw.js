const CACHE_NAME = 'netbattle-v3';
const ASSETS = [
  './',
  'index.html',
  'game.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'src/config.js',
  'src/shared.js',
  'src/data/storage.js',
  'src/data/auth.js',
  'src/data/inventory.js',
  'src/net/ws-client.js',
  'src/scenes/boot.js',
  'src/scenes/menu.js',
  'src/scenes/custom-screen.js',
  'src/scenes/battle.js',
  'src/scenes/gameover.js',
  'src/scenes/shop.js',
  'src/scenes/trade.js',
  'src/scenes/mp-lobby.js',
  'src/scenes/mp-battle.js',
  'https://cdnjs.cloudflare.com/ajax/libs/phaser/3.80.1/phaser.min.js'
  // NOTE: CrazyGames SDK URL is intentionally NOT cached — CG updates it.
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Never cache CG SDK or our backend
  const url = e.request.url;
  if (url.includes('sdk.crazygames.com') || url.includes('/ws') || url.includes('/auth/verify') || url.includes('/inventory')) {
    return; // let the browser handle it directly
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      // Network first for HTML/JS (get updates), cache fallback for offline
      if (e.request.destination === 'script' || e.request.destination === 'document') {
        return fetch(e.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return response;
        }).catch(() => cached);
      }
      return cached || fetch(e.request);
    })
  );
});

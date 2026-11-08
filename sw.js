// Service worker: caches the app shell so the game works offline.
// HTML/JS/CSS use network-first (fresh when online), icons cache-first.
const VERSION = 'buubuu-v10-3d';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/ai.js',
  './js/art.js',
  './js/art-track.js',
  './js/art-medals.js',
  './js/audio.js',
  './js/audio-engine.js',
  './js/audio-sfx.js',
  './js/course.js',
  './js/physics.js',
  './js/race.js',
  './js/records.js',
  './js/gp.js',
  './js/minimap.js',
  './js/vehicle-stats.js',
  './js/ghost.js',
  './js/render-sky.js',
  './js/render-road.js',
  './js/render-fx.js',
  './js/circuit.js',
  './js/art-gt.js',
  './js/render-simhud.js',
  './js/replay.js',
  './js/render.js',
  './js/render-hud.js',
  './js/rng.js',
  './js/settings.js',
  './js/stickers.js',
  './js/storage.js',
  './js/voice.js',
  './js/voice-lines.js',
  './js/track3d.js',
  './js/car3d.js',
  './js/world3d.js',
  './js/view3d.js',
  './js/garage3d.js',
  './js/vendor/three.module.js',
  './js/vendor/three.core.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('buubuu-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isShellAsset(url) {
  return url.pathname.endsWith('/') || /\.(html|js|css|webmanifest)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isShellAsset(url) || req.mode === 'navigate') {
    // network-first
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }
  // cache-first for icons and other static files
  event.respondWith(
    caches.match(req).then(
      (hit) => hit || fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }),
    ),
  );
});

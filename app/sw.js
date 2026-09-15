/* Offline app shell. Bump VERSION whenever any shell file changes, or
 * browsers keep serving the old one. A new version installs and waits; the
 * page tells it to take over once no edit is pending (loom.js). Requests to
 * other origins — the String — are never intercepted. */
const VERSION = 'loom-2';
const SHELL = [
  './', './index.html', './loom.css', './loom.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './lib/anchors.js', './lib/backup.js', './lib/conflicts.js', './lib/day.js', './lib/envelope.js', './lib/hlc.js', './lib/images.js',
  './lib/importer.js', './lib/keys.js', './lib/lexicons.js', './lib/media.js', './lib/memstore.js', './lib/migrate.js',
  './lib/routing.js', './lib/sender.js', './lib/store.js', './lib/string-client.js', './lib/tid.js',
  './ui/html.js', './ui/view-bead.js', './ui/view-form.js', './ui/view-panels.js', './ui/view-refs.js', './ui/view-strand.js',
  './ui/view-string.js',
  './vendor/lexicon.js', './vendor/refs.js', './vendor/strip.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' goes past the HTTP cache, so a new VERSION never caches an old file.
    const fresh = (url) => new Request(url, { cache: 'reload' });
    const lexicons = await (await fetch(fresh('./vendor/lexicons/index.json'))).json();
    await cache.addAll([...SHELL, './vendor/lexicons/index.json', ...lexicons.map((f) => `./vendor/lexicons/${f}`)].map(fresh));
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});

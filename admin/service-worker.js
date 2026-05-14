const CACHE_VERSION = 'admin-v1';
const APP_SHELL = [
  '/admin',
  '/admin/index.html',
  '/admin/reset.html',
  '/admin/manifest.webmanifest',
  '/admin/icons/icon-192.png',
  '/admin/icons/icon-512.png',
  '/admin/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Network-only para API e Supabase: dados sempre frescos, nada cacheado.
  if (url.pathname.startsWith('/api/') || url.hostname.endsWith('.supabase.co')) {
    return;
  }

  // Só interceptamos requisições do escopo /admin/ (assets locais).
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/admin')) {
    return;
  }

  // Network-first, cache como fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/admin/index.html')))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

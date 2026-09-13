// Minimal offline app-shell service worker.
// Scope: caches the static shell (HTML/CSS/JS/icons) so the app can
// open with no connection. Does NOT cache or queue Supabase/API data —
// that is a separate, per-screen feature (see reception-offline notes).

const CACHE_NAME = 'vis-portal-shell-v1';

// Keep this list small and static-only. Do not add API routes or
// pages whose content depends on the logged-in user's data.
const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept API calls or Supabase requests — those must always
  // hit the network (or fail visibly) rather than silently returning
  // stale cached data for something like a visitor check-in.
  if (
    request.method !== 'GET' ||
    request.url.includes('/api/') ||
    request.url.includes('supabase.co')
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      // Stale-while-revalidate: serve cache immediately if we have it,
      // update the cache in the background.
      return cached || network;
    })
  );
});

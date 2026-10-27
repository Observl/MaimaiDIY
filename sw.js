const CACHE_NAME = 'maimai-diy-assets-v2';
const MANIFEST_NAMES = ['/materials/manifest.json', '/materials/titles.json', '/materials/badges.json'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('maimai-diy-assets-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isManifest(url) {
  return MANIFEST_NAMES.some((name) => url.pathname.endsWith(name));
}

function isCacheableAsset(request, url) {
  return request.method === 'GET' && (
    url.pathname.includes('/materials/') ||
    url.pathname.includes('/assets/') ||
    /\.(?:png|jpe?g|webp|json|otf|woff2?)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!isCacheableAsset(request, url)) return;

  if (isManifest(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
    return response;
  })());
});

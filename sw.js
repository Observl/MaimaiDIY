const CACHE_NAME = 'maimai-diy-assets-v1.1.1';
const MANIFEST_NAMES = ['/materials/manifest.json', '/materials/titles.json', '/materials/badges.json', '/materials/recommendations.json'];

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

function assetCacheKey(request) {
  const url = new URL(request.url);
  url.searchParams.delete('selected');
  url.searchParams.delete('refresh');
  return url.href;
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
    const key = assetCacheKey(request);
    const cached = await cache.match(key);
    if (cached) return cached;
    const response = await fetch(url.origin !== self.location.origin && url.hostname.endsWith('.myqcloud.com')
      ? new Request(request, { mode: 'cors', credentials: 'omit' }) : request);
    if (response.ok && response.type !== 'opaque') {
      try {
        const blob = await response.clone().blob();
        if (!blob.size) return response;
        if (/\.(?:png|jpe?g|webp)$/i.test(url.pathname)) {
          if (!blob.type.startsWith('image/')) return response;
          const bitmap = await createImageBitmap(blob);
          if (!bitmap.width || !bitmap.height) return response;
          bitmap.close();
          const headers = new Headers(response.headers);
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
          const validated = new Response(blob, { status: response.status, statusText: response.statusText, headers });
          await cache.put(key, validated.clone());
          return validated;
        } else if (/\.json$/i.test(url.pathname)) {
          JSON.parse(await blob.text());
        }
        await cache.put(key, response.clone());
      } catch { /* Invalid bodies must never persist in the asset cache. */ }
    }
    return response;
  })());
});

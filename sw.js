const CACHE_NAME = 'maimai-diy-assets-cos-v3';
const COS_ORIGIN = 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com';
const MANIFEST_NAMES = ['manifest.json', 'titles.json', 'badges.json', 'recommendations.json'];
const pendingAssets = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith('maimai-diy-assets-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      } catch {
        /* Private browsing may deny cache storage. Network loading still works. */
      }
      await self.clients.claim();
    })()
  );
});

function cacheKey(url) {
  const key = new URL(url);
  key.searchParams.delete('refresh');
  key.searchParams.delete('selected');
  key.searchParams.delete('preview-refresh');
  return key.href;
}

function validManifest(url, data) {
  if (!data || typeof data !== 'object') return false;
  const name = url.pathname.split('/').pop();
  if (name === 'manifest.json' || name === 'badges.json') {
    return (
      data.schemaVersion === 1 &&
      Array.isArray(data.categories) &&
      data.categories.every(
        (category) =>
          category &&
          typeof category.id === 'string' &&
          Array.isArray(category.items) &&
          category.items.every(
            (item) => item && typeof item.name === 'string' && typeof item.file === 'string'
          )
      )
    );
  }
  return (
    Array.isArray(data.items) &&
    (name === 'recommendations.json'
      ? data.version === 1 &&
        data.items.every(
          (item) =>
            item &&
            typeof item.name === 'string' &&
            typeof item.preview === 'string' &&
            item.state &&
            typeof item.state === 'object'
        )
      : data.schemaVersion === 1 &&
        data.items.every((item) => item && typeof item.name === 'string'))
  );
}

async function networkManifest(request, url, cache) {
  const key = cacheKey(url);
  let response;
  try {
    response = await fetch(request);
    if (!response.ok || !validManifest(url, await response.clone().json()))
      throw new Error('Invalid manifest');
    try {
      await cache?.put(key, response.clone());
    } catch {
      /* Cache quota does not block a valid response. */
    }
    return response;
  } catch {
    const cached = await cache?.match(key).catch(() => undefined);
    if (cached) {
      try {
        if (validManifest(url, await cached.clone().json())) {
          const headers = new Headers(cached.headers);
          headers.set('X-Maimai-Index-Source', 'cache');
          return new Response(cached.body, { headers });
        }
      } catch {}
      await cache.delete(key).catch(() => {});
    }
    return response?.ok ? Response.error() : response || Response.error();
  }
}

async function cachedAsset(request, url, cache, refresh) {
  const key = cacheKey(url);
  const pending = pendingAssets.get(key) || { count: 0, refreshVersion: 0 };
  pendingAssets.set(key, pending);
  pending.count++;
  if (refresh) pending.refreshVersion++;
  const version = pending.refreshVersion;
  const canWrite = () => refresh ? version === pending.refreshVersion : pending.refreshVersion === 0;
  try {
    return await readAsset(request, url, cache, key, refresh, canWrite);
  } finally {
    if (--pending.count === 0) pendingAssets.delete(key);
  }
}

async function readAsset(request, url, cache, key, refresh, canWrite) {
  const cached = refresh ? undefined : await cache?.match(key).catch(() => undefined);
  if (cached) {
    if (cached.headers.get('X-Maimai-Validated') === '1') return cached;
    const checked = await validatedAsset(cached, url);
    if (checked) {
      if (canWrite()) await cache.put(key, checked.clone()).catch(() => {});
      return checked;
    }
    if (canWrite()) await cache.delete(key).catch(() => {});
  }
  const response = await fetch(request);
  if (!cache || !response.ok || response.type === 'opaque') return response;
  const checked = await validatedAsset(response, url);
  if (checked) {
    if (canWrite()) await cache.put(key, checked.clone()).catch(() => {});
    return checked;
  }
  return response;
}

async function validatedAsset(response, url) {
  try {
    const blob = await response.clone().blob();
    if (!blob.size || !response.ok) return null;
    if (/\.(png|jpe?g|webp)$/i.test(url.pathname)) {
      if (!blob.type.startsWith('image/')) return null;
      const bitmap = await createImageBitmap(blob);
      const valid = bitmap.width > 0 && bitmap.height > 0;
      bitmap.close();
      if (!valid) return null;
    } else {
      const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      const signature = [...bytes].map((byte) => String.fromCharCode(byte)).join('');
      if (!['OTTO', 'wOFF', 'wOF2', 'true', '\x00\x01\x00\x00'].includes(signature)) return null;
    }
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Maimai-Validated', '1');
    return new Response(blob, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return null;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !['http:', 'https:'].includes(url.protocol)) return;
  if (request.mode === 'navigate') return;
  if (request.headers.has('Authorization') || request.cache === 'no-store') return;
  if (url.origin === self.location.origin && /\/api(?:\/|$)/.test(url.pathname)) return;
  if (url.origin !== self.location.origin && url.origin !== COS_ORIGIN) return;
  const manifest =
    url.pathname.includes('/materials/') && MANIFEST_NAMES.includes(url.pathname.split('/').pop());
  if (!manifest && !/\.(png|jpe?g|webp|otf|ttf|woff2?)$/i.test(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME).catch(() => undefined);
      const corsRequest =
        url.origin !== self.location.origin
          ? new Request(request, { mode: 'cors', credentials: 'omit', redirect: 'error' })
          : request;
      return manifest
        ? networkManifest(corsRequest, url, cache)
        : cachedAsset(corsRequest, url, cache, url.searchParams.has('preview-refresh'));
    })()
  );
});

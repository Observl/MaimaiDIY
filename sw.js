const CACHE_NAME = 'maimai-diy-assets-v1.1.1';
const MANIFEST_NAMES = ['manifest.json', 'titles.json', 'badges.json', 'recommendations.json'];

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
        if (validManifest(url, await cached.clone().json())) return cached;
      } catch {}
      await cache.delete(key).catch(() => {});
    }
    return response?.ok ? Response.error() : response || Response.error();
  }
}

async function cachedAsset(request, url, cache) {
  const key = cacheKey(url);
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) {
    if (cached.headers.get('X-Maimai-Validated') === '1') return cached;
    const checked = await validatedAsset(cached, url);
    if (checked) {
      await cache.put(key, checked.clone()).catch(() => {});
      return checked;
    }
    await cache.delete(key).catch(() => {});
  }
  const response = await fetch(request);
  if (!cache || !response.ok || response.type === 'opaque') return response;
  const checked = await validatedAsset(response, url);
  if (checked) {
    await cache.put(key, checked.clone()).catch(() => {});
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
  if (url.origin !== self.location.origin && !url.hostname.endsWith('.myqcloud.com')) return;
  const manifest =
    url.pathname.includes('/materials/') && MANIFEST_NAMES.includes(url.pathname.split('/').pop());
  if (!manifest && !/\.(png|jpe?g|webp|otf|ttf|woff2?)$/i.test(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME).catch(() => undefined);
      const corsRequest =
        url.origin !== self.location.origin
          ? new Request(request, { mode: 'cors', credentials: 'omit' })
          : request;
      return manifest
        ? networkManifest(corsRequest, url, cache)
        : cachedAsset(corsRequest, url, cache);
    })()
  );
});

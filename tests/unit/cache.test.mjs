import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function worker({
  fetch,
  denied = false,
  decode = async () => ({ width: 1, height: 1, close() {} }),
}) {
  const entries = new Map();
  const listeners = {};
  const cache = {
    match: async (key) => entries.get(key)?.clone(),
    put: async (key, response) => entries.set(key, response.clone()),
    delete: async (key) => entries.delete(key),
  };
  vm.runInNewContext(readFileSync('sw.js', 'utf8'), {
    self: {
      location: new URL('https://example.com/MaimaiDIY/'),
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
    },
    caches: {
      open: async () => {
        if (denied) throw Error('denied');
        return cache;
      },
    },
    fetch,
    createImageBitmap: decode,
    URL,
    Request,
    Response,
    Headers,
  });
  return {
    entries,
    get: async (path, options) => {
      let response;
      listeners.fetch({
        request: new Request(new URL(path, 'https://example.com/MaimaiDIY/'), options),
        respondWith: (value) => {
          response = value;
        },
      });
      return await response;
    },
  };
}

test('manifest refreshes share a canonical offline fallback key', async () => {
  let offline = false;
  const data = { schemaVersion: 1, categories: [{ id: 'avatars', items: [] }] };
  const api = worker({
    fetch: async () => {
      if (offline) throw Error('offline');
      return Response.json(data);
    },
  });
  await api.get('materials/manifest.json?refresh=1');
  offline = true;
  assert.deepEqual(await (await api.get('materials/manifest.json?refresh=2')).json(), data);
  assert.equal(api.entries.size, 1);
});

test('invalid and failed manifests do not replace a good cached response', async () => {
  let valid = true;
  const api = worker({ fetch: async () => Response.json(valid ? { version: 1, items: [] } : {}) });
  await api.get('materials/recommendations.json');
  valid = false;
  assert.deepEqual(await (await api.get('materials/recommendations.json')).json(), {
    version: 1,
    items: [],
  });
  const empty = worker({ fetch: async () => Response.json({}) });
  assert.equal((await empty.get('materials/titles.json')).type, 'error');
  assert.equal(empty.entries.size, 0);
});

test('preview refresh replaces the old asset under its original cache key', async () => {
  let body = 'old';
  const api = worker({ fetch: async () => new Response(body, { headers: { 'content-type': 'image/png' } }) });
  assert.equal(await (await api.get('assets/a.png')).text(), 'old');
  body = 'fresh';
  assert.equal(await (await api.get('assets/a.png?preview-refresh=1')).text(), 'fresh');
  assert.equal(await (await api.get('assets/a.png')).text(), 'fresh');
  assert.equal(api.entries.size, 1);
});

test('an older refresh finishing last cannot overwrite the newer cached image', async () => {
  const started = Promise.withResolvers();
  const finishOlder = Promise.withResolvers();
  const api = worker({ fetch: async request => {
    const version = new URL(request.url).searchParams.get('preview-refresh');
    if (version === 'older') {
      started.resolve();
      await finishOlder.promise;
    }
    return new Response(version, { headers: { 'content-type': 'image/png' } });
  } });
  const older = api.get('assets/a.png?preview-refresh=older');
  await started.promise;
  await api.get('assets/a.png?preview-refresh=newer');
  finishOlder.resolve();
  await older;
  assert.equal(await (await api.get('assets/a.png')).text(), 'newer');
  assert.equal(api.entries.size, 1);
});

test('bad image bodies and error responses are never cached', async () => {
  const broken = worker({
    fetch: async () => new Response('broken', { headers: { 'content-type': 'image/png' } }),
    decode: async () => {
      throw Error('decode failed');
    },
  });
  await broken.get('assets/a.png');
  assert.equal(broken.entries.size, 0);
  const missing = worker({ fetch: async () => new Response('not found', { status: 404 }) });
  assert.equal((await missing.get('assets/a.png')).status, 404);
  assert.equal(missing.entries.size, 0);
});

test('valid images are reused, cache denial still allows network loading', async () => {
  let requests = 0;
  const fetch = async () => {
    requests++;
    return new Response('image', { headers: { 'content-type': 'image/png' } });
  };
  const api = worker({ fetch });
  await api.get('assets/a.png');
  assert.match((await api.get('assets/a.png')).headers.get('cache-control'), /immutable/);
  assert.equal(requests, 1);
  const denied = worker({ fetch, denied: true });
  assert.equal((await denied.get('assets/a.png')).status, 200);
});

test('legacy invalid image cache is evicted, HTML cannot be cached as a font', async () => {
  const api = worker({
    fetch: async () => new Response('good', { headers: { 'content-type': 'image/png' } }),
    decode: async (blob) => {
      if ((await blob.text()) === 'bad') throw Error('corrupt');
      return { width: 1, height: 1, close() {} };
    },
  });
  api.entries.set(
    'https://example.com/MaimaiDIY/assets/a.png',
    new Response('bad', { headers: { 'content-type': 'image/png' } })
  );
  assert.equal(await (await api.get('assets/a.png')).text(), 'good');
  const font = worker({
    fetch: async () =>
      new Response('<html>not found</html>', { headers: { 'content-type': 'text/html' } }),
  });
  await font.get('assets/font.ttf');
  assert.equal(font.entries.size, 0);
});


test('versioned image caches are separated by region and immutable release', async () => {
  let requests = 0;
  const api = worker({ fetch: async () => {
    requests++;
    return new Response('image', { headers: { 'content-type': 'image/png' } });
  } });
  for (const path of [
    'materials/regions/releases/20261108/jp/collection/icons/UI_Icon_000001.png',
    'materials/regions/releases/20261109/jp/collection/icons/UI_Icon_000001.png',
    'materials/regions/releases/20261108/cn/collection/icons/UI_Icon_000001.png',
  ]) {
    await api.get(path);
    await api.get(path);
  }
  assert.equal(requests, 3);
  assert.equal(api.entries.size, 3);
});

test('v2 JSON validation and cache are owned by the regional loader, not the legacy service worker', async () => {
  const api = worker({ fetch: async () => { throw Error('should not intercept'); } });
  assert.equal(await api.get('materials/regions/releases/20261108/index-v2.json'), undefined);
  assert.equal(await api.get('materials/regions/releases/20261108/catalogs/v2/jp/index.json'), undefined);
  assert.equal(await api.get('materials/regions/releases/20261108/catalogs/v2/jp/icons.json'), undefined);
  assert.equal(api.entries.size, 0);
});

test('order APIs and private requests bypass the asset cache even when their URLs look like assets', async () => {
  const api = worker({ fetch: async () => { throw Error('should not intercept'); } });
  assert.equal(await api.get('api/orders/preview.png'), undefined);
  assert.equal(await api.get('index.html?order-edit=' + 'a'.repeat(48)), undefined);
  assert.equal(await api.get('materials/manifest.json', { headers: { Authorization: 'Bearer test' } }), undefined);
  assert.equal(await api.get('assets/private.png', { cache: 'no-store' }), undefined);
  assert.equal(api.entries.size, 0);
});

test('only the configured COS origin can enter the cross-origin asset cache', async () => {
  const api = worker({ fetch: async request => {
    assert.equal(request.credentials, 'omit');
    assert.equal(request.redirect, 'error');
    if (new URL(request.url).searchParams.has('preview-refresh')) {
      throw new TypeError('Redirect rejected');
    }
    return new Response('image', { headers: { 'content-type': 'image/png' } });
  } });
  assert.equal(await api.get('https://other.cos.ap-shanghai.myqcloud.com/materials/preview.png'), undefined);
  const url = 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com/materials/preview.png';
  assert.equal(await (await api.get(url)).text(), 'image');
  await assert.rejects(api.get(`${url}?preview-refresh=1`), /Redirect rejected/);
  assert.equal(await (await api.get(url)).text(), 'image');
  assert.deepEqual([...api.entries.keys()], [url]);
});

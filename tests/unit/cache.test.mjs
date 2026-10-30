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
    get: async (path) => {
      let response;
      listeners.fetch({
        request: new Request(`https://example.com/MaimaiDIY/${path}`),
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

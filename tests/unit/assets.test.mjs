import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { COS } from '../../src/config.js';

const manifest = {
  schemaVersion: 1,
  categories: [
    {
      id: 'avatars',
      items: [
        { id: 'a', gameId: 1, name: 'A', file: 'a.png', genre: 'イベントちほー' },
        { id: 'b', gameId: 1, name: 'B', file: 'b.png' },
      ],
    },
  ],
};
let serial = 0;
const fresh = () => import(`../../src/assets.js?test=${serial++}`);
beforeEach((context) => context.mock.method(console, 'warn', () => {}));

test('manifest loads are shared and normalize duplicate entries', async () => {
  const oldFetch = globalThis.fetch;
  const oldStorage = globalThis.localStorage;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return Response.json(manifest);
  };
  globalThis.localStorage = { setItem() {} };
  try {
    const api = await fresh();
    const [a, b] = await Promise.all([api.loadManifest(), api.loadManifest()]);
    assert.equal(a, b);
    assert.equal(requests, 1);
    assert.equal(a.categories[0].items.length, 1);
    assert.equal(a.categories[0].items[0].group, '活动区域');
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.localStorage = oldStorage;
  }
});

test('invalid manifests never persist and a later attempt can succeed', async () => {
  const oldFetch = globalThis.fetch;
  const oldStorage = globalThis.localStorage;
  const retries = COS.retries;
  let writes = 0;
  globalThis.localStorage = {
    getItem() {
      throw Error('denied');
    },
    setItem() {
      writes++;
    },
  };
  COS.retries = 0;
  try {
    globalThis.fetch = async () => Response.json({ categories: [{}] });
    const api = await fresh();
    await assert.rejects(api.loadManifest());
    assert.equal(writes, 0);
    globalThis.fetch = async () => Response.json(manifest);
    assert.equal((await api.loadManifest()).schemaVersion, 1);
    assert.equal(writes, 1);
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.localStorage = oldStorage;
    COS.retries = retries;
  }
});

test('offline fallback is normalized and corrupt storage does not escape', async () => {
  const oldFetch = globalThis.fetch;
  const oldStorage = globalThis.localStorage;
  const retries = COS.retries;
  COS.retries = 0;
  globalThis.fetch = async () => {
    throw Error('offline');
  };
  try {
    globalThis.localStorage = { getItem: () => JSON.stringify(manifest) };
    assert.equal((await (await fresh()).loadManifest()).categories[0].items.length, 1);
    globalThis.localStorage = { getItem: () => '{' };
    await assert.rejects((await fresh()).loadManifest(), /素材库暂时不可用/);
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.localStorage = oldStorage;
    COS.retries = retries;
  }
});

test('failed image loads are evicted and retried', async () => {
  const oldImage = globalThis.Image;
  let attempts = 0;
  globalThis.Image = class {
    naturalWidth = 128;
    naturalHeight = 128;
    set src(_value) {
      queueMicrotask(() => {
        attempts++;
        if (attempts === 1) this.onerror(Error('failed'));
        else this.onload();
      });
    }
  };
  try {
    const api = await fresh();
    await assert.rejects(api.loadImage('a.png'));
    await api.loadImage('a.png');
    await api.loadImage('a.png');
    assert.equal(attempts, 2);
  } finally {
    globalThis.Image = oldImage;
  }
});

test('a preview refresh shares matching image requests and replaces the export cache', async () => {
  const oldImage = globalThis.Image;
  const requests = [];
  globalThis.Image = class {
    naturalWidth = 128;
    naturalHeight = 128;
    set src(value) {
      requests.push(value);
      queueMicrotask(() => value.endsWith('preview-refresh=failed')
        ? this.onerror(new Error('offline')) : this.onload());
    }
  };
  try {
    const api = await fresh();
    const source = COS.baseUrl + '/materials/avatars/UI_Icon_900001.png';
    const original = await api.loadImage(source);
    const refresh = api.loadImage(source, 'refresh-one');
    assert.equal(api.loadImage(source, 'refresh-one'), refresh);
    assert.notEqual(await refresh, original);
    assert.equal(api.loadImage(source), refresh);
    const failedRefresh = api.loadImage(source, 'failed');
    assert.equal(api.loadImage(source), refresh);
    await assert.rejects(failedRefresh, /offline/);
    assert.equal(api.loadImage(source), refresh);
    const next = api.loadImage(source, 'refresh-two');
    assert.notEqual(next, refresh);
    await next;
    assert.equal(api.loadImage(source), next);
    assert.deepEqual(requests, ['','?preview-refresh=refresh-one','?preview-refresh=failed','?preview-refresh=refresh-two']
      .map(query => source + query));
  } finally {
    globalThis.Image = oldImage;
  }
});

test('permanent HTTP failures stop immediately and retain their status', async () => {
  const oldFetch = globalThis.fetch;
  try {
    const api = await fresh();
    for (const status of [403, 404, 451]) {
      let requests = 0;
      globalThis.fetch = async () => {
        requests++;
        return new Response('unavailable', { status });
      };
      await assert.rejects(api.fetchJson('https://example.com/materials/manifest.json'), { status });
      assert.equal(requests, 1);
    }
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('transient HTTP failures still retry and recover', async () => {
  const oldFetch = globalThis.fetch;
  try {
    const api = await fresh();
    for (const status of [408, 429, 503]) {
      let requests = 0;
      globalThis.fetch = async () => ++requests === 1
        ? new Response('try again', { status })
        : Response.json(manifest);
      assert.deepEqual(await api.fetchJson('https://example.com/materials/manifest.json'), manifest);
      assert.equal(requests, 2);
    }
  } finally {
    globalThis.fetch = oldFetch;
  }
});

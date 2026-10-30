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

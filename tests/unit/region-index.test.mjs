import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  REGION_BASE_URL, REGION_RELEASE_ID, REGION_CATEGORIES, REGION_RELEASE_ROOT,
  REGION_INDEX_CACHE_PREFIX, createRegionIndexLoader, imageToReleasePath,
  makeCategoryIndex, validateCategoryIndex, validateRegionIndex, validateReleaseIndex,
  validateLegacyCatalog,
} from '../../src/region-index.js';
import { buildRegionalIndex, generateRegionalIndex, encodeIndex, indexReference } from '../../tools/build-region-index.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
function sampleCatalogs() {
  const result = {};
  for (const region of ['cn', 'jp']) {
    result[region] = {
      schemaVersion: 1, region, version: region === 'cn' ? '舞萌DX2026' : 'MAGiCAL',
      generatedAt: '2026-11-08T10:56:12.271Z', sources: [{ name: 'Original source', commit: 'pinned' }],
      availability: { art: region === 'cn' ? 'unavailable' : 'partial', note: '保留来源说明' },
      frames: [], plates: [], icons: [], charas: [],
      songs: [{ id: '8:sd', musicId: 8, name: 'True Love Song', artist: 'Kai', category: 'maimai', aliases: ['真爱歌'],
        image: `${REGION_BASE_URL}shared/saltmeta/covers/000008.png`,
        charts: [{ difficulty: 1, level: region === 'cn' ? '7' : '7+', version: 'maimai' }, { difficulty: 3, level: '12', version: null }] }],
    };
  }
  result.jp.classification = { note: 'No guessed release versions', counts: { frames: { 'source-name-only': 1 } } };
  for (const [category, type] of Object.entries({ frames: 'Frame', plates: 'Plate', icons: 'Icon', charas: 'Chara' })) {
    result.jp[category] = [{ id: '000001', name: type, image: `${REGION_BASE_URL}jp/collection/${category}/UI_${type}_000001.png`, group: '来源分组', classification: { basis: 'source-name-only', version: null } }];
  }
  return result;
}
function fixture() { return buildRegionalIndex({ catalogs: sampleCatalogs() }); }
class MemoryCacheStorage {
  stores = new Map();
  opens = [];
  async open(name) {
    this.opens.push(name);
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    const store = this.stores.get(name);
    return {
      match: async key => store.get(String(key))?.clone(),
      put: async (key, response) => { store.set(String(key), response.clone()); },
    };
  }
}
function testNetwork(files = fixture().files, overrides = new Map()) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (overrides.has(url)) return overrides.get(url)(url, options);
    if (url.startsWith('./data/regions/')) {
      const region = /\/(cn|jp)\.json$/.exec(url)?.[1];
      return Response.json(sampleCatalogs()[region]);
    }
    const bytes = files.get(url.slice(REGION_BASE_URL.length));
    return bytes ? new Response(bytes) : new Response('missing', { status: 404 });
  };
  return { fetchImpl, calls, overrides };
}
function loader(network, extra = {}) {
  return createRegionIndexLoader({ fetchImpl: network.fetchImpl, cryptoImpl: webcrypto, cacheStorage: new MemoryCacheStorage(), retries: 0, retryDelay: 0, ...extra });
}
function rewriteCategory(files, region, category, mutate) {
  const path = `catalogs/v2/${region}/${category}.json`;
  const shard = JSON.parse(files.get(path));
  mutate(shard);
  const bytes = encodeIndex(shard);
  files.set(path, bytes);
  const indexPath = `catalogs/v2/${region}/index.json`;
  const index = JSON.parse(files.get(indexPath));
  index.categories[category] = indexReference(path, bytes, shard.count);
  const indexBytes = encodeIndex(index);
  files.set(indexPath, indexBytes);
  const root = JSON.parse(files.get('index-v2.json'));
  root.regions[region] = indexReference(indexPath, indexBytes);
  files.set('index-v2.json', encodeIndex(root));
}

test('generator is deterministic, retains metadata, and references exact full bytes', () => {
  const a = fixture(), b = fixture();
  assert.deepEqual([...a.files], [...b.files]);
  assert.equal(a.files.size, 13);
  const source = sampleCatalogs();
  for (const region of ['cn', 'jp']) {
    const index = JSON.parse(a.files.get(a.root.regions[region].path));
    assert.deepEqual(index.sources, source[region].sources);
    assert.deepEqual(index.availability, source[region].availability);
    assert.deepEqual(index.classification, source[region].classification);
    for (const category of REGION_CATEGORIES) {
      const ref = index.categories[category];
      const bytes = a.files.get(ref.path);
      assert.equal(ref.bytes, bytes.length);
      assert.equal(ref.sha256, createHash('sha256').update(bytes).digest('hex'));
      const shard = JSON.parse(bytes);
      assert.equal(shard.count, source[region][category].length);
      for (const id of shard.order) {
        const old = source[region][category].find(item => String(item.id) === id);
        const { image, ...rest } = old;
        assert.deepEqual(shard.byId[id], { ...rest, path: image.slice(REGION_BASE_URL.length) });
      }
      assert.deepEqual(shard.groups.flatMap(group => group.ids).sort(), [...shard.order].sort());
    }
  }
  assert.notEqual(JSON.parse(a.files.get('catalogs/v2/cn/songs.json')).byId['8:sd'].charts[0].level,
    JSON.parse(a.files.get('catalogs/v2/jp/songs.json')).byId['8:sd'].charts[0].level);
});

test('actual bundled sources rebuild with exact counts, grouping, classification and regional charts', async () => {
  const catalogs = {};
  for (const region of ['cn', 'jp']) {
    catalogs[region] = JSON.parse(await readFile(new URL(`../../data/regions/${region}.json`, import.meta.url), 'utf8'));
    for (const category of REGION_CATEGORIES) for (const item of catalogs[region][category])
      item.image = REGION_BASE_URL + imageToReleasePath(item.image, region, category, REGION_BASE_URL, true);
  }
  const built = buildRegionalIndex({ catalogs });
  assert.deepEqual(built.counts, { cn: { frames: 0, plates: 0, icons: 0, charas: 0, songs: 1375 }, jp: { frames: 574, plates: 539, icons: 1631, charas: 1436, songs: 1587 } });
  for (const region of ['cn', 'jp']) for (const category of REGION_CATEGORIES) {
    const shard = JSON.parse(built.files.get(`catalogs/v2/${region}/${category}.json`));
    for (const original of catalogs[region][category]) {
      const indexed = shard.byId[String(original.id)];
      assert.deepEqual(indexed.classification, original.classification);
      assert.deepEqual(indexed.charts, original.charts);
      assert.equal(indexed.group, original.group);
    }
  }
});

test('file generator emits full COS key paths, public schema and counts manifest', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maimai-index-'));
  try {
    const input = join(directory, 'input');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(input);
    const source = sampleCatalogs();
    for (const region of ['cn', 'jp']) await writeFile(join(input, `${region}.json`), encodeIndex(source[region]));
    const output = join(directory, 'output');
    const manifest = await generateRegionalIndex({ inputDir: input, outputDir: output });
    assert.equal(manifest.files.length, 14);
    for (const entry of manifest.files) {
      const bytes = await readFile(join(output, entry.path));
      assert.equal(entry.bytes, bytes.length);
      assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'));
      assert.equal(entry.cosKey, `materials/${entry.path}`);
    }
    assert.deepEqual(JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')), manifest);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('generator rejects duplicate IDs, unsafe keys and foreign/legacy/traversal URLs', () => {
  const badImages = [
    `${REGION_BASE_URL}jp/collection/frames/../icons/UI_Icon_000001.png`,
    `${REGION_BASE_URL}jp/collection/frames/%2e%2e/UI_Frame_000001.png`,
    `${REGION_BASE_URL}jp/collection/frames/UI_Frame_000001.png?x=1`,
    `${REGION_BASE_URL}jp/collection/frames/UI_Frame_000001.png#x`,
    `${REGION_BASE_URL}cn/collection/frames/UI_Frame_000001.png`,
    'https://evil.example/jp/collection/frames/UI_Frame_000001.png',
    'https://raw.githubusercontent.com/basilomorireal/maimai-asset-browser/0ebcd319585af286bce5c31cc416fcf245e28428/assets/frames/UI_Frame_000001.png',
  ];
  for (const image of badImages) {
    const catalogs = sampleCatalogs(); catalogs.jp.frames[0].image = image;
    assert.throws(() => buildRegionalIndex({ catalogs }));
  }
  for (const id of ['__proto__', 'constructor', 'prototype', '../1', 'a?b']) {
    const catalogs = sampleCatalogs(); catalogs.jp.frames[0].id = id;
    assert.throws(() => buildRegionalIndex({ catalogs }));
  }
  const duplicate = sampleCatalogs(); duplicate.jp.frames.push(clone(duplicate.jp.frames[0]));
  assert.throws(() => buildRegionalIndex({ catalogs: duplicate }), /重复/);
  const malicious = sampleCatalogs(); malicious.jp.frames[0].classification = JSON.parse('{"__proto__": {"polluted":true}}');
  assert.throws(() => buildRegionalIndex({ catalogs: malicious }), /保留/);
});

test('category validation rejects order/byId/group mismatch, duplicate groups and cross-region art', () => {
  const good = makeCategoryIndex(sampleCatalogs().jp.frames, { region: 'jp', category: 'frames' });
  const mutations = [
    shard => { shard.order.push(shard.order[0]); },
    shard => { shard.order[0] = '999999'; },
    shard => { shard.byId['000001'].id = '000002'; },
    shard => { shard.byId['000001'].region = 'cn'; },
    shard => { shard.byId['000001'].image = 'https://evil.example/a.png'; },
    shard => { shard.byId['000001'].path = 'jp/collection/icons/UI_Icon_000001.png'; },
    shard => { shard.byId['000001'].path = 'jp/collection/frames/UI_Frame_000002.png'; },
    shard => { shard.groups = []; },
    shard => { shard.groups[0].ids.push('000001'); },
    shard => { shard.groups.push(clone(shard.groups[0])); },
    shard => { shard.groups[0].label = 'invented'; },
    shard => { shard.groups[0].ids = ['not-present']; },
    shard => { shard.count = 2; },
    shard => { shard.category = 'icons'; },
    shard => { shard.region = 'cn'; },
    shard => { shard.releaseId = '20261109'; },
    shard => { shard.schemaVersion = 1; },
  ];
  for (const change of mutations) {
    const shard = clone(good); change(shard);
    assert.throws(() => validateCategoryIndex(shard, { region: 'jp', category: 'frames', count: 1 }));
  }
  assert.throws(() => validateCategoryIndex(good, { region: 'cn', category: 'frames' }));
});

test('root and regional references only address this release, origin and exact regional shard', () => {
  const built = fixture();
  for (const mutation of [
    root => { root.baseUrl = 'https://evil.example/'; },
    root => { root.releaseId = '20261109'; },
    root => { root.regions.cn.path = 'catalogs/v2/jp/index.json'; },
    root => { root.regions.jp.sha256 = 'broken'; },
    root => { root.regions.jp.bytes = -1; },
    root => { root.schemaVersion = 1; },
  ]) {
    const root = clone(built.root); mutation(root);
    assert.throws(() => validateReleaseIndex(root));
  }
  const index = JSON.parse(built.files.get('catalogs/v2/cn/index.json'));
  index.categories.frames.count = 1;
  assert.throws(() => validateRegionIndex(index, { region: 'cn' }));
  assert.throws(() => createRegionIndexLoader({ baseUrl: 'https://evil.example/' }));
});

test('loader deduplicates catalog, category, region and root requests and freezes indexes', async () => {
  const network = testNetwork(); const api = loader(network);
  const first = api.loadCatalog('jp');
  assert.equal(first, api.loadCatalog('jp'));
  const [jp, frames, cn] = await Promise.all([first, api.loadCategory('jp', 'frames'), api.loadCatalog('cn')]);
  assert.equal(jp.sourceStatus.kind, 'v2-network');
  assert.equal(jp.schemaVersion, 2);
  assert.equal(jp.frames[0].image, `${REGION_BASE_URL}jp/collection/frames/UI_Frame_000001.png`);
  assert.equal(jp.indexes.frames.byId['000001'], jp.frames[0]);
  assert.equal(frames.groups[0].count, 1);
  assert.deepEqual(frames.items, jp.frames);
  assert.equal(cn.charas.length, 0);
  assert.equal(network.calls.length, 13);
  assert.equal(new Set(network.calls.map(call => call.url)).size, 13);
  assert.ok(network.calls.every(call => call.options.credentials === 'omit' && call.options.redirect === 'error'));
  assert.ok(Object.isFrozen(jp.indexes.frames.byId['000001']));
  assert.throws(() => { jp.frames[0].name = 'mutated'; }, TypeError);
});

test('loader retries transient failures, evicts rejected promises and never retries denied access', async () => {
  const network = testNetwork(); let attempts = 0;
  network.overrides.set(`${REGION_BASE_URL}index-v2.json`, () => ++attempts === 1 ? new Response('later', { status: 503 }) : new Response(fixture().files.get('index-v2.json')));
  const api = loader(network, { retries: 1 });
  assert.equal((await api.loadCatalog('jp')).sourceStatus.kind, 'v2-network');
  assert.equal(attempts, 2);
  for (const status of [401, 403, 451]) {
    const denied = testNetwork(); denied.overrides.set(`${REGION_BASE_URL}index-v2.json`, () => new Response('denied', { status }));
    const deniedApi = loader(denied, { retries: 2 });
    await assert.rejects(deniedApi.loadCatalog('jp'), { code: 'ACCESS_DENIED' });
    assert.equal(denied.calls.length, 1);
    denied.overrides.clear();
    assert.equal((await deniedApi.loadCatalog('jp')).sourceStatus.kind, 'v2-network');
  }
});

test('404 uses a complete explicit v1 fallback with canonical images and unchanged source metadata', async () => {
  const network = testNetwork(new Map()); const api = loader(network, { retries: 2 });
  const catalog = await api.loadCatalog('jp');
  assert.equal(catalog.sourceStatus.kind, 'v1-fallback');
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(network.calls.length, 2);
  assert.deepEqual(catalog.sources, sampleCatalogs().jp.sources);
  for (const category of REGION_CATEGORIES) assert.equal(catalog[category].length, 1);
  const original = JSON.parse(await readFile(new URL('../../data/regions/jp.json', import.meta.url), 'utf8'));
  const validated = validateLegacyCatalog(original, { region: 'jp' });
  assert.ok(validated.frames[0].image.startsWith(REGION_BASE_URL));
  assert.ok(validated.songs[0].image.startsWith(`${REGION_BASE_URL}shared/saltmeta/covers/`));
  assert.deepEqual(validated.sources, original.sources);
});

test('missing shard falls back as a whole and never persists partial network data', async () => {
  const built = fixture(); built.files.delete('catalogs/v2/jp/icons.json');
  const network = testNetwork(built.files); const storage = new MemoryCacheStorage();
  const catalog = await loader(network, { cacheStorage: storage }).loadCatalog('jp');
  assert.equal(catalog.sourceStatus.kind, 'v1-fallback');
  assert.ok(REGION_CATEGORIES.every(category => catalog[category].length === 1));
  assert.equal(storage.stores.get(`${REGION_INDEX_CACHE_PREFIX}${REGION_RELEASE_ID}`).size, 0);
});

test('digest and byte failures are fatal before parsing and never invoke v1', async () => {
  for (const corrupt of [bytes => Buffer.from(bytes.toString().replace('Frame', 'Flame')), () => Buffer.from('{')]) {
    const built = fixture(); const path = 'catalogs/v2/jp/frames.json'; built.files.set(path, corrupt(built.files.get(path)));
    const network = testNetwork(built.files);
    await assert.rejects(loader(network).loadCatalog('jp'), /字节数|摘要/);
    assert.ok(network.calls.every(call => !call.url.startsWith('./data/')));
  }
});

test('signed malformed/cross-region shard is rejected, including when another shard is missing', async () => {
  const built = fixture();
  rewriteCategory(built.files, 'jp', 'frames', shard => { shard.region = 'cn'; });
  built.files.delete('catalogs/v2/jp/icons.json');
  const network = testNetwork(built.files);
  await assert.rejects(loader(network).loadCatalog('jp'), /区服/);
  assert.ok(network.calls.every(call => !call.url.startsWith('./data/')));
});

test('duplicate JSON keys, invalid UTF-8 and stale schemas are rejected without fallback', async () => {
  for (const bytes of [
    Buffer.from(fixture().files.get('index-v2.json').toString().replace('"schemaVersion": 2,', '"schemaVersion": 1, "schemaVersion": 2,')),
    Buffer.from([0xff, 0xfe, 0xfd]),
    Buffer.from('{"schemaVersion":1}'),
  ]) {
    const built = fixture(); built.files.set('index-v2.json', bytes);
    const network = testNetwork(built.files);
    await assert.rejects(loader(network).loadCatalog('jp'), { code: 'INVALID_INDEX' });
    assert.equal(network.calls.length, 1);
  }
});

test('fully validated same-release CacheStorage works offline across loader instances', async () => {
  const storage = new MemoryCacheStorage();
  const network = testNetwork(); const online = await loader(network, { cacheStorage: storage }).loadCatalog('jp');
  const offlineCalls = [];
  const offline = loader({ fetchImpl: async url => { offlineCalls.push(url); throw Error('offline'); } }, { cacheStorage: storage });
  const cached = await offline.loadCatalog('jp');
  assert.equal(cached.sourceStatus.kind, 'v2-cache');
  assert.deepEqual(cached.frames, online.frames);
  assert.equal(offlineCalls.length, 1);
  assert.deepEqual([...storage.stores.keys()], [`${REGION_INDEX_CACHE_PREFIX}${REGION_RELEASE_ID}`]);
});

test('an old release cache cannot satisfy a newer release or wrong-region request', async () => {
  const storage = new MemoryCacheStorage();
  await loader(testNetwork(), { cacheStorage: storage }).loadCatalog('jp');
  const offline = { fetchImpl: async () => { throw Error('offline'); } };
  const newer = loader(offline, { cacheStorage: storage, releaseId: '20261109', baseUrl: `${REGION_RELEASE_ROOT}20261109/`, allowLegacy: false });
  await assert.rejects(newer.loadCatalog('jp'), { code: 'INDEX_UNAVAILABLE' });
  await assert.rejects(loader(offline, { cacheStorage: storage, allowLegacy: false }).loadCatalog('cn'), { code: 'INDEX_UNAVAILABLE' });
});

test('corrupt same-release cache is fatal; incomplete cache can use complete v1 compatibility', async () => {
  for (const corrupt of [true, false]) {
    const storage = new MemoryCacheStorage();
    await loader(testNetwork(), { cacheStorage: storage }).loadCatalog('jp');
    const store = storage.stores.get(`${REGION_INDEX_CACHE_PREFIX}${REGION_RELEASE_ID}`);
    const key = `${REGION_BASE_URL}catalogs/v2/jp/frames.json`;
    if (corrupt) store.set(key, new Response('{'));
    else store.delete(key);
    const calls = [];
    const network = { fetchImpl: async url => { calls.push(url); if (url.startsWith('./data/')) return Response.json(sampleCatalogs().jp); throw Error('offline'); } };
    const api = loader(network, { cacheStorage: storage });
    if (corrupt) {
      await assert.rejects(api.loadCatalog('jp'), { code: 'INVALID_INDEX' });
      assert.equal(calls.length, 1);
    } else assert.equal((await api.loadCatalog('jp')).sourceStatus.kind, 'v1-fallback');
  }
});

test('cache unavailability/quota does not break validated network results; missing crypto fails closed', async () => {
  const network = testNetwork();
  const cacheStorage = { open: async () => ({ put: async () => { throw Error('quota'); } }) };
  assert.equal((await loader(network, { cacheStorage }).loadCatalog('jp')).sourceStatus.kind, 'v2-network');
  await assert.rejects(loader(testNetwork(), { cryptoImpl: null }).loadCatalog('jp'), /摘要/);
});

test('invalid promises can be retried after the exact expected bytes become available', async () => {
  const built = fixture(); const path = 'catalogs/v2/jp/frames.json'; const valid = built.files.get(path);
  built.files.set(path, Buffer.from('{'));
  const api = loader(testNetwork(built.files));
  await assert.rejects(api.loadCatalog('jp'));
  built.files.set(path, valid);
  assert.equal((await api.loadCatalog('jp')).sourceStatus.kind, 'v2-network');
});


test('song IDs, music IDs and exact final-four-digit cover mapping must agree', () => {
  const original = sampleCatalogs().jp.songs[0];
  for (const change of [
    song => { song.id = '9:sd'; },
    song => { song.musicId = '8'; },
    song => { song.musicId = -8; },
    song => { song.id = '8:std'; },
    song => { song.image = `${REGION_BASE_URL}shared/saltmeta/covers/000009.png`; },
  ]) {
    const song = clone(original); change(song);
    assert.throws(() => makeCategoryIndex([song], { region: 'jp', category: 'songs' }));
  }
  const dx = clone(original); dx.id = '10008:dx'; dx.musicId = 10008; dx.charts[0].version = 2026;
  assert.equal(makeCategoryIndex([dx], { region: 'jp', category: 'songs' }).byId['10008:dx'].path, 'shared/saltmeta/covers/000008.png');
});


test('optional UI metadata rejects malformed aliases, artist, groups and classification before registration', async () => {
  const invalidFields = [
    ['aliases', { alias: 'x' }], ['aliases', 'text'], ['aliases', null],
    ['aliases', [12]], ['aliases', [null]], ['aliases', [['nested']]],
    ['aliases', Array(257).fill('x')], ['aliases', ['x'.repeat(1025)]],
    ['artist', { name: 'x' }], ['artist', null],
    ['group', ['x']], ['genre', { label: 'x' }], ['category', 42],
    ['classification', []], ['classification', 'unknown'], ['classification', null],
  ];
  for (const [field, value] of invalidFields) {
    const source = sampleCatalogs();
    source.jp.songs[0][field] = value;
    assert.throws(() => buildRegionalIndex({ catalogs: source }), { code: 'INVALID_INDEX' });
    assert.throws(() => validateLegacyCatalog(source.jp, { region: 'jp' }), { code: 'INVALID_INDEX' });
    const built = fixture();
    rewriteCategory(built.files, 'jp', 'songs', shard => { shard.byId['8:sd'][field] = value; });
    const network = testNetwork(built.files);
    await assert.rejects(loader(network).loadCatalog('jp'), { code: 'INVALID_INDEX' });
    assert.ok(network.calls.every(call => !call.url.startsWith('./data/')));
  }
  for (const aliases of [[], ['literal', '日本語', '中文'], Array(256).fill('x'), ['x'.repeat(1024)]]) {
    const song = clone(sampleCatalogs().jp.songs[0]); song.aliases = aliases;
    assert.deepEqual(makeCategoryIndex([song], { region: 'jp', category: 'songs' }).byId['8:sd'].aliases, aliases);
  }
});

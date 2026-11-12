// Immutable regional index protocol. This module is also used by the offline builder.
export const REGION_RELEASE_ID = '20261108';
export const REGION_RELEASE_ROOT =
  'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com/materials/regions/releases/';
export const REGION_BASE_URL = `${REGION_RELEASE_ROOT}${REGION_RELEASE_ID}/`;
export const REGION_CATEGORIES = Object.freeze(['frames', 'plates', 'icons', 'charas', 'songs']);
export const REGION_INDEX_CACHE_PREFIX = 'maimai-regional-index-v2:';
const REGIONS = ['cn', 'jp'];
const ART_NAMES = { frames: 'Frame', plates: 'Plate', icons: 'Icon', charas: 'Chara' };
const LEGACY_ART_ROOT =
  'https://raw.githubusercontent.com/basilomorireal/maimai-asset-browser/0ebcd319585af286bce5c31cc416fcf245e28428/assets/';
const LEGACY_COVER_ROOT =
  'https://raw.githubusercontent.com/realtvop/SaltMeta/d327942662643b391b6883ba40dd0b89e9a1d169/covers/';

export function regionalImageFallback(url) {
  if (typeof url !== 'string' || !url.startsWith(REGION_BASE_URL)) return null;
  const path = url.slice(REGION_BASE_URL.length);
  if (/^jp\/collection\/(?:frames\/UI_Frame|plates\/UI_Plate|icons\/UI_Icon|charas\/UI_Chara)_\d{6}\.png$/.test(path))
    return LEGACY_ART_ROOT + path.slice('jp/collection/'.length);
  if (/^shared\/saltmeta\/covers\/\d{6}\.png$/.test(path))
    return LEGACY_COVER_ROOT + path.slice('shared/saltmeta/covers/'.length);
  return null;
}
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;

export class RegionIndexError extends Error {
  constructor(message, code = 'INVALID_INDEX', options) {
    super(message, options);
    this.name = 'RegionIndexError';
    this.code = code;
  }
}
const invalid = message => { throw new RegionIndexError(`地区素材索引无效：${message}`); };
function requireValue(condition, message) { if (!condition) invalid(message); }
export function requireIndexRegion(region) {
  requireValue(REGIONS.includes(region), '区服');
  return region;
}
export function requireIndexCategory(category) {
  requireValue(REGION_CATEGORIES.includes(category), '分类');
  return category;
}
function exactKeys(value, keys) {
  requireValue(record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), '字段集合');
}
function safeTree(value, depth = 0) {
  requireValue(depth <= 32, '嵌套过深');
  if (value !== null && typeof value === 'object') {
    requireValue(Array.isArray(value) || record(value), '对象');
    for (const [key, child] of Object.entries(value)) {
      requireValue(!FORBIDDEN_KEYS.has(key), '保留字段');
      safeTree(child, depth + 1);
    }
  }
  return value;
}
function freezeTree(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}
export function validateReleaseLocation(releaseId, baseUrl) {
  requireValue(typeof releaseId === 'string' && /^\d{8}$/.test(releaseId), '发布编号');
  requireValue(baseUrl === `${REGION_RELEASE_ROOT}${releaseId}/`, '发布地址');
  return baseUrl;
}
export function indexItemKey(id) {
  requireValue(
    (typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}(?::(?:dx|sd|std))?$/.test(id)) || integer(id),
    '素材编号'
  );
  const key = String(id);
  requireValue(!FORBIDDEN_KEYS.has(key), '保留编号');
  return key;
}
export function indexGroupLabel(item) {
  for (const field of ['group', 'genre', 'category']) {
    if (Object.hasOwn(item, field)) requireValue(typeof item[field] === 'string', '分组名称');
  }
  return item.group || item.genre || item.category || '来源未分类';
}
export function validateAssetPath(path, region, category) {
  requireIndexRegion(region);
  requireIndexCategory(category);
  requireValue(typeof path === 'string', '素材路径');
  const pattern = category === 'songs'
    ? /^shared\/saltmeta\/covers\/\d{6}\.png$/
    : new RegExp(`^jp/collection/${category}/UI_${ART_NAMES[category]}_\\d{6}\\.png$`);
  requireValue((category === 'songs' || region === 'jp') && pattern.test(path), '素材路径或区服');
  return path;
}
export function imageToReleasePath(image, region, category, baseUrl = REGION_BASE_URL, allowLegacy = false) {
  requireValue(typeof image === 'string', '图片地址');
  let path;
  if (image.startsWith(baseUrl)) path = image.slice(baseUrl.length);
  else if (allowLegacy && category === 'songs' && image.startsWith(LEGACY_COVER_ROOT))
    path = `shared/saltmeta/covers/${image.slice(LEGACY_COVER_ROOT.length)}`;
  else if (allowLegacy && category !== 'songs' && image.startsWith(LEGACY_ART_ROOT))
    path = `jp/collection/${image.slice(LEGACY_ART_ROOT.length)}`;
  else invalid('图片来源');
  return validateAssetPath(path, region, category);
}
function envelope(data, kind, releaseId, region) {
  safeTree(data);
  requireValue(record(data) && data.schemaVersion === 2 && data.kind === kind && data.releaseId === releaseId, '版本或发布编号');
  if (region !== undefined) requireValue(data.region === region, '区服不匹配');
}
function reference(data, path, includeCount = false) {
  exactKeys(data, includeCount ? ['path', 'count', 'sha256', 'bytes'] : ['path', 'sha256', 'bytes']);
  requireValue(data.path === path && /^[a-f0-9]{64}$/.test(data.sha256), '引用路径或摘要');
  requireValue(integer(data.bytes) && data.bytes > 0 && data.bytes <= MAX_JSON_BYTES, '引用大小');
  if (includeCount) requireValue(integer(data.count) && data.count <= 100000, '分类数量');
}
function metadata(data) {
  requireValue(typeof data.version === 'string' && data.version.length > 0, '游戏版本');
  requireValue(typeof data.generatedAt === 'string' && Number.isFinite(Date.parse(data.generatedAt)), '来源时间');
  requireValue(Array.isArray(data.sources) && data.sources.every(record), '来源说明');
  requireValue(record(data.availability) && typeof data.availability.art === 'string', '素材可用性');
  if (Object.hasOwn(data, 'classification')) requireValue(record(data.classification), '分类依据');
}
export function validateReleaseIndex(data, { releaseId = REGION_RELEASE_ID, baseUrl = REGION_BASE_URL } = {}) {
  validateReleaseLocation(releaseId, baseUrl);
  envelope(data, 'regional-release', releaseId);
  exactKeys(data, ['schemaVersion', 'kind', 'releaseId', 'baseUrl', 'regions']);
  requireValue(data.baseUrl === baseUrl, '发布地址不匹配');
  exactKeys(data.regions, REGIONS);
  for (const region of REGIONS) reference(data.regions[region], `catalogs/v2/${region}/index.json`);
  return data;
}
export function validateRegionIndex(data, { releaseId = REGION_RELEASE_ID, region } = {}) {
  requireIndexRegion(region);
  envelope(data, 'region-index', releaseId, region);
  exactKeys(data, ['schemaVersion', 'kind', 'releaseId', 'region', 'version', 'generatedAt', 'sources', 'availability', 'categories', ...(Object.hasOwn(data, 'classification') ? ['classification'] : [])]);
  metadata(data);
  exactKeys(data.categories, REGION_CATEGORIES);
  for (const category of REGION_CATEGORIES) {
    reference(data.categories[category], `catalogs/v2/${region}/${category}.json`, true);
    if (region === 'cn' && category !== 'songs') requireValue(data.categories[category].count === 0, '国服素材尚未收录');
  }
  return data;
}
function validateItem(item, key, region, category) {
  requireValue(record(item) && indexItemKey(item.id) === key && typeof item.name === 'string', '素材内容或编号');
  requireValue(!Object.hasOwn(item, 'region') || item.region === region, '素材区服');
  requireValue(!Object.hasOwn(item, 'image'), 'v2 应使用相对路径');
  requireValue(!Object.hasOwn(item, 'artist') || typeof item.artist === 'string', '作者名称');
  if (Object.hasOwn(item, 'aliases')) {
    requireValue(Array.isArray(item.aliases) && item.aliases.length <= 256 &&
      item.aliases.every(alias => typeof alias === 'string' && alias.length <= 1024), '别名列表');
  }
  if (Object.hasOwn(item, 'classification')) requireValue(record(item.classification), '素材分类依据');
  validateAssetPath(item.path, region, category);
  indexGroupLabel(item);
  if (category === 'songs') {
    requireValue(integer(item.musicId) && new RegExp(`^${item.musicId}:(?:sd|dx)$`).test(key), '曲目编号');
    requireValue(item.path === `shared/saltmeta/covers/${String(item.musicId % 10000).padStart(6, '0')}.png`, '曲绘与曲目编号不匹配');
    requireValue(Array.isArray(item.charts) && item.charts.length > 0, '谱面列表');
    const seen = new Set();
    for (const chart of item.charts) {
      requireValue(record(chart) && integer(chart.difficulty) && chart.difficulty <= 4 && !seen.has(chart.difficulty), '谱面难度');
      requireValue(typeof chart.level === 'string' && (chart.version === null || typeof chart.version === 'string' || integer(chart.version)), '谱面等级或版本');
      seen.add(chart.difficulty);
    }
  } else {
    requireValue(/^\d{1,6}$/.test(key) && item.path === `jp/collection/${category}/UI_${ART_NAMES[category]}_${key.padStart(6, '0')}.png`, '图片与素材编号不匹配');
  }
}
export function validateCategoryIndex(data, { releaseId = REGION_RELEASE_ID, region, category, count } = {}) {
  requireIndexRegion(region);
  requireIndexCategory(category);
  envelope(data, 'region-category', releaseId, region);
  exactKeys(data, ['schemaVersion', 'kind', 'releaseId', 'region', 'category', 'count', 'order', 'byId', 'groups']);
  requireValue(data.category === category && integer(data.count) && data.count <= 100000 && (count === undefined || data.count === count), '分类或数量不匹配');
  requireValue(Array.isArray(data.order) && record(data.byId) && Array.isArray(data.groups), '索引结构');
  requireValue(data.order.length === data.count && Object.keys(data.byId).length === data.count, '索引数量');
  const ordered = new Set();
  for (const id of data.order) {
    requireValue(typeof id === 'string' && indexItemKey(id) === id && !ordered.has(id) && Object.hasOwn(data.byId, id), '顺序与编号映射');
    validateItem(data.byId[id], id, region, category);
    ordered.add(id);
  }
  const grouped = new Set();
  const labels = new Set();
  for (const group of data.groups) {
    exactKeys(group, ['label', 'ids']);
    requireValue(typeof group.label === 'string' && group.label.length > 0 && !labels.has(group.label) && Array.isArray(group.ids) && group.ids.length > 0, '分组');
    labels.add(group.label);
    for (const id of group.ids) {
      requireValue(typeof id === 'string' && ordered.has(id) && !grouped.has(id) && indexGroupLabel(data.byId[id]) === group.label, '分组成员');
      grouped.add(id);
    }
  }
  requireValue(grouped.size === data.count, '分组覆盖不完整');
  return data;
}
export function makeCategoryIndex(items, { releaseId = REGION_RELEASE_ID, region, category, baseUrl = REGION_BASE_URL, allowLegacy = false } = {}) {
  requireValue(Array.isArray(items), '分类列表');
  const byId = Object.create(null);
  const order = [];
  const groupMap = new Map();
  for (const item of items) {
    requireValue(record(item), '素材对象');
    const key = indexItemKey(item.id);
    requireValue(!Object.hasOwn(byId, key) && !Object.hasOwn(item, 'path'), '重复编号或路径');
    const { image, ...fields } = item;
    byId[key] = { ...fields, path: imageToReleasePath(image, region, category, baseUrl, allowLegacy) };
    order.push(key);
    const label = indexGroupLabel(item);
    if (!groupMap.has(label)) groupMap.set(label, []);
    groupMap.get(label).push(key);
  }
  return validateCategoryIndex({ schemaVersion: 2, kind: 'region-category', releaseId, region, category, count: order.length, order, byId, groups: [...groupMap].map(([label, ids]) => ({ label, ids })) }, { releaseId, region, category });
}
function categoryView(shard, baseUrl, originalItems) {
  const byId = Object.create(null);
  for (const id of shard.order) {
    const item = shard.byId[id];
    byId[id] = { ...(originalItems ? originalItems.get(id) : item), image: `${baseUrl}${item.path}` };
  }
  return { order: shard.order, byId, groups: shard.groups.map(group => ({ ...group, count: group.ids.length })) };
}
function catalogView(index, shards, baseUrl, sourceStatus) {
  const meta = { ...index };
  delete meta.categories;
  delete meta.kind;
  const catalog = { ...meta, sourceStatus, indexes: Object.create(null) };
  for (const category of REGION_CATEGORIES) {
    const view = categoryView(shards[category], baseUrl);
    catalog.indexes[category] = view;
    catalog[category] = view.order.map(id => view.byId[id]);
  }
  return freezeTree(catalog);
}
export function validateLegacyCatalog(data, { region, releaseId = REGION_RELEASE_ID, baseUrl = REGION_BASE_URL, reason = 'v2 暂不可用' } = {}) {
  requireIndexRegion(region);
  validateReleaseLocation(releaseId, baseUrl);
  safeTree(data);
  requireValue(record(data) && data.schemaVersion === 1 && data.region === region, '兼容目录区服或版本');
  metadata(data);
  const catalog = { ...data, releaseId, sourceStatus: { kind: 'v1-fallback', releaseId, reason }, indexes: Object.create(null) };
  for (const category of REGION_CATEGORIES) {
    if (region === 'cn' && category !== 'songs') requireValue(Array.isArray(data[category]) && data[category].length === 0, '国服素材尚未收录');
    const shard = makeCategoryIndex(data[category], { releaseId, region, category, baseUrl, allowLegacy: true });
    const view = categoryView(shard, baseUrl, new Map(data[category].map(item => [indexItemKey(item.id), item])));
    catalog.indexes[category] = view;
    catalog[category] = view.order.map(id => view.byId[id]);
  }
  return freezeTree(catalog);
}

// A transaction reads either the entire requested v2 chain from the network or
// the entire chain from this release's cache. It never fills holes from v1.
function parseIndexJson(text) {
  const data = JSON.parse(text);
  // JSON.parse otherwise silently discards duplicate object keys. Tokens inside
  // strings are consumed together, so quoted braces/colons cannot affect scope.
  const stack = [];
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g) || [];
  for (const token of tokens) {
    const context = stack.at(-1);
    if (token === '{') stack.push({ keys: new Set(), key: true });
    else if (token === '[') stack.push({ array: true });
    else if (token === '}' || token === ']') stack.pop();
    else if (context && !context.array) {
      if (token === ',') context.key = true;
      else if (token === ':') context.key = false;
      else if (context.key) {
        const key = JSON.parse(token);
        requireValue(!context.keys.has(key), '重复 JSON 字段');
        context.keys.add(key);
        context.key = false;
      }
    }
  }
  return data;
}

export function createRegionIndexLoader({
  releaseId = REGION_RELEASE_ID,
  baseUrl = `${REGION_RELEASE_ROOT}${releaseId}/`,
  fetchImpl = (...args) => globalThis.fetch(...args),
  cacheStorage = globalThis.caches,
  cryptoImpl = globalThis.crypto,
  timeout = 12000,
  retries = 2,
  retryDelay = 350,
  allowLegacy = true,
} = {}) {
  validateReleaseLocation(releaseId, baseUrl);
  const resources = new Map();
  const catalogs = new Map();
  const categories = new Map();
  const cacheName = `${REGION_INDEX_CACHE_PREFIX}${releaseId}`;
  let cachePromise;
  const cache = () => cachePromise ||= Promise.resolve().then(() => cacheStorage?.open(cacheName)).catch(() => undefined);
  const shared = (map, key, task) => {
    if (!map.has(key)) {
      const promise = Promise.resolve().then(task).catch(error => { map.delete(key); throw error; });
      map.set(key, promise);
    }
    return map.get(key);
  };
  const unavailable = (message, cause) => new RegionIndexError(message, 'INDEX_UNAVAILABLE', { cause });
  async function networkBytes(url) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      let retryable = true;
      try {
        const response = await fetchImpl(url, { signal: controller.signal, cache: 'no-cache', redirect: 'error', credentials: 'omit' });
        if ([401, 403, 451].includes(response.status)) throw new RegionIndexError(`地区索引访问被拒绝（HTTP ${response.status}）`, 'ACCESS_DENIED');
        if (!response.ok) {
          retryable = response.status === 408 || response.status === 429 || response.status >= 500;
          throw unavailable(`地区索引暂不可用（HTTP ${response.status}）`);
        }
        requireValue(!response.url || response.url === new URL(url, globalThis.location?.href || baseUrl).href, '响应地址发生变化');
        const bytes = await response.arrayBuffer();
        requireValue(bytes.byteLength > 0 && bytes.byteLength <= MAX_JSON_BYTES, '文件大小');
        return { bytes, local: response.headers.get('X-Maimai-Index-Source') === 'local' };
      } catch (error) {
        if (error instanceof RegionIndexError && error.code !== 'INDEX_UNAVAILABLE') throw error;
        lastError = error;
        if (!retryable || attempt === retries) break;
      } finally { clearTimeout(timer); }
      if (retryDelay) await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
    }
    throw unavailable('地区索引网络读取失败', lastError);
  }
  async function cachedBytes(url) {
    const storage = await cache();
    let response;
    try { response = await storage?.match(url); } catch (error) { throw unavailable('无法读取地区索引缓存', error); }
    if (!response) throw unavailable('当前发布的完整缓存不存在');
    try { return await response.arrayBuffer(); } catch { invalid('缓存文件无法读取'); }
  }
  async function decode(bytes, ref) {
    requireValue(bytes.byteLength > 0 && bytes.byteLength <= MAX_JSON_BYTES, '文件大小');
    if (ref) {
      requireValue(bytes.byteLength === ref.bytes, '文件字节数不匹配');
      requireValue(cryptoImpl?.subtle, '无法验证文件摘要，请使用 HTTPS');
      const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
      const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
      requireValue(sha256 === ref.sha256, '文件摘要不匹配');
    }
    try { return parseIndexJson(new globalThis.TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (error) { if (error instanceof RegionIndexError) throw error; invalid('JSON 编码或内容'); }
  }
  function read(path, ref, validate, mode) {
    const url = `${baseUrl}${path}`;
    return shared(resources, `${mode}:${url}:${ref?.sha256 || 'root'}`, async () => {
      const { bytes, local } = mode === 'network' ? await networkBytes(url) : { bytes: await cachedBytes(url), local: false };
      const data = freezeTree(validate(await decode(bytes, ref)));
      return { url, bytes, data, local };
    });
  }
  async function persist(records) {
    try {
      const storage = await cache();
      if (storage) await Promise.all(records.map(({ url, bytes }) => storage.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/json; charset=utf-8' } }))));
    } catch { /* A blocked/full cache cannot invalidate a verified network result. */ }
  }
  async function transaction(region, requested, mode) {
    const root = await read('index-v2.json', null, data => validateReleaseIndex(data, { releaseId, baseUrl }), mode);
    const ref = root.data.regions[region];
    const index = await read(ref.path, ref, data => validateRegionIndex(data, { releaseId, region }), mode);
    const settled = await Promise.allSettled(requested.map(category => {
      const categoryRef = index.data.categories[category];
      return read(categoryRef.path, categoryRef, data => validateCategoryIndex(data, { releaseId, region, category, count: categoryRef.count }), mode);
    }));
    // Do not let a fast 404 hide a sibling shard's integrity/region failure.
    const failures = settled.filter(result => result.status === 'rejected');
    if (failures.length) throw (failures.find(result => result.reason.code !== 'INDEX_UNAVAILABLE') || failures[0]).reason;
    const records = settled.map(result => result.value);
    if (mode === 'network') await persist([root, index, ...records]);
    const local = [root, index, ...records].some(record => record.local);
    return { index: index.data, shards: Object.fromEntries(requested.map((category, i) => [category, records[i].data])),
      sourceStatus: { kind: `v2-${mode}`, releaseId, ...(local ? { local: true } : {}) } };
  }
  async function withFallback(region, requested) {
    let cause;
    try { return await transaction(region, requested, 'network'); }
    catch (error) { if (error.code !== 'INDEX_UNAVAILABLE') throw error; cause = error; }
    try { return await transaction(region, requested, 'cache'); }
    catch (error) { if (error.code !== 'INDEX_UNAVAILABLE') throw error; }
    if (!allowLegacy) throw cause;
    const { bytes } = await networkBytes(`./data/regions/${region}.json`);
    const legacy = validateLegacyCatalog(await decode(bytes), { region, releaseId, baseUrl, reason: cause.message });
    return { legacy };
  }
  return Object.freeze({
    cacheName,
    loadCatalog(region) {
      requireIndexRegion(region);
      return shared(catalogs, `${releaseId}:${region}`, async () => {
        const result = await withFallback(region, REGION_CATEGORIES);
        return result.legacy || catalogView(result.index, result.shards, baseUrl, result.sourceStatus);
      });
    },
    loadCategory(region, category) {
      requireIndexRegion(region);
      requireIndexCategory(category);
      return shared(categories, `${releaseId}:${region}:${category}`, async () => {
        const result = await withFallback(region, [category]);
        const view = result.legacy ? result.legacy.indexes[category] : categoryView(result.shards[category], baseUrl);
        return freezeTree({ region, category, ...view, items: view.order.map(id => view.byId[id]), sourceStatus: result.legacy?.sourceStatus || result.sourceStatus });
      });
    },
  });
}

import { isPinnedRegionAsset } from './region-profile.js';

// Visibility is a picker policy, not an import allowlist. Saved designs remain
// readable even when an item needs more evidence before it can be selected anew.
const mapping = { backgrounds: 'frames', nameplates: 'plates', avatars: 'icons', charas: 'charas', titles: 'titles' };
const cnKinds = ['frames', 'plates', 'icons', 'titles'];
const jpKinds = ['frames', 'plates', 'icons', 'charas'];
const jpArtworkSlots = { frames: 'background', plates: 'nameplate', icons: 'avatar' };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && /^\d{6}$/.test(value);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
let request;

export function validateMaterialVisibility(data) {
  if (!record(data) || data.schemaVersion !== 1 || !validDate(data.snapshotDate) ||
      !record(data.cnReleased) || !record(data.jpIdentified) || !Array.isArray(data.sources))
    throw new Error('素材区服依据格式无效');
  for (const kind of cnKinds) {
    const entries = data.cnReleased[kind];
    if (!record(entries) || Object.keys(entries).length > 20000 ||
        Object.entries(entries).some(([id, date]) => !validId(id) || !validDate(date) || date > data.snapshotDate))
      throw new Error('国服配信依据无效');
  }
  if (data.cnReviewed !== undefined && (!record(data.cnReviewed) ||
      Object.entries(data.cnReviewed).some(([kind, ids]) => !cnKinds.includes(kind) ||
        !Array.isArray(ids) || ids.length > 20000 || !ids.every(validId))))
    throw new Error('国服人工审核格式无效');
  for (const kind of jpKinds) {
    const ids = data.jpIdentified[kind];
    if (!Array.isArray(ids) || ids.length > 20000 || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length)
      throw new Error('来源素材名称依据无效');
  }
  return data;
}

function itemId(item, kind) {
  const singular = { frames: 'Frame', plates: 'Plate', icons: 'Icon', charas: 'Chara' }[kind];
  const ids = [];
  const numeric = value => {
    if (typeof value === 'string' && /^\d{1,6}$/.test(value)) value = Number(value);
    return Number.isSafeInteger(value) && value >= 0 && value <= 999999
      ? String(value).padStart(6, '0') : null;
  };
  for (const key of ['gameId', 'lxnsId']) {
    if (!Object.hasOwn(item, key)) continue;
    const id = numeric(item[key]);
    if (!id) return null;
    ids.push(id);
  }
  const declared = numeric(item.id);
  if (declared) ids.push(declared);
  if (kind === 'titles') {
    const title = /^titles\/(\d{1,6})$/.exec(String(item.id || ''));
    if (title) ids.push(numeric(title[1]));
  } else {
    const suffix = '(?:(?:%20| )*(?:%28|\\()\\d+(?:%29|\\)))?';
    const idPattern = new RegExp(`(?:^|/)UI_${singular}_(\\d{1,6})${suffix}(?:\\.png)?$`);
    const imagePattern = new RegExp(`(?:^|/)UI_${singular}_(\\d{1,6})${suffix}\\.png$`);
    const fromId = idPattern.exec(String(item.id || ''));
    if (fromId) ids.push(numeric(fromId[1]));
    for (const key of ['source', 'file', 'image', 'path']) {
      if (!Object.hasOwn(item, key)) continue;
      const match = imagePattern.exec(item[key]);
      if (!match) return null;
      ids.push(numeric(match[1]));
    }
  }
  return ids.length && ids.every(id => id === ids[0]) ? ids[0] : null;
}

export function materialIdentity(item, category) {
  return Object.hasOwn(mapping, category) ? itemId(item, mapping[category]) : item.id || item.file;
}

export function createMaterialVisibilityFilter(input) {
  const data = validateMaterialVisibility(input);
  const cn = Object.fromEntries(cnKinds.map(kind => [kind, new Set([...Object.keys(data.cnReleased[kind]), ...(data.cnReviewed?.[kind] || [])])]));
  const jp = Object.fromEntries(jpKinds.map(kind => [kind, new Set(data.jpIdentified[kind])]));
  return (category, region) => {
    if (!['cn', 'jp'].includes(region)) throw new Error('不支持的素材区服');
    if (!category || !Array.isArray(category.items)) throw new Error('素材分类格式无效');
    if (category.id === 'songs') return category; // Validated SaltMeta regional charts already own this list.
    if (category.id === 'friend-battles' || (category.id === 'ranks' && region === 'cn')) return category;
    const kind = mapping[category.id];
    const allowed = region === 'cn' ? cn[kind] : jp[kind];
    const unlisted = item => [item.group, item.genre, item.name].some(value =>
      typeof value === 'string' && value.trim() === '未收录');
    const reviewed = new Set(region === 'cn' ? data.cnReviewed?.[kind] : undefined);
    const items = allowed ? category.items.filter(item => record(item) &&
      (region !== 'cn' || !unlisted(item) || reviewed.has(itemId(item, kind))) &&
      (!Object.hasOwn(item, 'region') || item.region === region) && (
        allowed.has(itemId(item, kind)) || (
          region === 'jp' && Object.hasOwn(jpArtworkSlots, kind) &&
          item.classification?.basis === 'unmatched-source-image' &&
          isPinnedRegionAsset(item.image, jpArtworkSlots[kind])
        )
      )).map(item => region === 'cn' && (unlisted(item) || item.group === '人工核实' || item.genre === '人工核实')
        ? { ...item, group: '其他', genre: '其他' } : item) : [];
    const hiddenCount = category.items.length - items.length;
    const titleUnavailable = region === 'jp' && kind === 'titles';
    const visibilityMessage = titleUnavailable
      ? '日服称号的区服依据待补充，暂不混用国服称号列表；仍可保留或导入已有称号。'
      : region === 'cn'
        ? `按截至 ${data.snapshotDate} 的国服配信记录显示；${hiddenCount} 项可用性待核实，暂不显示。已保存的搭配不变。`
        : `活动分组按来源记录；素材库也收录来源未分类的日服快照图片。${hiddenCount} 项未纳入当前选择列表。`;
    // Original indexes and group arrays are immutable evidence. Never mutate them,
    // and never keep unfiltered group counts/IDs in the new selectable view.
    const result = { ...category, items, visibilityRegion: region, visibilityHiddenCount: hiddenCount, visibilityMessage };
    delete result.groups;
    if (titleUnavailable) result.unavailableMessage = visibilityMessage;
    return result;
  };
}

export async function filterMaterialCategory(category, region) {
  if (!['cn', 'jp'].includes(region)) throw new Error('不支持的素材区服');
  if (!category || !Array.isArray(category.items)) throw new Error('素材分类格式无效');
  if (!category.items.length || category.id === 'songs' ||
      category.id === 'friend-battles' || (region === 'cn' && category.id === 'ranks')) return category;
  request ||= fetch(new URL('../data/regions/visibility-20261108.json', import.meta.url), { cache: 'no-cache' })
    .then(response => {
      if (!response.ok) throw new Error('素材区服依据读取失败');
      return response.json();
    })
    .then(createMaterialVisibilityFilter)
    .catch(error => { request = null; throw error; });
  return (await request)(category, region);
}

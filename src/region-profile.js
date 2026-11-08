import { COS } from './config.js';

// Regional metadata extends the original editor; it never reads standalone studio state.
export const REGIONS = Object.freeze({
  cn: { id: 'cn', label: '舞萌DX2026' },
  jp: { id: 'jp', label: 'MAGiCAL' },
});
export const SCREEN_MODES = Object.freeze(['collection', 'companions', 'achievement']);
export const REGION_ASSET_ROOT = `${COS.baseUrl}/materials/regions/releases/20261108/`;
export const JP_ASSET_ROOT = `${REGION_ASSET_ROOT}jp/collection/`;
export const SALT_COVER_ROOT = `${REGION_ASSET_ROOT}shared/saltmeta/covers/`;
export const LEGACY_JP_ASSET_ROOT =
  'https://raw.githubusercontent.com/basilomorireal/maimai-asset-browser/0ebcd319585af286bce5c31cc416fcf245e28428/assets/';
export const LEGACY_SALT_COVER_ROOT =
  'https://raw.githubusercontent.com/realtvop/SaltMeta/d327942662643b391b6883ba40dd0b89e9a1d169/covers/';
const catalogs = new Map();
const catalogIndexes = new WeakMap();
const catalogCategories = ['frames', 'plates', 'icons', 'charas', 'songs'];
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const safeId = (v) =>
  (typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}(?::(?:dx|sd|std))?$/.test(v)) ||
  (Number.isSafeInteger(v) && v >= 0);
export function requireRegion(region) {
  if (!Object.hasOwn(REGIONS, region)) throw new Error('不支持的地区');
  return region;
}
export function requireScreenMode(mode) {
  if (!SCREEN_MODES.includes(mode)) throw new Error('不支持的画面模式');
  return mode;
}
export function templateStorageKey(region = 'cn', mode = 'collection') {
  return `maimai-diy-region-templates-v1:${requireRegion(region)}:${requireScreenMode(mode)}`;
}
export function availableDifficulties(song) {
  return [
    ...new Set(
      (song?.charts || [])
        .filter(record)
        .map((chart) => chart.difficulty)
        .filter((v) => Number.isInteger(v) && v >= 0 && v <= 4)
    ),
  ];
}
function indexRegionCatalog(catalog) {
  requireRegion(catalog?.region);
  const indexes = new Map();
  for (const category of catalogCategories) {
    if (!Array.isArray(catalog[category])) throw new Error('素材目录无效');
    const entries = new Map();
    for (const entry of catalog[category]) {
      if (
        !record(entry) ||
        !safeId(entry.id) ||
        entries.has(String(entry.id)) ||
        (Object.hasOwn(entry, 'region') && entry.region !== catalog.region)
      )
        throw new Error('素材目录地区或编号无效');
      entries.set(String(entry.id), entry);
    }
    indexes.set(category, entries);
  }
  catalogIndexes.set(catalog, indexes);
  return indexes;
}
export function registerRegionCatalog(catalog) {
  indexRegionCatalog(catalog);
  catalogs.set(catalog.region, catalog);
  return catalog;
}
export function getRegionCatalog(region) {
  return catalogs.get(requireRegion(region));
}
export function getRegionCatalogItem(region, category, id) {
  const catalog = getRegionCatalog(region);
  return catalog && catalogIndexes.get(catalog)?.get(category)?.get(String(id));
}
export function sanitizeRegionFields(input, catalog) {
  const region = requireRegion(input.region ?? 'cn');
  const screenMode = requireScreenMode(input.screenMode ?? 'collection');
  catalog ||= catalogs.get(region);
  if (catalog && catalog.region !== region) throw new Error('模板与素材目录地区不一致');
  const indexes = catalog && (catalogIndexes.get(catalog) || indexRegionCatalog(catalog));
  const companions = input.companions ?? [];
  if (!Array.isArray(companions) || companions.length > 5) throw new Error('旅行伙伴最多五位');
  const seen = new Set();
  const members = companions.map((member) => {
    if (
      !record(member) ||
      !safeId(member.id) ||
      !Number.isInteger(member.level) ||
      member.level < 1 ||
      member.level > 999 ||
      seen.has(String(member.id))
    )
      throw new Error('旅行伙伴编号或等级无效');
    if (indexes && !indexes.get('charas').has(String(member.id)))
      throw new Error('旅行伙伴不属于所选地区目录');
    seen.add(String(member.id));
    return { id: member.id, level: member.level };
  });
  const song = input.song ?? { id: '', difficulty: 0, achievement: '100.0000' };
  if (
    !record(song) ||
    !(song.id === '' || safeId(song.id)) ||
    !Number.isInteger(song.difficulty) ||
    song.difficulty < 0 ||
    song.difficulty > 4 ||
    !(
      typeof song.achievement === 'number' ||
      (typeof song.achievement === 'string' && /^\d{1,3}(?:\.\d{1,4})?$/.test(song.achievement))
    ) ||
    !Number.isFinite(Number(song.achievement)) ||
    Number(song.achievement) < 0 ||
    Number(song.achievement) > 101
  )
    throw new Error('曲目、难度或达成率无效');
  if (catalog && song.id !== '') {
    const entry = indexes.get('songs').get(String(song.id));
    if (!entry || !availableDifficulties(entry).includes(song.difficulty))
      throw new Error('曲目或难度不属于所选地区目录');
  }
  return {
    region,
    screenMode,
    companions: members,
    song: {
      id: song.id,
      difficulty: song.difficulty,
      achievement: Number(song.achievement).toFixed(4),
    },
  };
}
export function isPinnedRegionAsset(value, slotId) {
  const paths = {
    background: 'frames/UI_Frame_',
    nameplate: 'plates/UI_Plate_',
    avatar: 'icons/UI_Icon_',
  };
  return (
    typeof value === 'string' &&
    !/\s/.test(value) &&
    Object.hasOwn(paths, slotId) &&
    [JP_ASSET_ROOT, LEGACY_JP_ASSET_ROOT].some(
      (root) => value.startsWith(root + paths[slotId]) &&
        /^[0-9]{6}\.png$/.test(value.slice((root + paths[slotId]).length))
    )
  );
}

// maidraw MAGiCAL profile mapping, mirrored without changing source filenames.
export const JP_RATING_ROOT = `${REGION_ASSET_ROOT}ui/maidraw/dxRating/jp/`;
export const LEGACY_JP_RATING_ROOT =
  'https://raw.githubusercontent.com/saltcute/maidraw/a3a5027940519b6ff52831185177d58b71c404d2/assets/themes/maimai/best50/versionless/dxRating/jp/';
export const JP_RATING_BANDS = Object.freeze(
  [
    { min: 0, asset: 'white.webp', label: '白' },
    { min: 2000, asset: 'blue.webp', label: '蓝' },
    { min: 4000, asset: 'green.webp', label: '绿' },
    { min: 6000, asset: 'yellow.webp', label: '黄' },
    { min: 8000, asset: 'red.webp', label: '红' },
    { min: 10000, asset: 'purple.webp', label: '紫' },
    { min: 12000, asset: 'bronze.webp', label: '铜' },
    { min: 13000, asset: 'silver.webp', label: '银' },
    { min: 14000, asset: 'circleplus/gold.webp', label: '金' },
    { min: 14500, asset: 'circleplus/platinum.webp', label: '白金' },
    { min: 15000, asset: 'circleplus/rainbow.webp', label: '虹' },
    { min: 16000, asset: 'circleplus/kiwami.webp', label: '极' },
  ].map(Object.freeze)
);
const jpRatingAssets = new Set(JP_RATING_BANDS.map((band) => band.asset));
const jpRatingUrls = new Set(
  [JP_RATING_ROOT, LEGACY_JP_RATING_ROOT].flatMap((root) =>
    JP_RATING_BANDS.map((band) => `${root}${band.asset}`)
  )
);
export function isPinnedJpRatingAsset(value, slotId) {
  return slotId === 'ratingFrame' && jpRatingUrls.has(value);
}

// Only the verified source revisions and original filenames can be migrated.
// Do not turn arbitrary GitHub URLs, query strings or old CN COS paths into a mirror URL.
export function migratePinnedRegionAssetUrl(value) {
  if (typeof value !== 'string' || /[?#%\\\s\u0000-\u001f\u007f]/.test(value)) return value;
  if (value.startsWith(LEGACY_JP_ASSET_ROOT)) {
    const path = value.slice(LEGACY_JP_ASSET_ROOT.length);
    if (/^(?:frames\/UI_Frame_|plates\/UI_Plate_|icons\/UI_Icon_|charas\/UI_Chara_)[0-9]{6}\.png$/.test(path))
      return JP_ASSET_ROOT + path;
  }
  if (value.startsWith(LEGACY_SALT_COVER_ROOT)) {
    const path = value.slice(LEGACY_SALT_COVER_ROOT.length);
    if (/^[0-9]{6}\.png$/.test(path)) return SALT_COVER_ROOT + path;
  }
  if (value.startsWith(LEGACY_JP_RATING_ROOT)) {
    const path = value.slice(LEGACY_JP_RATING_ROOT.length);
    if (jpRatingAssets.has(path)) return JP_RATING_ROOT + path;
  }
  return value;
}

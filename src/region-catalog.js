import { jpProfileItems } from './jp-profile-assets.js';
import { registerRegionCatalog } from './region-profile.js';
import { createRegionIndexLoader, requireIndexRegion } from './region-index.js';
const loader = createRegionIndexLoader({ allowLegacy: false });
const requests = new Map();
let gamerchRequest;
let jpTitlesRequest;
function loadJpTitles() {
  jpTitlesRequest ||= fetch(new URL('../data/regions/jp-titles.json', import.meta.url))
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (data?.region !== 'jp' || !Array.isArray(data.items)) throw new Error('日服称号索引无效');
      const names = new Set(data.items.map(item => item.name));
      return [...data.items, ...jpProfileItems.titles.filter(item => !names.has(item.name))];
    })
    .catch(() => { jpTitlesRequest = undefined; return jpProfileItems.titles; });
  return jpTitlesRequest;
}
function loadGamerchMetadata() {
  gamerchRequest ||= fetch(new URL('../data/regions/jp-gamerch.json', import.meta.url))
    .then(response => response.ok ? response.json() : {})
    .catch(() => ({}));
  return gamerchRequest;
}
// Names from the SEGA Blue Archive and TOKYO6 event announcements.
const collaborationNames = /^(?:ブルーアーカイブ(?:\s|$)|小春六花$|夏色花梨$|花隈千冬$)/;
const scoreCategories = /^(?:実績|プレイ|1クレジット内指定プレイ|クリアランク|FULL |ALL PERFECT|制覇系|段位認定|全国行脚)/;
const mapping = { backgrounds: 'frames', nameplates: 'plates', avatars: 'icons', charas: 'charas', songs: 'songs' };
export function loadRegionCatalog(region) {
  requireIndexRegion(region);
  if (!requests.has(region)) requests.set(region, loader.loadCatalog(region).then(data => {
    registerRegionCatalog(data);
    return data;
  }).catch(error => { requests.delete(region); throw error; }));
  return requests.get(region);
}
export const loadRegionCategoryIndex = (region, category) => loader.loadCategory(region, category);
export { getRegionCatalogItem } from './region-profile.js';
export async function regionCategory(region, control) {
  requireIndexRegion(region);
  if (region === 'jp' && control.category === 'titles')
    return { id: 'titles', label: control.label, items: await loadJpTitles() };
  if (region === 'jp' && Object.hasOwn(jpProfileItems, control.category))
    return { id: control.category, label: control.label, items: jpProfileItems[control.category] };
  const key = mapping[control.category];
  if (!key || (region === 'cn' && key !== 'songs')) return null;
  const index = await loadRegionCategoryIndex(region, key);
  const byArea = region === 'jp' && ['frames', 'plates'].includes(key);
  const metadata = region === 'jp' && (byArea || key === 'icons')
    ? (await loadGamerchMetadata())[key] || {} : {};
  return {
    id: control.category,
    label: control.label,
    groups: byArea ? undefined : index.groups,
    sourceStatus: index.sourceStatus,
    items: index.items.map(item => {
      const wiki = metadata[item.id];
      const group = item.group || item.genre || item.category || '来源未分类';
      const area = byArea && /^(原创|联动)(?:地区|区域)\s*·\s*(.+)$/.exec(group);
      let displayGroup = group;
      if (byArea) {
        if (area) displayGroup = area[1] + '区域';
        else if (group.endsWith(' · 地区奖励') || /^ちほー/.test(wiki?.category || '') ||
          collaborationNames.test(item.name)) displayGroup = '联动区域';
        else if (group.endsWith(' · 段位与实绩') || (wiki && scoreCategories.test(wiki.category)) ||
          /(?:SEASON\d+.*トップランカー|^「サークルフェスタ .*」TOP\d+$|^KING of Performai.*(?:優勝|BEST \d+)$)/i.test(item.name)) displayGroup = '成绩';
        else if (group.endsWith(' · 默认') || /^Random selection from (?:all|favorite)$/i.test(item.name))
          displayGroup = '默认';
        else if (group.endsWith(' · 版本纪念') ||
          /^maimai\s/i.test(item.name))
          displayGroup = '舞萌系列';
        else if (wiki?.category === 'maiマイルショップ') displayGroup = '里程商店';
        else displayGroup = '来源未分类';
      }
      return {
        ...item, name: wiki?.name || item.name, file: item.image, local: true, group: displayGroup,
        description: [area?.[2], wiki?.category, item.artist, ...(item.aliases || [])].filter(Boolean).join(' '),
      };
    }),
  };
}

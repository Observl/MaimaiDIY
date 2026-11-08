import { registerRegionCatalog } from './region-profile.js';
import { createRegionIndexLoader, requireIndexRegion } from './region-index.js';
const loader = createRegionIndexLoader();
const requests = new Map();
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
  if (region === 'jp' && control.category === 'titles') return { id: 'titles', label: control.label, items: [], groups: [], unavailableMessage: '日服称号的区服依据待补充，暂不混用国服称号列表；仍可保留或导入已有称号。' };
  if (region === 'jp' && ['ranks', 'friend-battles'].includes(control.category)) return { id: control.category, label: control.label, items: [], groups: [], unavailableMessage: '日服原版徽章素材待补充，不使用国服素材代替。' };
  const key = mapping[control.category];
  if (!key || (region === 'cn' && !['charas', 'songs'].includes(key))) return null;
  const catalog = await loadRegionCatalog(region);
  return { id: control.category, label: control.label, groups: catalog.indexes[key].groups, sourceStatus: catalog.sourceStatus, items: catalog[key].map(item => ({
    ...item, file: item.image, local: true, group: item.group || item.genre || item.category || '来源未分类',
    description: [item.artist, ...(item.aliases || [])].filter(Boolean).join(' '),
  })) };
}

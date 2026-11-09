import { loadManifest, loadTitleManifest, loadBadgeManifest } from './assets.js';
import { regionCategory } from './region-catalog.js';
import { filterMaterialCategory, materialIdentity } from './material-visibility.js';

const indexes = new Map();

async function readCategory(control, region) {
  const id = control.category;
  let category = await regionCategory(region, control);
  if (category && region === 'jp' && ['titles', 'ranks', 'friend-battles'].includes(id)) return category;
  if (!category) {
    if (id === 'titles') category = { id, label: control.label, items: (await loadTitleManifest()).items };
    else {
      const manifest = await (['ranks', 'friend-battles'].includes(id) ? loadBadgeManifest() : loadManifest());
      category = manifest.categories.find(entry => entry.id === id);
    }
  }
  return filterMaterialCategory(category || { id, label: control.label, items: [] }, region);
}

export function mergeMaterialCategories(cn, jp) {
  const byId = new Map();
  for (const [region, category] of [['cn', cn], ['jp', jp]]) {
    for (const item of category.items) {
      const id = materialIdentity(item, category.id);
      const key = id == null ? `${region}:${item.file || item.name}` : `id:${id}`;
      let record = byId.get(key);
      if (!record) {
        record = { variants: {} };
        byId.set(key, record);
      }
      record.variants[region] ??= item;
    }
  }
  return [...byId.values()].map(({ variants }) => ({
    regionIndex: variants.cn && variants.jp ? 0 : variants.jp ? 1 : 2,
    variants,
  }));
}

export async function indexedMaterialCategory(control, region) {
  const id = control.category;
  if (!indexes.has(id)) {
    indexes.set(id, Promise.all([readCategory(control, 'cn'), readCategory(control, 'jp')])
      .then(([cn, jp]) => ({ cn, jp, records: mergeMaterialCategories(cn, jp) }))
      .catch(error => { indexes.delete(id); throw error; }));
  }
  const index = await indexes.get(id);
  const { label, visibilityMessage, unavailableMessage, sourceStatus } = index[region];
  const regionIndex = region === 'jp' ? 1 : 2;
  return {
    id, label, visibilityMessage, unavailableMessage, sourceStatus,
    items: index.records
      .filter(record => record.regionIndex === 0 || record.regionIndex === regionIndex)
      .map(record => ({ ...record.variants[region], regionIndex: record.regionIndex })),
  };
}

import { loadDxTitleCategory, withCnWirepuller } from './dx-song-titles.js';
import { loadManifest, loadTitleManifest, loadBadgeManifest } from './assets.js';
import { regionCategory, loadRegionCategoryIndex } from './region-catalog.js';
import { filterMaterialCategory, materialIdentity } from './material-visibility.js';

const indexes = new Map();

async function readCategory(control, region) {
  const id = control.category;
  if (id === 'titles') return loadDxTitleCategory(region, control.label, {
    loadSongs: selectedRegion => loadRegionCategoryIndex(selectedRegion, 'songs'),
    loadBase: async selectedRegion => {
      if (selectedRegion === 'jp') return (await regionCategory(selectedRegion, control)).items;
      const raw = (await loadTitleManifest()).items;
      const visible = await filterMaterialCategory({ id, label: control.label, items: raw }, selectedRegion);
      // Explicitly requested custom title is not part of the historical LXNS allowlist.
      return withCnWirepuller(visible.items, raw);
    },
  });
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

export async function indexedMaterialCategory(control, region) {
  if (control.category === 'titles') return readCategory(control, region);
  const key = region + ':' + control.category;
  if (!indexes.has(key)) {
    indexes.set(key, readCategory(control, region).then(category => {
      const seen = new Set();
      const items = category.items.filter(item => {
        const id = materialIdentity(item, category.id);
        const identity = id == null ? 'file:' + (item.file || item.name) : 'id:' + id;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
      return items.length === category.items.length ? category : { ...category, groups: undefined, items };
    }).catch(error => { indexes.delete(key); throw error; }));
  }
  return indexes.get(key);
}

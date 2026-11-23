import { groupSongCharts } from './song-chart-types.js';
import { loadDxTitleCategory } from './dx-song-titles.js';
import { loadManifest, loadBadgeManifest } from './assets.js';
import { regionCategory, loadRegionCategoryIndex } from './region-catalog.js';
import { filterMaterialCategory, materialIdentity } from './material-visibility.js';
import { buildLxnsCollection, isLxnsCollection, loadLxnsCollection } from './lxns-collections.js';

const indexes = new Map();

async function readCnCollection(control) {
  const [entries, manifest] = await Promise.all([
    loadLxnsCollection(control.category),
    control.category === 'titles' ? null : loadManifest(),
  ]);
  const artwork = manifest?.categories.find(category => category.id === control.category)?.items || [];
  return buildLxnsCollection(control, entries, artwork);
}

async function readCategory(control, region) {
  const id = control.category;
  if (id === 'titles') return loadDxTitleCategory(region, control.label, {
    loadSongs: selectedRegion => loadRegionCategoryIndex(selectedRegion, 'songs'),
    loadBase: async selectedRegion => {
      if (selectedRegion === 'jp') return (await regionCategory(selectedRegion, control)).items;
      return (await readCnCollection(control)).items;
    },
  });
  if (region === 'cn' && isLxnsCollection(id)) return readCnCollection(control);
  let category = await regionCategory(region, control);
  if (category && id === 'charas') return category;
  if (category && region === 'jp' && ['titles', 'ranks', 'friend-battles'].includes(id)) return category;
  if (!category && ['ranks', 'friend-battles'].includes(id)) {
    const manifest = await loadBadgeManifest();
    category = manifest.categories.find(entry => entry.id === id);
  }
  return filterMaterialCategory(category || { id, label: control.label, items: [] }, region);
}

export async function indexedMaterialCategory(control, region) {
  if (control.category === 'titles') return readCategory(control, region);
  const key = region + ':' + control.category;
  if (!indexes.has(key)) {
    indexes.set(key, readCategory(control, region).then(category => {
      if (category.id === 'songs') return { ...category, groups: undefined, items: groupSongCharts(category.items) };
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

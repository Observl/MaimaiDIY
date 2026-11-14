// Song-name AP titles are a view of the regional song catalog, not stored trophies.
// Match exact names and Gold only: special trophies with another colour survive.
export function mergeDxSongTitles(baseItems, songItems, region) {
  if (!['cn', 'jp'].includes(region)) throw new Error('不支持的素材区服');
  const names = new Set(songItems.filter(item => typeof item.id === 'string' && item.id.endsWith(':dx'))
    .map(item => item.name).filter(name => typeof name === 'string' && name.length));
  const items = baseItems.filter(item => {
    if (item.region && item.region !== region) return false;
    if (item.color === 'Gold' && names.has(item.name)) return false;
    return true;
  });
  for (const name of names) items.push({
    id: `${region}-dx-song:${encodeURIComponent(name)}`, name, color: 'Gold',
    group: '歌曲 AP', region, derivedFrom: 'regional-dx-song',
    description: 'DX 谱歌曲同名金色称号',
  });
  return items;
}

export async function loadDxTitleCategory(region, label, { loadBase, loadSongs }) {
  // Resolve both before exposing results; failures propagate so the picker can retry.
  const [baseItems, songs] = await Promise.all([loadBase(region), loadSongs(region)]);
  if (songs.region !== region || !Array.isArray(songs.items)) throw new Error('歌曲称号区服索引无效');
  return { id: 'titles', label, items: mergeDxSongTitles(baseItems, songs.items, region) };
}

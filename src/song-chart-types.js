// Picker grouping is a view only. Saved IDs and the validated regional catalog
// remain chart-specific, preserving old templates and region isolation.
export const SONG_CHART_TYPES = Object.freeze({ sd: '标准', dx: 'DX' });
export const songChartType = song => /:(sd|dx)$/.exec(String(song?.id || ''))?.[1] || '';
export function songIdentity(song) {
  return Number.isSafeInteger(song?.musicId) && song.musicId >= 0
    ? String(song.musicId) : String(song?.id || '');
}
export function groupSongCharts(items) {
  const groups = new Map();
  for (const item of items) {
    const key = songIdentity(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()].map(variants => {
    const ordered = [...variants].sort((a, b) =>
      Object.keys(SONG_CHART_TYPES).indexOf(songChartType(a)) - Object.keys(SONG_CHART_TYPES).indexOf(songChartType(b)));
    const first = ordered[0];
    return {
      ...first,
      songVariants: ordered,
      aliases: [...new Set(ordered.flatMap(item => [item.name, ...(item.aliases || [])]))],
      description: [first.description, ordered.map(item => SONG_CHART_TYPES[songChartType(item)]).join(' / ')].filter(Boolean).join(' · '),
    };
  });
}
export function songSelection(variants, previous) {
  const selected = variants.find(item => songChartType(item) === songChartType(previous)) || variants[0];
  if (!selected) return null;
  const difficulties = selected.charts.map(chart => chart.difficulty);
  const difficulty = difficulties.includes(previous?.difficulty)
    ? previous.difficulty : difficulties[0] ?? 0;
  return { ...previous, id: selected.id, difficulty };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { groupSongCharts, songSelection, songChartType } from '../../src/song-chart-types.js';
const song = (id, musicId, difficulties = [0, 1, 3]) => ({ id, musicId, name: '同名歌曲', charts: difficulties.map(difficulty => ({ difficulty })), aliases: [id] });
test('groups by stable song identity, not same title, preserving chart IDs', () => {
  const items = [song('1:dx', 1), song('1:sd', 1), song('2:sd', 2)];
  const groups = groupSongCharts(items);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].id, '1:sd');
  assert.deepEqual(groups[0].songVariants.map(x => x.id), ['1:sd', '1:dx']);
  assert.deepEqual(items.map(x => x.id), ['1:dx', '1:sd', '2:sd']);
  assert.ok(groups[0].aliases.includes('1:dx'));
});
test('switch retains valid difficulty, score and chart type preference', () => {
  const previous = { id: '8:dx', difficulty: 3, achievement: '99.1234' };
  assert.deepEqual(songSelection([song('1:sd', 1), song('1:dx', 1)], previous), { ...previous, id: '1:dx' });
  assert.deepEqual(songSelection([song('1:sd', 1, [0, 1])], previous), { ...previous, id: '1:sd', difficulty: 0 });
});
test('single chart and empty selection stay valid', () => {
  assert.equal(songSelection([], {}), null);
  assert.equal(songSelection([song('1:dx', 1)], { id: null }).id, '1:dx');
  assert.equal(songChartType({ id: '1:sd' }), 'sd');
});
test('both frozen regional datasets retain every chart in exactly one grouped song', async () => {
  for (const region of ['cn', 'jp']) {
    const { songs } = JSON.parse(await readFile(new URL(`../../data/regions/${region}.json`, import.meta.url)));
    const groups = groupSongCharts(songs);
    assert.ok(groups.length < songs.length);
    assert.deepEqual(groups.flatMap(x => x.songVariants.map(v => v.id)).sort(), songs.map(x => x.id).sort());
    for (const group of groups) assert.equal(new Set(group.songVariants.map(songChartType)).size, group.songVariants.length);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerRegionCatalog, sanitizeRegionFields, LEGACY_JP_ASSET_ROOT, REGION_ASSET_ROOT } from '../../src/region-profile.js';
import { REGION_BASE_URL } from '../../src/region-index.js';
import { regionCategory } from '../../src/region-catalog.js';
const catalogs = {};
for (const region of ['cn', 'jp']) catalogs[region] = JSON.parse(await readFile(new URL(`../../data/regions/${region}.json`, import.meta.url), 'utf8'));
test('bundled catalogs register separately and preserve regional chart differences', () => {
  for (const region of ['cn', 'jp']) assert.equal(registerRegionCatalog(catalogs[region]).region, region);
  const advanced = region => catalogs[region].songs.find(song => song.id === '8:sd').charts.find(chart => chart.difficulty === 1).level;
  assert.equal(advanced('cn'), '7'); assert.equal(advanced('jp'), '7+');
  assert.equal(catalogs.cn.charas.length, 0);
  assert.ok(catalogs.jp.charas.length > 1000);
});
test('all bundled art URLs stay within pinned verified source directories', () => {
  for (const region of ['cn', 'jp']) {
    for (const category of ['frames', 'plates', 'icons', 'charas']) {
      for (const item of catalogs[region][category]) {
        assert.equal(region, 'jp');
        assert.ok(item.image.startsWith(`${LEGACY_JP_ASSET_ROOT}${category}/`));
        assert.match(item.image, /\/UI_(Frame|Plate|Icon|Chara)_\d{6}\.png$/);
      }
    }
    for (const song of catalogs[region].songs) assert.match(song.image, /^https:\/\/raw\.githubusercontent\.com\/realtvop\/SaltMeta\/d327942662643b391b6883ba40dd0b89e9a1d169\/covers\/\d{6}\.png$/);
  }
});
test('real catalogs reject a JP party on CN and nonexistent difficulties', () => {
  const member = { id: catalogs.jp.charas[0].id, level: 1 };
  assert.throws(() => sanitizeRegionFields({ region: 'cn', companions: [member] }, catalogs.cn));
  assert.throws(() => sanitizeRegionFields({ region: 'jp', song: { id: '8:sd', difficulty: 4, achievement: '100.0000' } }, catalogs.jp));
  assert.equal(sanitizeRegionFields({ region: 'jp', companions: [member] }, catalogs.jp).companions[0].id, member.id);
});

test('Japanese art groups retain source provenance without inventing versions', () => {
 for (const category of ['frames','plates','icons','charas']) {
  const items=catalogs.jp[category];
  assert.ok(new Set(items.map(item=>item.group)).size>10);
  for(const item of items){ assert.ok(item.group);assert.notEqual(item.group,'日服素材');assert.ok(item.classification.basis);assert.equal(item.classification.version,null); }
 }
});

test('index and template asset rules pin the same immutable COS release', () => {
  assert.equal(REGION_ASSET_ROOT, REGION_BASE_URL);
});

test('JP profile pickers expose the sourced Japanese assets', async () => {
  const titles = await regionCategory('jp', { category: 'titles', label: '称号' });
  const ranks = await regionCategory('jp', { category: 'ranks', label: '段位' });
  const battle = await regionCategory('jp', { category: 'friend-battles', label: '友人对战' });
  assert.ok(titles.items.some(item => item.name === 'でびゅー'));
  assert.equal(ranks.items.length, 23);
  assert.ok(ranks.items.some(item => item.name === '真二段'));
  assert.equal(battle, null);
});

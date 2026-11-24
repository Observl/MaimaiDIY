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


test('companion areas use exact character records rather than numbered series', async () => {
  const metadata = JSON.parse(await readFile(new URL('../../regional-display/chara-names.json', import.meta.url), 'utf8'));
  const ids = JSON.parse(await readFile(new URL('../../regional-display/charas.json', import.meta.url), 'utf8'));
  const confirmed = JSON.parse(await readFile(new URL('../../regional-display/confirmed-companion-sets.json', import.meta.url), 'utf8'));
  assert.equal(metadata.entries['000101'].group, 'はじまりのちほー');
  assert.equal(metadata.entries['000201'].group, '青春ちほー');
  assert.equal(metadata.entries['004201'].group, '結月ゆかりちほー');
  for (const entry of Object.values(metadata.entries)) {
    assert.ok(entry.name && entry.group);
    assert.equal(entry.classification.matchedBy, 'exact-character-id');
    assert.ok(['Chara.xml genre/str', 'chara_genre_map.json'].includes(entry.classification.basis));
    assert.doesNotMatch(entry.group, /编号系列/);
  }
  for (const id of ids.filter(id => Object.hasOwn(confirmed.characters, id)))
    assert.ok(metadata.entries[id]?.group, `Selectable CN companion ${id} needs a verified area`);
});


test('CN companion additions have dated release evidence, images and confirmed palettes', async () => {
  const metadata = JSON.parse(await readFile(new URL('../../regional-display/chara-names.json', import.meta.url), 'utf8'));
  const ids = JSON.parse(await readFile(new URL('../../regional-display/charas.json', import.meta.url), 'utf8'));
  const confirmed = JSON.parse(await readFile(new URL('../../regional-display/confirmed-companion-sets.json', import.meta.url), 'utf8'));
  const additions = Object.entries(metadata.entries).filter(([, entry]) => entry.cnAvailability);
  assert.equal(additions.length, 278);
  for (const [id, entry] of additions) {
    assert.ok(ids.includes(id));
    assert.ok(entry.cnAvailability.releaseDate <= entry.cnAvailability.checkedAt);
    assert.ok(Object.hasOwn(confirmed.characters, id));
    assert.equal(entry.image, `https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com/materials/regions/companion-supplements/20261124/${id}.webp`);
    assert.match(entry.cnAvailability.sha256, /^[a-f0-9]{64}$/);
  }
  for (const id of ['550301', '550302', '550303']) {
    assert.ok(ids.includes(id));
    assert.equal(metadata.entries[id].group, '7sRefちほー4');
    assert.equal(metadata.entries[id].cnAvailability.releaseDate, '2026-10-01');
  }
  for (const id of ['004101', '004102', '004103', '004104']) assert.ok(!ids.includes(id));
});

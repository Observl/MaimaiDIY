import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMaterialVisibilityFilter, validateMaterialVisibility } from '../../src/material-visibility.js';
import { sanitizeImportedState, createDefaultState } from '../../src/model.js';
const data = JSON.parse(await readFile(new URL('../../data/regions/visibility-20261108.json', import.meta.url), 'utf8'));
const jp = JSON.parse(await readFile(new URL('../../data/regions/jp.json', import.meta.url), 'utf8'));
const filter = createMaterialVisibilityFilter(data);
const art = (id, type = 'Plate') => ({ id, gameId: Number(id), name: id, file: `nameplates/UI_${type}_${id}.png` });

test('identified JP entries include basic companions and direct group-only records', () => {
  const retained = filter({ id: 'charas', items: jp.charas }, 'jp');
  const ids = new Set(retained.items.map(item => item.id));
  for (const id of ['000101', '000301', '000302', '000303', '004101', '004102', '004103', '004104'])
    assert.ok(ids.has(id), id);
  assert.equal(retained.items.length, 1082);
  assert.equal(retained.visibilityHiddenCount, 354);
});

test('JP selection includes unclassified pinned artwork without rewriting catalogs', () => {
  for (const [kind, category, count] of [['frames', 'backgrounds', 574], ['plates', 'nameplates', 539], ['icons', 'avatars', 1631]]) {
    const original = { id: category, items: jp[kind], groups: [{ label: 'stale', ids: jp[kind].map(item => item.id) }] };
    const copy = structuredClone(original);
    const result = filter(original, 'jp');
    assert.equal(result.items.length, count);
    assert.equal(result.groups, undefined);
    assert.deepEqual(original, copy);
    assert.match(result.visibilityMessage, /来源未分类/);
  }
});

test('legacy encoded CN templates remain readable when their material is hidden from new choices', () => {
  const url = 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com/materials/nameplates/UI_Plate_450001%20%282%29.png';
  const state = createDefaultState('cn');
  state.files.nameplate = url;
  const result = sanitizeImportedState(state);
  assert.equal(result.files.nameplate, url);
  assert.equal(filter({ id: 'nameplates', items: [{ id: 'nameplates/UI_Plate_450001', gameId: 450001, file: url, name: 'old' }] }, 'cn').items.length, 0);
});

test('existing regional songs and CN badges are not reclassified by image/source names', () => {
  const songs = { id: 'songs', items: [{ id: '8:sd', name: 'テスト' }] };
  assert.equal(filter(songs, 'cn'), songs);
  assert.equal(filter(songs, 'jp'), songs);
  const badges = { id: 'ranks', items: [{ id: 'ranks/1', name: '初段' }] };
  assert.equal(filter(badges, 'cn'), badges);
  assert.equal(filter(badges, 'jp').items.length, 0);
});

test('malformed Japanese evidence is rejected instead of enabling unfiltered fallback', () => {
  const invalidDate = structuredClone(data); invalidDate.snapshotDate = '2026-02-30';
  assert.throws(() => validateMaterialVisibility(invalidDate));
  const duplicate = structuredClone(data); duplicate.jpIdentified.frames.push(duplicate.jpIdentified.frames[0]);
  assert.throws(() => validateMaterialVisibility(duplicate));
  assert.throws(() => filter({ id: 'avatars', items: [] }, 'other'));
});

test('failed policy fetch can retry, concurrent successful reads share one validated policy', async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return calls === 1 ? new Response('', { status: 503 }) : Response.json(data); };
  const api = await import('../../src/material-visibility.js?loader-test');
  const category = { id: 'backgrounds', items: [art('100101', 'Frame')] };
  await api.filterMaterialCategory({ id: 'songs', items: [{ id: '8:sd' }] }, 'jp');
  await api.filterMaterialCategory({ id: 'ranks', items: [{ id: 'ranks/1' }] }, 'cn');
  assert.equal(calls, 0);
  await assert.rejects(api.filterMaterialCategory(category, 'jp'));
  await Promise.all([api.filterMaterialCategory(category, 'jp'), api.filterMaterialCategory(category, 'jp')]);
  assert.equal(calls, 2);
});

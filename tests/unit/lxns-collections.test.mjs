import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLxnsCollection } from '../../src/lxns-collections.js';

const published = (id, extra = {}) => ({
  id, name: '落雪名称', genre: '落雪分类', description: '达成解锁条件', release_date: '2026-10-28', ...extra,
});

test('CN picker joins released LXNS entries to COS files and uses only LXNS metadata', () => {
  const artwork = [1, 2, 3, 4].map(id => ({
    id: `avatars/UI_Icon_${id}`, file: `avatars/UI_Icon_${id}.png`, name: '旧名称', group: '未收录',
  }));
  artwork.push({ id: 'avatars/UI_Icon_5', file: 'avatars/UI_Icon_6.png' });
  const collection = buildLxnsCollection({category: 'avatars'}, [
    published(1), published(1), published(2, {release_date: '2027-01-01'}),
    published(3, {release_date: '2026-02-30'}), published(5), published(6),
  ], artwork, '2026-11-16');
  assert.deepEqual(collection.items.map(({id, file, name, group, description}) => ({id, file, name, group, description})), [{
    id: 'avatars/UI_Icon_1', file: 'avatars/UI_Icon_1.png',
    name: '落雪名称', group: '落雪分类', description: '达成解锁条件',
  }]);
});

test('CN trophies render supported colors from LXNS and keep stable saved IDs', () => {
  const collection = buildLxnsCollection({category: 'titles'}, [
    published(558567, {name: 'WIREPULLER', color: 'Rainbow'}), published(7, {color: 'Image'}),
  ], [], '2026-11-16');
  assert.deepEqual(collection.items.map(({id, name, color, group}) => ({id, name, color, group})),
    [{id: 'titles/558567', name: 'WIREPULLER', color: 'Rainbow', group: '落雪分类'}]);
});

test('failed public API lookup can retry and parallel readers share one list request', async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  let calls = 0;
  globalThis.fetch = async url => {
    assert.equal(url, 'https://maimai.lxns.net/api/v0/maimai/frame/list?required=false');
    return ++calls === 1 ? new Response('', {status: 503}) : Response.json({frames: [published(1)]});
  };
  const { loadLxnsCollection } = await import('../../src/lxns-collections.js?retry');
  await assert.rejects(loadLxnsCollection('backgrounds'));
  const [first, second] = await Promise.all([loadLxnsCollection('backgrounds'), loadLxnsCollection('backgrounds')]);
  assert.equal(first, second);
  assert.equal(calls, 2);
});

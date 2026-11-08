import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationMatchesRegion } from '../../author-recommendations.js';

test('recommendation designs stay in their declared region', () => {
  for (const region of ['cn', 'jp']) {
    const item = { state: { region } };
    assert.equal(recommendationMatchesRegion(item, region), true);
    assert.equal(recommendationMatchesRegion(item, region === 'cn' ? 'jp' : 'cn'), false);
  }
});

test('pre-region recommendations remain CN without changing their saved contents', () => {
  const item = { state: { files: { background: 'legacy.png' } } };
  const copy = structuredClone(item);
  assert.equal(recommendationMatchesRegion(item, 'cn'), true);
  assert.equal(recommendationMatchesRegion(item, 'jp'), false);
  assert.deepEqual(item, copy);
});

test('invalid or unknown recommendation regions cannot enter either library', () => {
  for (const item of [null, {}, { state: null }, { state: [] }, { state: 'jp' }, { state: { region: 'unknown' } }]) {
    assert.equal(recommendationMatchesRegion(item, 'cn'), false);
    assert.equal(recommendationMatchesRegion(item, 'jp'), false);
  }
  assert.equal(recommendationMatchesRegion({ state: {} }, 'other'), false);
});

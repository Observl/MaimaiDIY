import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultState,
  sanitizeImportedState,
  applyRatingBand,
  ratingBand,
  isAllowedAsset,
} from '../../src/model.js';
import { JP_RATING_BANDS, JP_RATING_ROOT, LEGACY_JP_RATING_ROOT } from '../../src/region-profile.js';
import { RATING_BANDS } from '../../src/config.js';

test('JP maidraw boundaries use exact COS frames including circleplus extreme tier', () => {
  assert.deepEqual(
    JP_RATING_BANDS.map((b) => b.min),
    [0, 2000, 4000, 6000, 8000, 10000, 12000, 13000, 14000, 14500, 15000, 16000]
  );
  const jp = createDefaultState('jp');
  for (const [index, band] of JP_RATING_BANDS.entries()) {
    assert.equal(ratingBand(band.min, 'jp'), band);
    if (index) assert.equal(ratingBand(band.min - 1, 'jp'), JP_RATING_BANDS[index - 1]);
    jp.ratingValue = band.min;
    assert.equal(applyRatingBand(jp), band);
    assert.equal(jp.files.ratingFrame, JP_RATING_ROOT + band.asset);
    assert.ok(isAllowedAsset(jp.files.ratingFrame, 'ratingFrame'));
  }
  assert.equal(ratingBand(99999, 'jp').asset, 'circleplus/kiwami.webp');
  assert.equal(createDefaultState('jp').files.rank, '');
});
test('CN rating bands and default caller behavior remain unchanged', () => {
  for (const [index, band] of RATING_BANDS.entries()) {
    assert.equal(ratingBand(band.min), band);
    assert.equal(ratingBand(band.min, 'cn'), band);
    if (index) assert.equal(ratingBand(band.min - 1), RATING_BANDS[index - 1]);
  }
  assert.equal(ratingBand(16411).asset, 'UI_CMN_DXRating_S_11.png');
  assert.match(createDefaultState('cn').files.ratingFrame, /UI_CMN_DXRating_S_11.png$/);
});
test('only exact JP rating URLs and ratingFrame slot are accepted', () => {
  const path = JP_RATING_ROOT + 'circleplus/kiwami.webp';
  for (const bad of [
    path + '?x=1',
    path + '#x',
    path.replace('https:', 'http:'),
    path.replace(new URL(path).host, 'evil.invalid'),
    path.replace('/releases/20261108/', '/releases/20261109/'),
    JP_RATING_ROOT + 'kiwami.webp',
    JP_RATING_ROOT + 'circleplus/white.webp',
    JP_RATING_ROOT + '../cn/white.webp',
  ])
    assert.equal(isAllowedAsset(bad, 'ratingFrame'), false, bad);
  for (const slot of ['rank', 'friendBattle', 'avatar', 'ratingDigits'])
    assert.equal(isAllowedAsset(path, slot), false);
  assert.throws(() => sanitizeImportedState({ files: { ratingFrame: path } }));
  const jp = createDefaultState('jp');
  assert.deepEqual(sanitizeImportedState(jp), jp);
  jp.ratingValue = 2000;
  assert.equal(sanitizeImportedState(jp).files.ratingFrame, JP_RATING_ROOT + 'blue.webp');
});

test('legacy source-pinned JP rating templates migrate every tier to the COS mirror', () => {
  for (const band of JP_RATING_BANDS) {
    const old = LEGACY_JP_RATING_ROOT + band.asset;
    assert.equal(isAllowedAsset(old, 'ratingFrame', 'jp'), true);
    assert.equal(isAllowedAsset(old, 'ratingFrame', 'cn'), false);
    const next = sanitizeImportedState({ region: 'jp', ratingValue: band.min, files: { ratingFrame: old } });
    assert.equal(next.files.ratingFrame, JP_RATING_ROOT + band.asset);
    assert.throws(() => sanitizeImportedState({ files: { ratingFrame: old } }));
  }
  for (const path of [
    LEGACY_JP_RATING_ROOT.replace('a3a5027940519b6ff52831185177d58b71c404d2', 'main') + 'white.webp',
    LEGACY_JP_RATING_ROOT + 'circleplus/white.webp',
    LEGACY_JP_RATING_ROOT + 'rainbow.webp',
    LEGACY_JP_RATING_ROOT + 'white.webp?raw=1',
  ]) assert.equal(isAllowedAsset(path, 'ratingFrame', 'jp'), false, path);
});

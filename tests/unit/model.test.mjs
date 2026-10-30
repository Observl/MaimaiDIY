import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultState,
  sanitizeImportedState,
  ratingBand,
  nameCharacterCount,
  isAllowedAsset,
} from '../../src/model.js';
import { COS, RATING_BANDS } from '../../src/config.js';

test('default state is independent, uses 16411 and all required layers', () => {
  const a = createDefaultState();
  const b = createDefaultState();
  a.files.avatar = 'changed';
  assert.notEqual(a.files.avatar, b.files.avatar);
  assert.equal(b.ratingValue, 16411);
  assert.ok(Object.values(b.visible).every(Boolean));
});

test('all rating boundaries select the correct frame', () => {
  for (const [i, band] of RATING_BANDS.entries()) {
    assert.equal(ratingBand(band.min), band);
    if (i) assert.equal(ratingBand(band.min - 1), RATING_BANDS[i - 1]);
  }
});

test('name limit counts visible graphemes, including joined emoji', () => {
  assert.equal(nameCharacterCount('1234567👨‍👩‍👧'), 8);
  assert.equal(nameCharacterCount('éあ测试'), 4);
  assert.throws(() => sanitizeImportedState({ playerName: '123456789' }), /八个字符/);
});

test('template import cannot replace required visibility or derived frames', () => {
  const input = {
    ratingValue: 12345,
    titleColor: 'Normal',
    files: { titleBase: 'assets/avatar.png' },
    visible: { background: false, avatar: false, titleText: false, rank: false },
  };
  const next = sanitizeImportedState(input);
  assert.equal(next.visible.background, true);
  assert.equal(next.visible.avatar, true);
  assert.equal(next.visible.titleText, true);
  assert.equal(next.visible.rank, false);
  assert.match(next.files.titleBase, /Shougou_Normal/);
  assert.match(next.files.ratingFrame, /S_07/);
  assert.equal(input.visible.avatar, false);
});

test('unsafe paths, foreign origins, malformed state and oversized addresses are rejected', () => {
  for (const path of [
    'assets/../../private.png',
    'assets/..\\..\\private.png',
    'https://evil.invalid/a.png',
    `${COS.baseUrl}/materials/../private.png`,
    'javascript:alert(1)',
    'assets/a.html',
  ]) {
    assert.equal(isAllowedAsset(path, 'avatar'), false, path);
    assert.throws(() => sanitizeImportedState({ files: { avatar: path } }));
  }
  for (const input of [null, [], 3]) assert.throws(() => sanitizeImportedState(input));
  assert.equal(isAllowedAsset('assets/avatar.png', 'avatar'), true);
  assert.equal(isAllowedAsset(`${COS.baseUrl}/materials/avatars/a.png`, 'avatar'), true);
  assert.equal(isAllowedAsset('data:image/png;base64,YQ==', 'avatar'), true);
  assert.equal(isAllowedAsset('data:image/png;base64,YQ==', 'background'), false);
});

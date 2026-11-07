import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutPlayerName, nameCharacters } from '../../src/player-name.js';
import { slots } from '../../src/config.js';

const availableWidth = slots.rank.x - slots.nameBase.x;
const cellWidth = availableWidth / 8.5;
const layout = (text) => layoutPlayerName(text, availableWidth);

test('half a leading space and eight fixed full-width cells fill the board to rank interval', () => {
  assert.equal(availableWidth, 184);
  for (const name of ['舞萌玩家名称测试', 'AbcXYZab', 'ＡＢＣＤＥＦＧＨ', '中A文b字C测试']) {
    const result = layout(name);
    assert.equal(result.glyphs.length, 8);
    assert.equal(result.cellWidth, cellWidth);
    assert.equal(result.leadingSpace, cellWidth / 2);
    assert.equal(result.width + result.leadingSpace, availableWidth);
    assert.equal(result.glyphs[0].x, cellWidth / 2);
    assert.equal(result.glyphs[7].x + result.cellWidth, availableWidth);
  }
});

test('every name length uses identical positions and spacing, without scaling glyphs', () => {
  const eight = layout('ABCDEFGH');
  for (let count = 0; count <= 8; count++) {
    const result = layout('ABCDEFGH'.slice(0, count));
    assert.equal(result.cellWidth, eight.cellWidth);
    assert.equal(result.width, count * eight.cellWidth);
    assert.deepEqual(result.glyphs, eight.glyphs.slice(0, count));
    assert.ok(result.glyphs.every(glyph => !Object.hasOwn(glyph, 'scaleX')));
  }
});

test('only ASCII English letters become full-width, without changing punctuation or other scripts', () => {
  assert.equal(layout('Az09.-é中').glyphs.map(({ text }) => text).join(''), 'Ａｚ09.-é中');
  assert.equal(layout('Ａｚカ한🙂').glyphs.map(({ text }) => text).join(''), 'Ａｚカ한🙂');
});

test('combining marks, surrogate pairs and joined emoji each stay in their visible cell', () => {
  const name = 'e\u0301か\u3099𠮷👨‍👩‍👧🇨🇳👍🏽';
  assert.equal(nameCharacters(name).length, 6);
  const result = layout(name);
  assert.deepEqual(result.glyphs.map(({ text }) => text), ['ｅ\u0301', 'か\u3099', '𠮷', '👨‍👩‍👧', '🇨🇳', '👍🏽']);
  assert.equal(result.width, 6 * cellWidth);
});

test('narrow punctuation and wide fallback glyphs cannot change cell positions or font size', () => {
  const result = layout('.🙂A﷽𠮷1🇨🇳B');
  assert.equal(result.cellWidth, cellWidth);
  assert.deepEqual(result.glyphs.map(({ x }) => x), Array.from({ length: 8 }, (_, i) => cellWidth / 2 + i * cellWidth));
  assert.equal(result.width + result.leadingSpace, availableWidth);
});

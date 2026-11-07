import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutPlayerName, nameCharacters } from '../../src/player-name.js';
import { slots } from '../../src/config.js';

const availableWidth = slots.rank.x - slots.nameBase.x;
const measureText = (text) => ({ width: /[.1]/.test(text) ? 10 : 20 });
const layout = (text) => layoutPlayerName(text, availableWidth, measureText);

test('six full-width cells fill precisely the name board to rank interval', () => {
  assert.equal(availableWidth, 184);
  for (const name of ['舞萌玩家测试', 'AbcXYZ', 'ＡＢＣＤＥＦ', '中A文b字C']) {
    const result = layout(name);
    assert.equal(result.glyphs.length, 6);
    assert.equal(result.width, availableWidth);
    assert.equal(result.glyphs[0].x, 0);
    assert.equal(result.glyphs[5].x + 20 * result.glyphs[5].scaleX, availableWidth);
  }
});

test('short names remain left-aligned with the same character width as six-character names', () => {
  const six = layout('ABCDEF');
  for (const text of ['A', 'ABC', 'ABCDE']) {
    const result = layout(text);
    assert.equal(result.cellWidth, six.cellWidth);
    assert.equal(result.width, text.length * six.cellWidth);
    assert.deepEqual(result.glyphs, six.glyphs.slice(0, text.length));
  }
  assert.deepEqual(layout('').glyphs, []);
  assert.equal(layout('').width, 0);
});

test('seven and eight visible characters compress uniformly into the same interval', () => {
  const normal = layout('ABCDEF');
  for (const text of ['ABCDEFG', 'ABCDEFGH', '舞萌玩家名称测试', '中Ab文CdEF']) {
    const result = layout(text);
    assert.equal(result.width, availableWidth);
    assert.equal(result.cellWidth, availableWidth / text.length);
    assert.ok(Math.abs(result.glyphs[0].scaleX / normal.glyphs[0].scaleX - 6 / text.length) < 1e-12);
    const last = result.glyphs.at(-1);
    assert.equal(last.x + 20 * last.scaleX, availableWidth);
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
  assert.equal(result.width, availableWidth);
});

test('narrow punctuation is centered, and wide fallback glyphs and ink overhangs stay inside their cells', () => {
  const measurements = {
    あ: { width: 20 },
    '.': { width: 4, actualBoundingBoxLeft: -1, actualBoundingBoxRight: 3 },
    '🙂': { width: 35, actualBoundingBoxLeft: 2, actualBoundingBoxRight: 40 },
    'Ａ': { width: 20, actualBoundingBoxLeft: 3, actualBoundingBoxRight: 22 },
  };
  const result = layoutPlayerName('.🙂A', availableWidth, (text) => measurements[text]);
  assert.equal(result.glyphs[0].x, (result.cellWidth - 4 * result.glyphs[0].scaleX) / 2);
  result.glyphs.forEach((glyph, index) => {
    const metrics = measurements[glyph.text];
    const inkLeft = glyph.x - metrics.actualBoundingBoxLeft * glyph.scaleX;
    const inkRight = glyph.x + metrics.actualBoundingBoxRight * glyph.scaleX;
    assert.ok(inkLeft >= index * result.cellWidth - 1e-12);
    assert.ok(inkRight <= (index + 1) * result.cellWidth + 1e-12);
  });
});

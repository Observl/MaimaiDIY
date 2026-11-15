import test from 'node:test';
import assert from 'node:assert/strict';
import { titleTextWidth, titleScrollOffset, TITLE_SPACING } from '../../src/title-layout.js';

test('title width measures glyphs rather than a character-count limit', () => {
  assert.equal(titleTextWidth('', () => 10), 0);
  assert.equal(titleTextWidth('🙂A', () => 10), 20 + TITLE_SPACING);
  assert.ok(titleTextWidth('WW', () => 15) > titleTextWidth('ii', () => 3));
});
test('short and exactly fitting titles remain still', () => {
  for (const t of [0, 500, 99999]) {
    assert.equal(titleScrollOffset(100, 248, t), 0);
    assert.equal(titleScrollOffset(248, 248, t), 0);
  }
});
test('long titles pause, move at constant speed, show end, then loop', () => {
  assert.equal(titleScrollOffset(296, 248, 0), 0);
  assert.equal(titleScrollOffset(296, 248, 1400), 0);
  assert.equal(titleScrollOffset(296, 248, 2400), 24);
  assert.equal(titleScrollOffset(296, 248, 3400), 48);
  assert.equal(titleScrollOffset(296, 248, 4799), 48);
  assert.equal(titleScrollOffset(296, 248, 4800), 0);
  assert.equal(titleScrollOffset(296, 248, -100), 0);
});


test('long catalog titles survive template and draft sanitizing within a bounded limit', async () => {
  const { createDefaultState, sanitizeImportedState } = await import('../../src/model.js');
  const state = createDefaultState();
  state.titleName = state.labels.title = '称号'.repeat(100);
  const restored = sanitizeImportedState(state);
  assert.equal(restored.titleName, state.titleName);
  assert.equal(restored.labels.title, state.labels.title);
  state.titleName = 'a'.repeat(2000);
  assert.equal(sanitizeImportedState(state).titleName.length, 1024);
});

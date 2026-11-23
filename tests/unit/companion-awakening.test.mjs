import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { companionAwakeningProgress, companionAwakeningTier, companionPaletteSlot, maiDrawPaletteForCharacter, validateCompanionPalettes, validateMaiDrawPalettes } from '../../src/regional-display-layout.js';
import { companionIdLabel } from '../../src/region-profile.js';

const file = new URL('../../regional-display/companion-palettes.json', import.meta.url);
const palettes = validateCompanionPalettes(JSON.parse(readFileSync(file, 'utf8')));

test('each companion awakening star unlocks at its exact level', () => {
  const { awakeningLevels } = palettes;
  for (const [tier, level] of [10, 50, 100, 300, 1000, 9999].entries()) {
    assert.equal(companionAwakeningTier(level - 1, awakeningLevels), tier);
    assert.equal(companionAwakeningTier(level, awakeningLevels), tier + 1);
  }
});

test('each character resolves to its template palette or the regional default', () => {
  for (const region of Object.values(palettes.regions)) {
    assert.equal(companionPaletteSlot(region, '400105'), 4);
    assert.equal(companionPaletteSlot(region, '100101'), 1);
    assert.equal(companionPaletteSlot(region, '100103'), 0);
    assert.equal(companionPaletteSlot(region, 102), companionPaletteSlot(region, '000102'));
    assert.equal(companionPaletteSlot(region, '100104'), companionPaletteSlot(region, '100105'));
    for (const [id, slot] of Object.entries(region.characters)) {
      if (slot === null) assert.ok(region.display.fallbackPalettes.includes(companionPaletteSlot(region, id)));
    }
  }
});

test('the central star shows only completed ten-percent progress steps', () => {
  const levels = palettes.awakeningLevels;
  for (const [level, step] of [[9, null], [10, 0], [13, 0], [14, 1], [30, 5], [49, 9], [50, 0], [1000, null], [9999, null]]) {
    assert.equal(companionAwakeningProgress(level, companionAwakeningTier(level, levels), levels), step);
  }
});

test('companion labels preserve six-digit regional IDs', () => {
  assert.equal(companionIdLabel(101), 'ID 000101');
  assert.equal(companionIdLabel('000101'), 'ID 000101');
  assert.equal(companionIdLabel('100101'), 'ID 100101');
});

test('mai_draw characters share the same color data when they belong to one palette', () => {
  const file = new URL('../../regional-display/mai-draw-palettes.json', import.meta.url);
  const data = validateMaiDrawPalettes(JSON.parse(readFileSync(file, 'utf8')));
  const palette = id => maiDrawPaletteForCharacter(data, id);
  assert.deepEqual(palette('100104'), { colorId: 100001, rgb: [123, 224, 182] });
  assert.deepEqual(palette('100104'), palette('100105'));
  assert.deepEqual(palette('100301'), palette('100302'));
  assert.notDeepEqual(palette('100104'), palette('100301'));
  assert.deepEqual(palette(101), palette('000101'));
  assert.equal(palette('999999'), null);
});

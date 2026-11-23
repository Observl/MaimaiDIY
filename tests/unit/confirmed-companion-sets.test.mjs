import { sanitizeRegionFields } from '../../src/region-profile.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfirmedCompanionSets } from '../../src/regional-display-layout.js';

const read = file => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const confirmed = read('../../regional-display/confirmed-companion-sets.json');
const colors = read('../../regional-display/mai-draw-palettes.json');
const jp = read('../../data/regions/jp.json');

test('every reviewed color and known character resolves to its confirmed set', () => {
  assert.equal(validateConfirmedCompanionSets(confirmed), confirmed);
  assert.equal(Object.keys(confirmed.colors).length, 128);
  for (const [id, colorId] of Object.entries(colors.characters)) {
    assert.equal(confirmed.characters[id].colorId, colorId);
    assert.equal(confirmed.characters[id].setId, confirmed.colors[colorId]);
  }
});

test('new explicitly classified collaborations use the reviewed event set', () => {
  for (const item of jp.charas.filter(item => item.isCollabo === true))
    assert.equal(confirmed.characters[String(item.id).padStart(6, '0')].setId, confirmed.colors['3301']);
});

test('unknown portraits remain unassigned instead of inheriting a slot color', () => {
  for (const ids of Object.values(confirmed.unmapped))
    for (const id of ids) assert.equal(confirmed.characters[id], undefined);
});

test('a broken confirmed assignment is rejected before rendering', () => {
  const broken = structuredClone(confirmed);
  broken.characters['000101'].setId = 'nonexistent';
  assert.throws(() => validateConfirmedCompanionSets(broken), /assignment/);
});


test('level 9999 and explicit awakening survive template sanitization independently', () => {
  for (const awakened of [false, true]) {
    const member = { id: '000101', level: 9999, ...(awakened ? { awakened: true } : {}) };
    assert.deepEqual(sanitizeRegionFields({ region: 'cn', screenMode: 'companions', companions: [member] }).companions, [member]);
  }
});

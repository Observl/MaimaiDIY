import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialDesign } from '../../src/default-designs.js';
import { saveCurrentDesign, readCurrentDesign } from '../../src/current-design.js';

test('first-visit examples match the supplied CN and JP companion designs', () => {
  const cn = createInitialDesign('cn'), jp = createInitialDesign('jp');
  assert.equal(cn.screenMode, 'companions');
  assert.equal(jp.screenMode, 'companions');
  assert.deepEqual(cn.companions.map(member => member.id), ['250401', '400405', '250405', '550301', '200405']);
  assert.deepEqual(jp.companions.map(member => member.id), ['400405', '400401', '200401', '550303', '250402']);
  for (const design of [cn, jp]) {
    assert.equal(design.playerName, 'Null.');
    assert.equal(design.titleName, 'WIREPULLER');
    assert.equal(design.visible.ratingFrame, false);
    assert.equal(design.visible.ratingDigits, false);
    assert.ok(design.companions.every(member => member.level === 9999 && member.awakened));
  }
  assert.equal(cn.ratingValue, 16411);
  assert.equal(jp.ratingValue, 17000);
});

test('editing an example replaces the user draft without modifying the shared examples', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const design = createInitialDesign('cn');
  design.playerName = 'USER';
  design.companions[0].level = 100;
  assert.equal(saveCurrentDesign(design, storage), true);
  const restored = readCurrentDesign(storage) || createInitialDesign();
  assert.equal(restored.playerName, 'USER');
  assert.equal(restored.companions[0].level, 100);
  assert.equal(createInitialDesign('cn').playerName, 'Null.');
  assert.equal(createInitialDesign('cn').companions[0].level, 9999);
});

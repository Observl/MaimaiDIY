import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { companionLevelTransforms } from '../../src/regional-display-layout.js';

const palettes = JSON.parse(readFileSync(new URL('../../regional-display/companion-palettes.json', import.meta.url), 'utf8'));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

for (const region of ['cn', 'jp']) {
  const { display } = palettes.regions[region];
  test(`${region} leader and first member retain their original level glyphs`, () => {
    for (const index of [0, 1]) assert.deepEqual(companionLevelTransforms(display, index), display.slots[index].levelTransforms);
  });

  test(`${region} all four member runs share the first member's digit spacing and baseline`, () => {
    const reference = display.slots[1].levelTransforms;
    for (let index = 1; index < 5; index++) {
      const source = display.slots[index].levelTransforms;
      const dx = source[1][4] - reference[1][4];
      const dy = source[1][5] - reference[1][5];
      const result = companionLevelTransforms(display, index);
      for (let digit = 0; digit < 4; digit++) {
        for (let axis = 0; axis < 4; axis++) close(result[digit][axis], reference[digit][axis]);
        close(result[digit][4] - reference[digit][4], dx);
        close(result[digit][5] - reference[digit][5], dy);
      }
      // The last three digits already fit their frames and must not move.
      for (let digit = 1; digit < 4; digit++) {
        close(result[digit][4], source[digit][4]);
        close(result[digit][5], source[digit][5]);
      }
    }
  });

  test(`${region} normalizing glyphs never mutates shared source data`, () => {
    const before = structuredClone(display);
    const result = companionLevelTransforms(display, 4);
    result[0][4] = -100;
    assert.deepEqual(display, before);
  });
}

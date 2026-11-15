import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutScoreDigits } from '../../src/regional-display.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
for (const [region, height, gap] of [['cn', 52, 2], ['jp', 74, 10]]) {
  test(`${region}: equal-width cells preserve artwork proportions on both sides`, () => {
    const forward = layoutScoreDigits(region, '0123456789', 600, 1);
    const backward = layoutScoreDigits(region, '0123456789', 600, -1);
    for (const run of [forward, backward]) {
      const cell = run.glyphs[0].cellWidth;
      for (const glyph of run.glyphs) {
        close(glyph.cellWidth, cell);
        close(glyph.x + glyph.width / 2, glyph.cellX + cell / 2);
        assert.ok(glyph.width <= cell + 1e-8);
        assert.ok(glyph.scale > 0);
      }
      for (let i = 1; i < run.glyphs.length; i++)
        close(Math.abs(run.glyphs[i].cellX - run.glyphs[i - 1].cellX), cell + gap);
    }
    forward.glyphs.forEach((g, i) => {
      close(g.width, backward.glyphs[i].width);
      close(g.scale, backward.glyphs[i].scale);
    });
    // Existing '1' metrics: its visible height is 103 (CN) or 70 (JP).
    close(forward.glyphs[1].scale, height / (region === 'cn' ? 103 : 70));
    assert.ok(forward.glyphs[1].width < forward.glyphs[0].width);
  });

  test(`${region}: cell positions do not shift when a digit changes`, () => {
    for (const direction of [-1, 1]) {
      const ones = layoutScoreDigits(region, '1111', 600, direction);
      const zeros = layoutScoreDigits(region, '0000', 600, direction);
      close(ones.edge, zeros.edge);
      ones.glyphs.forEach((g, i) => close(g.cellX, zeros.glyphs[i].cellX));
    }
  });

  test(`${region}: all whole values and decimal digits stay clear of punctuation and within canvas`, () => {
    // Conservatively test across every possible decimal-point width (0..30px).
    const center = region === 'cn' ? 655.5 : 607.5;
    for (let dotWidth = 0; dotWidth <= 30; dotWidth++) {
      for (let whole = 0; whole <= 101; whole++) {
        const run = layoutScoreDigits(region, [...String(whole)].reverse(), center - dotWidth / 2 - gap, -1);
        const visual = [...run.glyphs].reverse();
        assert.ok(visual[0].x >= 299);
        for (let i = 1; i < visual.length; i++) assert.ok(visual[i].x >= visual[i - 1].x + visual[i - 1].width + gap - 1e-8);
        const last = visual.at(-1);
        assert.ok(last.x + last.width <= center - dotWidth / 2 - gap + 1e-8);
      }
      for (const decimal of ['0000', '1111', '1234', '5678', '9999', '9091', '8888']) {
        const run = layoutScoreDigits(region, decimal, center + dotWidth / 2 + gap, 1);
        assert.ok(run.glyphs[0].x >= center + dotWidth / 2 + gap);
        for (let i = 1; i < run.glyphs.length; i++) assert.ok(run.glyphs[i].x >= run.glyphs[i - 1].x + run.glyphs[i - 1].width + gap - 1e-8);
        const last = run.glyphs.at(-1);
        assert.ok(run.edge >= last.x + last.width + gap - 1e-8);
        // Real percent glyph is narrower than 40px at its configured height.
        assert.ok(run.edge + 40 < 1080);
      }
    }
  });
}

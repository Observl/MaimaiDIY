import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../../src/model.js';
import { slots } from '../../src/config.js';

test('late image loads cannot overwrite a newer render; strict previews reject missing assets', async () => {
  const oldDocument = globalThis.document,
    oldImage = globalThis.Image;
  const pending = new Map(),
    draws = [];
  class Canvas {
    getContext() {
      return {
        setTransform() {},
        clearRect() {},
        drawImage: (image) => {
          if (image.src) draws.push(image.src);
        },
      };
    }
  }
  globalThis.document = { createElement: () => new Canvas() };
  globalThis.Image = class {
    naturalWidth = 1;
    naturalHeight = 1;
    set src(value) {
      this._src = value;
      pending.set(value, { load: () => this.onload(), fail: () => this.onerror(Error('failed')) });
    }
    get src() {
      return this._src;
    }
  };
  try {
    const { createRenderer } = await import('../../src/renderer.js');
    const renderer = createRenderer(new Canvas());
    const a = createDefaultState();
    for (const id of Object.keys(a.visible)) a.visible[id] = id === 'background';
    a.files.background = 'slow-test.png';
    const slow = renderer.render(a);
    const b = structuredClone(a);
    b.files.background = 'fast-test.png';
    const fast = renderer.render(b);
    pending.get('fast-test.png').load();
    assert.equal(await fast, true);
    pending.get('slow-test.png').load();
    assert.equal(await slow, false);
    assert.deepEqual(draws, ['fast-test.png']);
    b.files.background = 'missing-test.png';
    const strict = renderer.render(b, { strict: true });
    pending.get('missing-test.png').fail();
    await assert.rejects(strict, /素材未加载完成/);
    assert.deepEqual(draws, ['fast-test.png']);
  } finally {
    globalThis.document = oldDocument;
    globalThis.Image = oldImage;
  }
});

test('mobile and touch-sized devices use a canvas size safe for mobile browsers', async () => {
  const { preferredRenderScale } = await import('../../src/renderer.js');
  assert.equal(preferredRenderScale({ coarsePointer: true }), 2);
  assert.equal(
    preferredRenderScale({ coarsePointer: false, maxTouchPoints: 5, screenWidth: 390 }),
    2
  );
});

test('desktop rendering keeps the existing high-resolution composition', async () => {
  const { preferredRenderScale } = await import('../../src/renderer.js');
  assert.equal(
    preferredRenderScale({ coarsePointer: false, maxTouchPoints: 0, screenWidth: 1440 }),
    4
  );
});

test('name rendering uses fixed full-width cells, clips overhangs and never scales glyphs', async () => {
  const oldDocument = globalThis.document;
  const draws = [], rectangles = [], scales = [], fonts = [];
  class Canvas {
    getContext() {
      return {
        save() {}, restore() {}, setTransform() {}, clearRect() {}, drawImage() {},
        beginPath() {}, clip() {},
        set font(value) { fonts.push(value); },
        rect: (...values) => rectangles.push(values),
        scale: (x, y) => scales.push([x, y]),
        fillText: (...values) => draws.push(values),
      };
    }
  }
  globalThis.document = { createElement: () => new Canvas() };
  try {
    const { createRenderer } = await import('../../src/renderer.js');
    const renderer = createRenderer(new Canvas());
    const state = createDefaultState();
    state.playerName = 'Ab中文👨‍👩‍👧EFG';
    for (const id of Object.keys(state.visible)) state.visible[id] = id === 'playerName';
    assert.equal(await renderer.render(state), true);
    assert.equal(state.playerName, 'Ab中文👨‍👩‍👧EFG');
    assert.deepEqual(draws.map(([text]) => text), ['Ａ', 'ｂ', '中', '文', '👨‍👩‍👧', 'Ｅ', 'Ｆ', 'Ｇ']);
    const cellWidth = (slots.rank.x - slots.nameBase.x) / 9;
    assert.deepEqual(draws[0], ['Ａ', 142 + cellWidth + cellWidth / 2, 87]);
    assert.deepEqual(draws.at(-1), ['Ｇ', 142 + 8 * cellWidth + cellWidth / 2, 87]);
    assert.deepEqual(rectangles, Array.from({ length: 8 }, (_, i) => [142 + (i + 1) * cellWidth, 67, cellWidth, 40]));
    assert.deepEqual(fonts, [`400 ${cellWidth}px "SEGA Maru Gothic DB", sans-serif`]);
    assert.deepEqual(scales, []);
  } finally {
    globalThis.document = oldDocument;
  }
});

test('Rating waits for its dedicated font, preserves five fixed cells and right-aligns short values', async () => {
  const oldDocument = globalThis.document;
  const draws = [], fonts = [], loads = [], strokes = [];
  let finishFont;
  class Canvas {
    getContext() {
      return {
        save() {}, restore() {}, setTransform() {}, clearRect() {}, drawImage() {},
        set font(value) { fonts.push(value); },
        strokeText: (...values) => strokes.push(values),
        fillText: (...values) => draws.push(values),
      };
    }
  }
  globalThis.document = {
    createElement: () => new Canvas(),
    fonts: { load: (...args) => {
      loads.push(args);
      return new Promise(resolve => { finishFont = resolve; });
    } },
  };
  try {
    const { createRenderer } = await import('../../src/renderer.js');
    const renderer = createRenderer(new Canvas());
    const state = createDefaultState();
    for (const id of Object.keys(state.visible)) state.visible[id] = id === 'ratingDigits';
    state.ratingValue = 16411;
    const pending = renderer.render(state);
    assert.equal(draws.length, 0, 'must not capture fallback digits while the local font is loading');
    assert.deepEqual(loads, [['800 19px "Maimai Rating Digits"', '0123456789']]);
    finishFont([]);
    assert.equal(await pending, true);
    assert.deepEqual(draws, [['1', 230.5, 49], ['6', 246, 49], ['4', 261, 49], ['1', 276, 49], ['1', 291, 49]]);
    assert.deepEqual(strokes, draws);
    for (const rating of [0, 9, 1024, 99999]) {
      draws.length = 0; strokes.length = 0;
      state.ratingValue = rating;
      await renderer.render(state);
      assert.equal(draws.map(([value]) => value).join(''), String(rating));
      assert.equal(draws.at(-1)[1], 291);
      assert.equal(state.ratingValue, rating);
    }
    assert.equal(loads.length, 1, 'reuse the same loaded font across renders');
    assert.ok(fonts.every(font => font === '800 19px "Maimai Rating Digits", sans-serif'));
  } finally {
    globalThis.document = oldDocument;
  }
});

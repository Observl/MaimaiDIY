import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../../src/model.js';

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
    assert.deepEqual(draws[0], ['Ａ', 153.5, 87]);
    assert.deepEqual(draws.at(-1), ['Ｇ', 314.5, 87]);
    assert.deepEqual(rectangles, Array.from({ length: 8 }, (_, i) => [142 + i * 23, 67, 23, 40]));
    assert.deepEqual(fonts, ['400 23px "SEGA Maru Gothic DB", sans-serif']);
    assert.deepEqual(scales, []);
  } finally {
    globalThis.document = oldDocument;
  }
});

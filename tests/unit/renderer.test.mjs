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

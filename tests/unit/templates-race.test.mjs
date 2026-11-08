import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeTemplates } from '../../src/templates.js';
import { createDefaultState } from '../../src/model.js';
import { templateStorageKey } from '../../src/region-profile.js';
import { TEMPLATE_FILE_FORMAT, TEMPLATE_FILE_VERSION } from '../../src/config.js';
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { resolve, promise };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function fixture(run, options = {}) {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const elements = new Map();
  for (const id of ['list', 'name', 'status', 'save', 'load', 'delete', 'export', 'import'])
    elements.set('#template-' + id, {
      value: '',
      textContent: '',
      handlers: {},
      options: [],
      addEventListener(n, f) {
        this.handlers[n] = f;
      },
      replaceChildren() {
        this.options = [];
        this.value = '';
      },
      add(option) {
        this.options.push(option);
        if (this.options.length === 1) this.value = option.value;
      },
      focus() {},
    });
  const previous = {
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    Option: globalThis.Option,
    Image: globalThis.Image,
  };
  globalThis.localStorage = storage;
  globalThis.document = { querySelector: (id) => elements.get(id) };
  globalThis.Option = class {
    constructor(text, value) {
      this.text = text;
      this.value = value;
    }
  };
  const state = createDefaultState();
  const a = { id: 'a', name: 'A', state: { ...createDefaultState(), playerName: 'AAA' } };
  const b = { id: 'b', name: 'B', state: { ...createDefaultState(), playerName: 'BBB' } };
  storage.setItem(templateStorageKey(), JSON.stringify([a, b]));
  let history = 0;
  const api = initializeTemplates({
    state,
    snapshotState: () => structuredClone(state),
    recordHistory() {
      history++;
    },
    syncControlsFromState() {
      api.refresh();
    },
    async render() {},
    ...options,
  });
  const click = (id) => elements.get('#template-' + id).handlers.click();
  const importFile = (value, text) =>
    elements
      .get('#template-import')
      .handlers.change({
        currentTarget: {
          value: 'file',
          files: [
            {
              size: 100,
              text:
                text ||
                (async () =>
                  JSON.stringify({
                    format: TEMPLATE_FILE_FORMAT,
                    version: TEMPLATE_FILE_VERSION,
                    name: 'Imported',
                    state: value,
                  })),
            },
          ],
        },
      });
  try {
    await run({ state, storage, e: elements, api, click, importFile, history: () => history });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}
test('catalog-delayed load is cancelled by a region switch, including switching away and back', async () => {
  const gate = deferred();
  await fixture(
    async ({ state, e, click, api, history }) => {
      e.get('#template-list').value = 'a';
      const pending = click('load');
      state.region = 'jp';
      api.refresh();
      state.region = 'cn';
      api.refresh();
      gate.resolve();
      await pending;
      assert.notEqual(state.playerName, 'AAA');
      assert.equal(history(), 0);
    },
    { getCatalog: () => gate.promise }
  );
});
test('latest load wins when earlier catalog request finishes later', async () => {
  const first = deferred(),
    second = deferred();
  let calls = 0;
  await fixture(
    async ({ state, e, click, history }) => {
      e.get('#template-list').value = 'a';
      const p1 = click('load');
      e.get('#template-list').value = 'b';
      const p2 = click('load');
      second.resolve();
      await p2;
      first.resolve();
      await p1;
      assert.equal(state.playerName, 'BBB');
      assert.equal(history(), 1);
      assert.equal(e.get('#template-list').value, 'b');
    },
    { getCatalog: () => (++calls === 1 ? first.promise : second.promise) }
  );
});
test('mode change during file read prevents import persistence and state apply', async () => {
  const gate = deferred();
  await fixture(async ({ state, storage, importFile, history }) => {
    const before = storage.getItem(templateStorageKey());
    const pending = importFile(createDefaultState(), () => gate.promise);
    state.screenMode = 'companions';
    gate.resolve(
      JSON.stringify({
        format: TEMPLATE_FILE_FORMAT,
        version: TEMPLATE_FILE_VERSION,
        state: createDefaultState(),
      })
    );
    await pending;
    assert.equal(state.screenMode, 'companions');
    assert.equal(storage.getItem(templateStorageKey()), before);
    assert.equal(history(), 0);
  });
});
test('import may explicitly change mode if scope stays unchanged during catalog await', async () => {
  const gate = deferred();
  await fixture(
    async ({ state, storage, importFile, history }) => {
      const pending = importFile({ ...createDefaultState(), screenMode: 'achievement' });
      await tick();
      gate.resolve();
      await pending;
      assert.equal(state.screenMode, 'achievement');
      assert.equal(history(), 1);
      assert.ok(storage.getItem(templateStorageKey('cn', 'achievement')));
    },
    { getCatalog: () => gate.promise }
  );
});
test('scope change while decoding uploaded avatar cancels import before writing', async () => {
  await fixture(async ({ state, storage, importFile, history }) => {
    let image;
    globalThis.Image = class {
      constructor() {
        image = this;
      }
      set src(_value) {}
    };
    const before = storage.getItem(templateStorageKey());
    const value = createDefaultState();
    value.files.avatar = 'data:image/png;base64,YmFzZQ==';
    const pending = importFile(value);
    await tick();
    assert.ok(image);
    state.screenMode = 'companions';
    image.naturalWidth = 100;
    image.naturalHeight = 100;
    image.onload();
    await pending;
    assert.equal(storage.getItem(templateStorageKey()), before);
    assert.equal(history(), 0);
  });
});
test('newer import cancels an earlier load and refresh keeps selected template', async () => {
  const gate = deferred();
  let calls = 0;
  await fixture(
    async ({ state, e, api, click, importFile, history }) => {
      e.get('#template-list').value = 'b';
      api.refresh();
      assert.equal(e.get('#template-list').value, 'b');
      const pending = click('load');
      await importFile({ ...createDefaultState(), playerName: 'IMPORTED' });
      gate.resolve();
      await pending;
      assert.equal(state.playerName, 'IMPORTED');
      assert.equal(history(), 1);
    },
    { getCatalog: () => (++calls === 1 ? gate.promise : undefined) }
  );
});
test('export validation failure becomes status instead of an uncaught exception', async () => {
  await fixture(async ({ state, e, click }) => {
    state.region = 'invalid';
    assert.doesNotThrow(() => click('export'));
    assert.match(e.get('#template-status').textContent, /导出失败/);
  });
});

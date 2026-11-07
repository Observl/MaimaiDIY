import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pickerDOM, Element } from '../helpers/picker-dom.mjs';
import { controls, COS } from '../../src/config.js';
import { createDefaultState } from '../../src/model.js';

let serial = 0;
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function setup(context, { fetch, image = () => true } = {}) {
  const id = ++serial;
  const dom = pickerDOM();
  const storage = new Map();
  const requests = [];
  const original = {};
  const globals = {
    document: dom.document,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    Option: class extends Element { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } },
    requestAnimationFrame: fn => fn(),
    fetch: async url => {
      const path = new URL(url).pathname;
      requests.push(path);
      if (fetch) return fetch(path);
      return Response.json({ schemaVersion: 1, categories: [{ id: 'avatars', items: [1, 2].map(number => ({
        id: `test-${id}-${number}`, name: `素材 ${number}`, file: `avatars/test-${id}-${number}.png`,
      })) }] });
    },
    Image: class {
      naturalWidth = 128;
      naturalHeight = 128;
      set src(value) {
        if (!value) return;
        Promise.resolve().then(() => image(value)).then(ok => ok ? this.onload() : this.onerror(Error('unavailable')));
      }
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    original[key] = globalThis[key];
    globalThis[key] = value;
  }
  context.after(() => Object.assign(globalThis, original));
  const moduleUrl = new URL('../../src/picker.js', import.meta.url);
  const source = (await readFile(moduleUrl, 'utf8')).replace(/from '(\.\/[^']+)'/g, (_match, path) =>
    `from '${new URL(path, moduleUrl).href}${path === './assets.js' ? `?picker-test=${id}` : ''}'`);
  const { initializePicker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const state = createDefaultState();
  const calls = { history: 0, render: 0, selected: 0 };
  const picker = initializePicker({ state,
    recordHistory: () => { calls.history++; },
    render: async () => { calls.render++; },
    onSelection: () => { calls.selected++; },
  });
  return { ...dom, id, state, calls, storage, requests,
    open: id => picker.open(controls.find(control => control.id === id)),
    items: () => dom.get('#picker-grid').childNodes,
  };
}

test('title and badge pickers do not request the unrelated main manifest', async context => {
  const ui = await setup(context, { fetch: path => {
    if (path.endsWith('/titles.json')) return Response.json({ items: [{ name: '测试', color: 'Silver' }] });
    if (path.endsWith('/badges.json')) return Response.json({ schemaVersion: 1, categories: ['ranks', 'friend-battles'].map(id => ({
      id, items: [{ id: `${id}/1`, name: '测试', file: `${id}/1.png` }],
    })) });
    throw Error('Main manifest is unavailable');
  } });
  for (const id of ['title', 'rank', 'friendBattle']) {
    await ui.open(id);
    assert.equal(ui.items().length, 1);
    await ui.get('#asset-picker').close();
  }
  assert.deepEqual(ui.requests, ['/materials/titles.json', '/materials/badges.json']);
});

test('unavailable images preserve selection and history, and the same item can retry', async context => {
  let available = false;
  const ui = await setup(context, { image: () => available });
  const original = structuredClone(ui.state);
  await ui.open('avatar');
  const button = ui.items()[0];
  await button.emit('click');
  assert.deepEqual(ui.state, original);
  assert.deepEqual(ui.calls, { history: 0, render: 0, selected: 0 });
  assert.equal(ui.storage.has('maimai-diy-picker-selection-v1'), false);
  assert.equal(ui.get('#asset-picker').open, true);
  assert.match(ui.get('#picker-message').textContent, /已保留原搭配/);
  assert.equal(button.disabled, false);
  available = true;
  await button.emit('click');
  assert.equal(ui.state.files.avatar, `${COS.baseUrl}/materials/avatars/test-${ui.id}-1.png`);
  assert.deepEqual(ui.calls, { history: 1, render: 1, selected: 1 });
  assert.equal(ui.get('#asset-picker').open, false);
});

test('unavailable title frames do not change the title or history', async context => {
  const ui = await setup(context, {
    fetch: () => Response.json({ items: [{ name: '测试', color: 'Silver' }] }), image: () => false,
  });
  const original = structuredClone(ui.state);
  await ui.open('title');
  await ui.items()[0].emit('click');
  assert.deepEqual(ui.state, original);
  assert.equal(ui.calls.history, 0);
});

test('the latest selection wins when an earlier image finishes later', async context => {
  const slow = deferred();
  const ui = await setup(context, { image: src => src.endsWith('-1.png') ? slow.promise : true });
  await ui.open('avatar');
  const [first, second] = ui.items();
  const pending = first.emit('click');
  assert.equal(first.disabled, true);
  await second.emit('click');
  slow.resolve(true);
  await pending;
  assert.equal(ui.state.files.avatar, `${COS.baseUrl}/materials/avatars/test-${ui.id}-2.png`);
  assert.deepEqual(ui.calls, { history: 1, render: 1, selected: 1 });
});

test('closing and reopening a cached picker cancels the pending selection', async context => {
  const slow = deferred();
  const ui = await setup(context, { image: () => slow.promise });
  const original = structuredClone(ui.state);
  await ui.open('avatar');
  const first = ui.items()[0];
  const pending = first.emit('click');
  await ui.get('#asset-picker').close();
  await ui.open('avatar');
  slow.resolve(true);
  await pending;
  assert.deepEqual(ui.state, original);
  assert.deepEqual(ui.calls, { history: 0, render: 0, selected: 0 });
  assert.equal(ui.get('#asset-picker').open, true);
  assert.equal(first.disabled, false);
});

test('changing search cancels a pending selection from the old results', async context => {
  const slow = deferred();
  const ui = await setup(context, { image: () => slow.promise });
  const original = structuredClone(ui.state);
  await ui.open('avatar');
  const pending = ui.items()[0].emit('click');
  ui.get('#picker-search').value = '素材 2';
  await ui.get('#picker-search').emit('input');
  slow.resolve(true);
  await pending;
  assert.deepEqual(ui.state, original);
  assert.equal(ui.items().length, 1);
  assert.equal(ui.calls.history, 0);
});

test('late index errors cannot overwrite a newer independent library', async context => {
  const slow = deferred();
  const warning = context.mock.method(console, 'warn', () => {});
  const ui = await setup(context, { fetch: async path => {
    if (path.endsWith('/titles.json')) return Response.json({ items: [{ name: '测试', color: 'Silver' }] });
    await slow.promise;
    return new Response('Unavailable', { status: 451 });
  } });
  const pending = ui.open('avatar');
  await ui.get('#asset-picker').close();
  await ui.open('title');
  slow.resolve();
  await pending;
  assert.equal(ui.get('#picker-title').textContent, '选择称号');
  assert.equal(ui.get('#picker-meta').textContent, '找到 1 / 1 个素材');
  assert.equal(ui.get('#picker-message').hidden, true);
  assert.equal(warning.mock.callCount(), 1);
});

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

async function setup(context, { fetch, image = () => true, resolveCategory, filterCategory, canOpen } = {}) {
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
    resolveCategory, filterCategory, canOpen,
  });
  return { ...dom, id, state, calls, storage, requests,
    open: id => picker.open(controls.find(control => control.id === id)),
    close: () => picker.close(),
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


test('versioned category group index preserves counts, filtering and region separation', async context => {
  const ui = await setup(context, { resolveCategory: async () => ({
    id: 'avatars',
    items: [
      { id: '1', name: 'JP One', file: 'avatars/1.png', group: '活动' },
      { id: '2', name: 'JP Two', file: 'avatars/2.png', group: '活动' },
      { id: '3', name: 'JP Three', file: 'avatars/3.png', group: '来源未分类' },
    ],
    groups: [{ label: '活动', ids: ['1', '2'], count: 2 }, { label: '来源未分类', ids: ['3'], count: 1 }],
  }) });
  ui.state.region = 'jp';
  await ui.open('avatar');
  const options = ui.get('#picker-filter').childNodes.map(option => option.textContent);
  assert.ok(options.includes('活动（2）'));
  assert.ok(options.includes('来源未分类（1）'));
  ui.get('#picker-filter').value = '活动';
  await ui.get('#picker-filter').emit('change');
  assert.equal(ui.items().length, 2);
  assert.equal(ui.get('#picker-meta').textContent, '找到 2 / 3 个素材');
  await ui.items()[0].emit('click');
  const selections = JSON.parse(ui.storage.get('maimai-diy-picker-selection-v1'));
  assert.equal(selections['jp:avatar'], '1');
  assert.equal(selections['cn:avatar'], undefined);
});


const regionalCategory = (region, count = 2) => ({
  id: 'avatars',
  items: Array.from({ length: count }, (_, index) => ({
    id: `${region}-${index + 1}`, name: `${region.toUpperCase()} ${index + 1}`,
    file: `avatars/${region}-${index + 1}.png`, group: region.toUpperCase(),
  })),
});

test('async visibility filtering finishes before items, groups or cached views are exposed', async context => {
  const started = deferred();
  const filtered = deferred();
  const category = regionalCategory('cn');
  category.groups = [{ label: 'CN', ids: ['cn-1', 'cn-2'], count: 2 }];
  const filters = [];
  const ui = await setup(context, {
    resolveCategory: () => category,
    filterCategory: (value, region, control) => {
      filters.push([value, region, control.id]);
      started.resolve();
      return filtered.promise;
    },
  });
  const pending = ui.open('avatar');
  await started.promise;
  assert.equal(ui.items().length, 0);
  assert.equal(ui.get('#picker-filter').childNodes.length, 1);
  filtered.resolve({ ...category, items: [category.items[0]],
    groups: [{ label: 'CN', ids: ['cn-1'], count: 1 }],
    visibilityMessage: '仅显示当前区域可用的素材。',
  });
  await pending;
  assert.deepEqual(filters, [[category, 'cn', 'avatar']]);
  assert.deepEqual(ui.items().map(item => item.dataset.assetId), ['cn-1']);
  assert.equal(ui.get('#picker-meta').textContent, '找到 1 / 1 个素材');
  assert.deepEqual(ui.get('#picker-filter').childNodes.map(option => option.textContent), ['全部分类', 'CN（1）']);
  assert.equal(ui.get('#picker-message').textContent, '仅显示当前区域可用的素材。');
  assert.equal(ui.get('#picker-message').hidden, false);
  ui.close();
  await ui.open('avatar');
  assert.deepEqual(ui.items().map(item => item.dataset.assetId), ['cn-1']);
  assert.equal(filters.length, 1);
  assert.equal(ui.get('#picker-message').hidden, false);
});

test('visibility filtering covers every legacy fallback including titles and badges', async context => {
  const category = id => ({ id, items: [1, 2].map(number => ({
    id: `${id}-${number}`, name: `素材 ${number}`, file: `${id}/${number}.png`, color: 'Normal',
  })) });
  const filters = [];
  const ui = await setup(context, {
    fetch: path => {
      if (path.endsWith('/titles.json')) return Response.json(category('titles'));
      if (path.endsWith('/badges.json')) return Response.json({ schemaVersion: 1,
        categories: ['ranks', 'friend-battles'].map(category),
      });
      return Response.json({ schemaVersion: 1, categories: ['avatars', 'backgrounds', 'nameplates'].map(category) });
    },
    filterCategory: async (value, region, control) => {
      filters.push([value.id, region, control.id]);
      return { ...value, items: value.items.filter(item => item.name === '素材 1') };
    },
  });
  for (const id of ['avatar', 'background', 'nameplate', 'title', 'rank', 'friendBattle']) {
    await ui.open(id);
    assert.equal(ui.items().length, 1);
    assert.equal(ui.get('#picker-meta').textContent, '找到 1 / 1 个素材');
    ui.close();
  }
  assert.deepEqual(filters, [
    ['avatars', 'cn', 'avatar'], ['backgrounds', 'cn', 'background'],
    ['nameplates', 'cn', 'nameplate'], ['titles', 'cn', 'title'],
    ['ranks', 'cn', 'rank'], ['friend-battles', 'cn', 'friendBattle'],
  ]);
});

test('filtered categories without a group index derive counts from remaining items', async context => {
  const category = regionalCategory('cn', 3);
  category.items[2].group = 'OTHER';
  category.groups = [{ label: 'CN', ids: ['cn-1', 'cn-2'], count: 2 }, { label: 'OTHER', ids: ['cn-3'], count: 1 }];
  const ui = await setup(context, {
    resolveCategory: () => category,
    filterCategory: value => {
      const result = { ...value, items: [value.items[0]] };
      delete result.groups;
      return result;
    },
  });
  await ui.open('avatar');
  assert.deepEqual(ui.get('#picker-filter').childNodes.map(option => option.textContent), ['全部分类', 'CN（1）']);
  ui.get('#picker-search').value = 'CN 2';
  await ui.get('#picker-search').emit('input');
  assert.equal(ui.items().length, 0);
  assert.equal(ui.get('#picker-meta').textContent, '找到 0 / 1 个素材');
});

test('empty or failed visibility filtering never exposes the unfiltered category', async context => {
  let failure = false;
  const ui = await setup(context, {
    resolveCategory: () => regionalCategory('cn'),
    filterCategory: async value => {
      if (failure) throw Error('visibility policy unavailable');
      return { ...value, items: [], visibilityMessage: '当前区域没有可用素材。' };
    },
  });
  await ui.open('avatar');
  assert.equal(ui.items().length, 0);
  assert.equal(ui.get('#picker-message').textContent, '当前区域没有可用素材。');
  ui.close();
  failure = true;
  await ui.open('avatar');
  assert.equal(ui.items().length, 0);
  assert.equal(ui.get('#picker-meta').textContent, '连接失败');
});

test('a pending image cannot select into a region that changed without closing the picker', async context => {
  const slow = deferred();
  const ui = await setup(context, { image: () => slow.promise });
  await ui.open('avatar');
  const pending = ui.items()[0].emit('click');
  ui.state.region = 'jp';
  const original = structuredClone(ui.state);
  slow.resolve(true);
  await pending;
  assert.deepEqual(ui.state, original);
  assert.deepEqual(ui.calls, { history: 0, render: 0, selected: 0 });
  assert.equal(ui.storage.has('maimai-diy-picker-selection-v1'), false);
});

test('a detached item from an old regional view cannot start a new selection', async context => {
  const ui = await setup(context, { resolveCategory: (_control, region) => regionalCategory(region) });
  await ui.open('avatar');
  const oldItem = ui.items()[0];
  ui.close();
  ui.state.region = 'jp';
  await ui.open('avatar');
  const original = structuredClone(ui.state);
  await oldItem.emit('click');
  assert.deepEqual(ui.state, original);
  assert.deepEqual(ui.calls, { history: 0, render: 0, selected: 0 });
  assert.deepEqual(ui.items().map(item => item.dataset.assetId), ['jp-1', 'jp-2']);
  assert.equal(ui.get('#asset-picker').open, true);
});

test('a deferred native close caches under the opened region, not the newly selected region', async context => {
  const requests = [];
  const ui = await setup(context, { resolveCategory: (_control, region) => {
    requests.push(region);
    return regionalCategory(region);
  } });
  await ui.open('avatar');
  const dialog = ui.get('#asset-picker');
  dialog.open = false; // The browser queues close after changing the open attribute.
  ui.state.region = 'jp';
  await dialog.emit('close');
  await ui.open('avatar');
  assert.deepEqual(ui.items().map(item => item.dataset.assetId), ['jp-1', 'jp-2']);
  ui.close();
  ui.state.region = 'cn';
  await ui.open('avatar');
  assert.deepEqual(ui.items().map(item => item.dataset.assetId), ['cn-1', 'cn-2']);
  assert.deepEqual(requests, ['cn', 'jp']);
});

test('opening before a deferred close retains both regional caches and ignores duplicate close events', async context => {
  const requests = [];
  const ui = await setup(context, { resolveCategory: (_control, region) => {
    requests.push(region);
    return regionalCategory(region);
  } });
  await ui.open('avatar');
  const dialog = ui.get('#asset-picker');
  dialog.open = false;
  ui.state.region = 'jp';
  await ui.open('avatar');
  await dialog.emit('close');
  assert.deepEqual(ui.items().map(item => item.dataset.assetId), ['jp-1', 'jp-2']);
  ui.close();
  await dialog.emit('close');
  ui.state.region = 'cn';
  await ui.open('avatar');
  assert.deepEqual(ui.items().map(item => item.dataset.assetId), ['cn-1', 'cn-2']);
  ui.close();
  ui.state.region = 'jp';
  await ui.open('avatar');
  assert.deepEqual(ui.items().map(item => item.dataset.assetId), ['jp-1', 'jp-2']);
  assert.deepEqual(requests, ['cn', 'jp']);
});

test('regional cached views retain independent search, pagination and selected items', async context => {
  const requests = [];
  const ui = await setup(context, { resolveCategory: (_control, region) => {
    requests.push(region);
    return regionalCategory(region, COS.pageSize + 3);
  } });
  await ui.open('avatar');
  await ui.get('#picker-more').emit('click');
  const cnItems = [...ui.items()];
  await cnItems[COS.pageSize].emit('click');
  ui.state.region = 'jp';
  await ui.open('avatar');
  assert.equal(ui.items().length, COS.pageSize);
  ui.get('#picker-search').value = 'JP 2';
  await ui.get('#picker-search').emit('input');
  ui.get('#picker-filter').value = 'JP';
  await ui.get('#picker-filter').emit('change');
  const jpItems = [...ui.items()];
  await jpItems[0].emit('click');
  ui.state.region = 'cn';
  await ui.open('avatar');
  assert.deepEqual(ui.items(), cnItems);
  assert.equal(ui.get('#picker-search').value, '');
  assert.equal(ui.get('#picker-filter').value, '');
  assert.equal(ui.get('#picker-more').hidden, true);
  assert.equal(ui.items()[COS.pageSize].classes.has('is-selected'), true);
  ui.close();
  ui.state.region = 'jp';
  await ui.open('avatar');
  assert.deepEqual(ui.items(), jpItems);
  assert.equal(ui.get('#picker-search').value, 'JP 2');
  assert.equal(ui.get('#picker-filter').value, 'JP');
  assert.equal(ui.items()[0].classes.has('is-selected'), true);
  assert.deepEqual(JSON.parse(ui.storage.get('maimai-diy-picker-selection-v1')), {
    'cn:avatar': `cn-${COS.pageSize + 1}`, 'jp:avatar': 'jp-2',
  });
  assert.deepEqual(requests, ['cn', 'jp']);
});

test('a delayed visibility result cannot replace or cache a newer regional library', async context => {
  const slow = deferred();
  const started = deferred();
  const filteredRegions = [];
  const ui = await setup(context, {
    resolveCategory: (_control, region) => regionalCategory(region),
    filterCategory: async (value, region) => {
      filteredRegions.push(region);
      if (region === 'cn' && filteredRegions.length === 1) {
        started.resolve();
        await slow.promise;
      }
      return value;
    },
  });
  const pending = ui.open('avatar');
  await started.promise;
  ui.close();
  ui.state.region = 'jp';
  await ui.open('avatar');
  slow.resolve();
  await pending;
  assert.deepEqual(ui.items().map(item => item.dataset.assetId), ['jp-1', 'jp-2']);
  ui.close();
  ui.state.region = 'cn';
  await ui.open('avatar');
  assert.deepEqual(ui.items().map(item => item.dataset.assetId), ['cn-1', 'cn-2']);
  assert.deepEqual(filteredRegions, ['cn', 'jp', 'cn']);
});

test('a delayed regional category cannot overwrite a newer region or be cached for it', async context => {
  const slow = deferred();
  let first = true;
  const requests = [];
  const ui = await setup(context, { resolveCategory: async (_control, region) => {
    requests.push(region);
    if (region === 'cn' && first) {
      first = false;
      await slow.promise;
    }
    return regionalCategory(region);
  } });
  const pending = ui.open('avatar');
  ui.close();
  ui.state.region = 'jp';
  await ui.open('avatar');
  slow.resolve();
  await pending;
  assert.deepEqual(ui.items().map(item => item.dataset.assetId), ['jp-1', 'jp-2']);
  ui.close();
  ui.state.region = 'cn';
  await ui.open('avatar');
  assert.deepEqual(ui.items().map(item => item.dataset.assetId), ['cn-1', 'cn-2']);
  assert.deepEqual(requests, ['cn', 'jp', 'cn']);
});

test('region-transition gate blocks both fresh and cached lists and stale selection commits', async context => {
  let ready = false;
  const slow = deferred();
  const ui = await setup(context, { canOpen: () => ready, image: () => slow.promise });
  await ui.open('avatar');
  assert.equal(ui.get('#asset-picker').open, false);
  assert.equal(ui.requests.length, 0);
  ready = true;
  await ui.open('avatar');
  const original = structuredClone(ui.state);
  const pending = ui.items()[0].emit('click');
  ready = false;
  slow.resolve(true);
  await pending;
  assert.deepEqual(ui.state, original);
  assert.equal(ui.calls.history, 0);
  await ui.close();
  await ui.open('avatar');
  assert.equal(ui.get('#asset-picker').open, false);
  ready = true;
  await ui.open('avatar');
  assert.equal(ui.get('#asset-picker').open, true);
  assert.equal(ui.items().length, 2);
});

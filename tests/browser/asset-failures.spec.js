import { test, expect } from '@playwright/test';

// Exercise failures deterministically, without relying on the live COS account.
test.use({ serviceWorkers: 'block' });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64');
const host = 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com';
const entry = (category, id) => ({ id: `${category}/${id}`, name: id, file: `${category}/${id}.png` });
const manifest = {
  schemaVersion: 1,
  categories: [{ id: 'avatars', items: ['first', 'second'].map(id => entry('avatars', id)) }],
};
const badges = {
  schemaVersion: 1,
  categories: ['ranks', 'friend-battles'].map(id => ({ id, items: [entry(id, 'test')] })),
};
const titles = { schemaVersion: 1, items: [{ name: '测试称号', color: 'Silver' }] };
const library = (page, id) => page.locator(`[data-control="${id}"] .library-button`);
const item = (page, id) => page.locator(`[data-asset-id="${id}"]`);
const savedState = page => page.evaluate(() => JSON.parse(localStorage.getItem('maimai-diy-current-design-v1')).state);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function setup(page, context, handle) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.origin !== host) return route.abort();
    const response = await handle?.(url.pathname, route);
    if (response === 'handled') return;
    const json = {
      '/materials/manifest.json': manifest,
      '/materials/badges.json': badges,
      '/materials/titles.json': titles,
      '/materials/recommendations.json': { version: 1, items: [] },
    }[url.pathname];
    await route.fulfill(response || (json
      ? { json, headers: { 'access-control-allow-origin': '*' } }
      : url.pathname.endsWith('.png')
        ? { body: png, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }
        : { status: 404, body: 'Not found', headers: { 'access-control-allow-origin': '*' } }));
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loading')).toBeHidden();
}

test('a failed main index does not block independent title and badge libraries', async ({ page, context }) => {
  let mainRequests = 0;
  await setup(page, context, path => {
    if (path === '/materials/manifest.json') {
      mainRequests++;
      return { status: 451, body: 'Unavailable', headers: { 'access-control-allow-origin': '*' } };
    }
  });
  await expect(page.locator('#asset-status')).toContainText('部分云端图片可能无法加载');
  expect(mainRequests).toBe(1);
  for (const [control, assetId] of [['title', '测试称号'], ['rank', 'ranks/test'], ['friendBattle', 'friend-battles/test']]) {
    await library(page, control).click();
    await expect(item(page, assetId)).toBeVisible();
    await page.locator('#picker-close').click();
  }
  expect(mainRequests).toBe(1);
});

test('failed selection preserves design and history, then the same item can be retried', async ({ page, context }) => {
  let unavailable = true;
  await setup(page, context, path => path === '/materials/avatars/first.png' && unavailable
    ? { status: 503, body: 'Unavailable', headers: { 'access-control-allow-origin': '*' } }
    : undefined);
  const original = await savedState(page);
  await library(page, 'avatar').click();
  await item(page, 'avatars/first').click();
  await expect(page.locator('#picker-message')).toContainText('已保留原搭配');
  await expect(page.locator('#asset-picker')).toBeVisible();
  await expect(page.locator('#undo')).toBeDisabled();
  expect(await savedState(page)).toEqual(original);
  expect(await page.evaluate(() => localStorage.getItem('maimai-diy-picker-selection-v1'))).toBeNull();
  unavailable = false;
  await item(page, 'avatars/first').click();
  await expect(page.locator('#asset-picker')).toBeHidden();
  expect((await savedState(page)).files.avatar).toBe(`${host}/materials/avatars/first.png`);
  await expect(page.locator('#undo')).toBeEnabled();
  await page.locator('#undo').click();
  expect(await savedState(page)).toEqual(original);
});

test('title selection also validates its frame before changing the title', async ({ page, context }) => {
  await setup(page, context, path => path.endsWith('/UI_CMN_Shougou_Silver.png')
    ? { status: 404, body: 'Not found', headers: { 'access-control-allow-origin': '*' } }
    : undefined);
  const original = await savedState(page);
  await library(page, 'title').click();
  await item(page, '测试称号').click();
  await expect(page.locator('#picker-message')).toContainText('已保留原搭配');
  expect(await savedState(page)).toEqual(original);
  await expect(page.locator('#undo')).toBeDisabled();
});

test('a newer selection wins over an earlier slow image', async ({ page, context }) => {
  const slow = deferred();
  await setup(page, context, async path => {
    if (path === '/materials/avatars/first.png') await slow.promise;
  });
  await library(page, 'avatar').click();
  await item(page, 'avatars/first').click();
  await expect(item(page, 'avatars/first')).toBeDisabled();
  await item(page, 'avatars/second').click();
  await expect(page.locator('#asset-picker')).toBeHidden();
  const selected = await savedState(page);
  expect(selected.files.avatar).toBe(`${host}/materials/avatars/second.png`);
  slow.resolve();
  await library(page, 'avatar').click();
  await expect(item(page, 'avatars/first')).toBeEnabled();
  expect(await savedState(page)).toEqual(selected);
});

for (const dismiss of ['close', 'escape']) {
  test(`${dismiss} and reopening another library cancels a pending selection`, async ({ page, context }) => {
    const slow = deferred();
    await setup(page, context, async path => {
      if (path === '/materials/avatars/first.png') await slow.promise;
    });
    const original = await savedState(page);
    await library(page, 'avatar').click();
    await item(page, 'avatars/first').click();
    if (dismiss === 'close') await page.locator('#picker-close').click();
    else await page.keyboard.press('Escape');
    await library(page, 'title').click();
    await expect(item(page, '测试称号')).toBeVisible();
    slow.resolve();
    await page.evaluate(async () => {
      // Drain the actual image promise, rather than relying on an arbitrary delay.
      const script = [...document.scripts].find(node => node.src.includes('/app.js'));
      const version = new URL(script.src).search;
      const { loadImage } = await import(`./src/assets.js${version}`);
      await loadImage('https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com/materials/avatars/first.png');
    });
    await expect(page.locator('#asset-picker')).toBeVisible();
    await expect(page.locator('#picker-title')).toHaveText('选择称号');
    expect(await savedState(page)).toEqual(original);
    await expect(page.locator('#undo')).toBeDisabled();
  });
}

test('a late failure from a dismissed library cannot overwrite a newer library', async ({ page, context }) => {
  let failMain = false;
  const slow = deferred();
  await setup(page, context, async path => {
    if (path !== '/materials/manifest.json') return;
    if (!failMain) return { status: 404, body: 'Not found', headers: { 'access-control-allow-origin': '*' } };
    await slow.promise;
    return { status: 404, body: 'Not found', headers: { 'access-control-allow-origin': '*' } };
  });
  failMain = true;
  await library(page, 'avatar').click();
  await page.locator('#picker-close').click();
  await library(page, 'title').click();
  await expect(item(page, '测试称号')).toBeVisible();
  slow.resolve();
  await page.evaluate(async () => {
    const script = [...document.scripts].find(node => node.src.includes('/app.js'));
    const version = new URL(script.src).search;
    const { loadManifest } = await import(`./src/assets.js${version}`);
    await loadManifest().catch(() => {});
  });
  await expect(page.locator('#picker-message')).toBeHidden();
  await expect(page.locator('#picker-meta')).toHaveText('找到 1 / 1 个素材');
});

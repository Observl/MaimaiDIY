import { createDefaultState } from '../../src/model.js';
import { REGION_BASE_URL, REGION_CATEGORIES } from '../../src/region-index.js';
import { buildRegionalIndex } from '../../tools/build-region-index.mjs';
import { test, expect } from '@playwright/test';

// Exercise failures deterministically, without relying on the live COS account.
test.use({ serviceWorkers: 'block' });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64');
const host = 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com';
const entry = (category, id) => ({ id: `${category}/${id}`, name: id, file: `${category}/${id}.png` });
const longAvatarName = '示例头像 · 相同系列名称用于核对完整版本编号 900002';
const manifest = {
  schemaVersion: 1,
  categories: [{ id: 'avatars', items: [entry('avatars', 'UI_Icon_900001'), {
    ...entry('avatars', 'UI_Icon_900002'), name: longAvatarName,
  }] }],
};
const badges = {
  schemaVersion: 1,
  categories: ['ranks', 'friend-battles'].map(id => ({ id, items: [entry(id, 'test')] })),
};
const titles = { schemaVersion: 1, items: [{ id: 'titles/900003', name: '测试称号', color: 'Silver' }] };
const visibility = {
  schemaVersion: 1, snapshotDate: '2026-11-08', sources: [],
  cnReleased: { frames: {}, plates: {}, icons: {}, titles: {} },
  cnReviewed: { icons: ['900001', '900002'], titles: ['900003'] },
  jpIdentified: { frames: [], plates: [], icons: [], charas: [] },
};
const savedState = page => page.evaluate(() => JSON.parse(localStorage.getItem('maimai-diy-region-current-design-v1')).state);
async function setup(page, context, handle) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') {
      if (url.pathname === '/data/regions/visibility-20261108.json') return route.fulfill({ json: visibility });
      if (/^\/cos-(?:local|index)\//.test(url.pathname)) return route.fulfill({ status: 404 });
      return route.continue();
    }
    if (url.origin !== host) return route.abort();
    if (url.pathname.startsWith('/materials/regions/companion-supplements/20261124/'))
      return route.fulfill({ body: png, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } });
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
  await page.locator('.controls-summary').click();
}

test('preview companion slots edit settings and exclude their artwork from glitter', async ({ page, context }) => {
  const ids = ['000101','000102','000103','000104','000105'];
  const catalogs = Object.fromEntries(['cn','jp'].map(region => [region, {
    schemaVersion:1, region, version:'test', generatedAt:'2026-11-08T00:00:00Z', sources:[], availability:{art:'test'},
    ...Object.fromEntries(REGION_CATEGORIES.map(category => [category, []])),
  }]));
  const {files}=buildRegionalIndex({catalogs});
  const prefix=new URL(REGION_BASE_URL).pathname;
  await page.addInitScript(state => localStorage.setItem('maimai-diy-region-current-design-v1',JSON.stringify({version:1,state})),{
    ...createDefaultState('cn'),screenMode:'companions',companions:ids.map(id=>({id,level:9999,awakened:true})),
  });
  await setup(page, context, path => {
    const body=path.startsWith(prefix)&&files.get(path.slice(prefix.length));
    if(body)return {body,contentType:'application/json',headers:{'access-control-allow-origin':'*'}};
    if(path.endsWith('.webp'))return {body:png,contentType:'image/png',headers:{'access-control-allow-origin':'*'}};
  });
  await page.locator('#preview-mode').click();
  const hotspots = page.locator('[data-companion-slot]:visible');
  await expect(hotspots).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    await hotspots.nth(index).click();
    const settings = page.locator('#picker-companion-settings');
    await expect(settings).toBeVisible();
    const level = settings.locator('input[type=number]');
    await level.fill(String(100 + index)); await level.press('Tab');
    await expect.poll(async () => (await savedState(page)).companions[index].level).toBe(100 + index);
    const awake = settings.locator('input[type=checkbox]');
    await awake.uncheck();
    await expect.poll(async () => Boolean((await savedState(page)).companions[index].awakened)).toBe(false);
    await page.keyboard.press('Escape');
    await expect(page.locator('#loading')).toBeHidden();
  }
  await hotspots.nth(1).click();
  await page.locator('#picker-search').fill('100104');
  await page.locator('[data-asset-id="100104"]').click();
  await expect.poll(async () => (await savedState(page)).companions[1].id).toBe('100104');
  await expect(page.locator('#picker-companion-settings input[type=number]')).toHaveValue('101');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { createCollectibleMasks } = await import('/src/collectible-masks.js');
    const { prepareRegionalDisplay } = await import('/src/regional-display.js');
    const state = JSON.parse(localStorage.getItem('maimai-diy-region-current-design-v1')).state;
    const canvas = document.createElement('canvas'); canvas.width=1080; canvas.height=452;
    canvas.width=2160; canvas.height=904;
    const context=canvas.getContext('2d');context.imageSmoothingQuality='high';context.scale(2,2);
    (await prepareRegionalDisplay(state)).draw(context);
    const masks=await createCollectibleMasks(state);
    const art=canvas.getContext('2d').getImageData(0,0,2160,904).data;
    const mask=masks.componentCoverage.getContext('2d').getImageData(0,0,2160,904).data;
    let covered=0, leaks=0, transparent=0;
    for(let i=3;i<art.length;i+=4) {
      if(art[i]===255){ covered++; if(mask[i]!==255)leaks++; }
      if(art[i]===0 && mask[i]===0)transparent++;
    }
    return {covered,leaks,transparent};
  });
  expect(result.covered).toBeGreaterThan(10000);
  expect(result.leaks).toBe(0);
  expect(result.transparent).toBeGreaterThan(10000);
});

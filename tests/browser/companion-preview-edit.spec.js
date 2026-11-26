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

async function setupCompanionDesign(page, context, { region = 'cn', filled = 5 } = {}) {
  const ids = ['000101', '000102', '000103', '000104', '000105'];
  const catalogs = Object.fromEntries(['cn', 'jp'].map(key => [key, {
    schemaVersion: 1, region: key, version: 'test', generatedAt: '2026-11-08T00:00:00Z', sources: [], availability: { art: 'test' },
    ...Object.fromEntries(REGION_CATEGORIES.map(category => [category, []])),
  }]));
  catalogs.jp.charas = ids.map(id => ({
    id, name: id, image: REGION_BASE_URL + 'jp/collection/charas/UI_Chara_' + id + '.png',
  }));
  const { files } = buildRegionalIndex({ catalogs });
  const prefix = new URL(REGION_BASE_URL).pathname;
  await page.route('**/data/regions/visibility-20261108.json', route => route.fulfill({
    json: { ...visibility, jpIdentified: { ...visibility.jpIdentified, charas: ids } },
  }));
  await page.addInitScript(state => localStorage.setItem('maimai-diy-region-current-design-v1', JSON.stringify({ version: 1, state })), {
    ...createDefaultState(region), screenMode: 'companions', companions: ids.slice(0, filled).map(id => ({ id, level: 9999, awakened: true })),
  });
  await setup(page, context, path => {
    const body = path.startsWith(prefix) && files.get(path.slice(prefix.length));
    if (body) return { body, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } };
    if (path.endsWith('.webp')) return { body: png, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } };
  });
  return ids;
}

for (const region of ['cn', 'jp']) {
  test(`${region} all member level digits share the first member's spacing and baseline`, async ({ page, context }) => {
    await setupCompanionDesign(page, context, { region });
    const renders = await page.evaluate(async () => {
      const { prepareRegionalDisplay } = await import('/src/regional-display.js');
      const state = JSON.parse(localStorage.getItem('maimai-diy-region-current-design-v1')).state;
      const results = [];
      for (const level of [1, 10, 100, 1000, 1111, 1234, 9999]) {
        for (const awakened of [false, true]) {
          const design = { ...state, companions: state.companions.map(member => ({ ...member, level, awakened })) };
          const display = await prepareRegionalDisplay(design);
          const transforms = [];
          display.draw({ drawImage() {}, save() {}, restore() {}, transform(...matrix) { transforms.push(matrix); } });
          results.push({ level, awakened, transforms });
        }
      }
      return results;
    });
    for (const { level, awakened, transforms } of renders) {
      const digits = String(level).length;
      expect(transforms).toHaveLength(digits * 5);
      const reference = transforms.slice(digits, digits * 2);
      for (let slot = 2; slot < 5; slot++) {
        const actual = transforms.slice(slot * digits, (slot + 1) * digits);
        // The final digit anchors the run; every preceding glyph must translate identically.
        const dx = actual.at(-1)[4] - reference.at(-1)[4];
        const dy = actual.at(-1)[5] - reference.at(-1)[5];
        for (let digit = 0; digit < digits; digit++) {
          const label = `${region} slot ${slot} level ${level} awakened ${awakened} digit ${digit}`;
          for (let axis = 0; axis < 4; axis++) expect(actual[digit][axis], label).toBeCloseTo(reference[digit][axis], 6);
          expect(actual[digit][4] - reference[digit][4], label).toBeCloseTo(dx, 6);
          expect(actual[digit][5] - reference[digit][5], label).toBeCloseTo(dy, 6);
        }
      }
    }
  });
}

test.describe('mobile companion touch targets', () => {
  test.use({ hasTouch: true });
  for (const region of ['cn', 'jp']) {
    test(`${region} all five selected companions can be tapped and replaced on phones`, async ({ page, context }) => {
      const ids = await setupCompanionDesign(page, context, { region });
      await page.locator('#preview-mode').click();
      for (const width of [320, 375, 390, 414]) {
        await page.setViewportSize({ width, height: 900 });
        for (let index = 0; index < 5; index++) {
          await page.locator(`[data-companion-slot="${index}"]`).tap();
          await expect(page.locator('#picker-title')).toHaveText(`选择旅行伙伴 ${index + 1}`);
          await page.locator('#picker-search').fill(ids[index]);
          await page.locator(`[data-asset-id="${ids[index]}"]`).tap();
          await expect(page.locator('.companion-editor')).toBeVisible();
          await expect(page.locator('.companion-editor input[type=number]')).toHaveAttribute('aria-label', `旅行伙伴 ${index + 1} 等级`);
          await page.locator('.companion-editor [aria-label="关闭旅行伙伴设置"]').tap();
          await expect(page.locator('#loading')).toBeHidden();
        }
      }
    });
    for (const filled of [0, 2]) {
      test(`${region} later empty slots remain tappable with ${filled} selected companions`, async ({ page, context }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        const ids = await setupCompanionDesign(page, context, { region, filled });
        await page.locator('#preview-mode').tap();
        expect(await page.locator('[data-companion-slot]:visible').count()).toBe(5);
        for (let index = 0; index < 5; index++) await expect(page.locator(`[data-companion-picker="${index}"]`)).toBeEnabled();
        await page.locator('[data-companion-slot="4"]').tap();
        await expect(page.locator('#asset-picker')).toBeVisible();
        await page.locator('#picker-search').fill(ids[4]);
        await page.locator(`[data-asset-id="${ids[4]}"]`).tap();
        await expect(page.locator('.companion-editor')).toBeVisible();
        await expect.poll(async () => (await savedState(page)).companions.map(member => member?.id)).toEqual([...ids.slice(0, filled), ids[4]]);
        await page.locator('.companion-editor [aria-label="关闭旅行伙伴设置"]').tap();
        await page.locator('[data-companion-picker="3"]').tap();
        await expect(page.locator('#asset-picker')).toBeVisible();
        await page.locator('#picker-search').fill(ids[3]);
        await page.locator(`[data-asset-id="${ids[3]}"]`).tap();
        await expect(page.locator('.companion-editor')).toBeVisible();
        await expect.poll(async () => (await savedState(page)).companions.map(member => member?.id)).toEqual([...ids.slice(0, filled), ids[4], ids[3]]);
        await page.locator('.companion-editor [aria-label="关闭旅行伙伴设置"]').tap();
        await expect(page.locator('#loading')).toBeHidden();
        await expect(page.locator('#regional-display-error')).toHaveText('');
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      });
    }
  }
});

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
    const id = (await savedState(page)).companions[index].id;
    await page.locator('#picker-search').fill(id);
    await page.locator(`[data-asset-id="${id}"]`).click();
    const settings = page.locator('.companion-editor');
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
  await expect(page.locator('.companion-editor input[type=number]')).toHaveValue('101');
  await expect(page.locator('.companion-editor [role=status]')).toHaveText('');
  await expect.poll(() => page.locator('.companion-editor canvas').evaluate(canvas => canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>0))).toBe(true);
  await page.setViewportSize({width:375,height:812});
  await expect.poll(() => page.locator('.companion-editor').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'output/companion-modal-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'output/companion-modal-desktop.png'});
  await page.keyboard.press('Escape');
  await expect(page.locator('#region-beta')).toHaveCount(0);
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

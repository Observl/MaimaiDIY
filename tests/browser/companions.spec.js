import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDefaultState } from '../../src/model.js';
import { CURRENT_DESIGN_KEY } from '../../src/current-design.js';
import { REGION_BASE_URL, REGION_CATEGORIES } from '../../src/region-index.js';
import { buildRegionalIndex } from '../../tools/build-region-index.mjs';

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
const item = (page, id) => page.locator(`[data-asset-id="${id}"]`);
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

test('both regional companions use confirmed character frames and match downloaded PNG', async ({ page, context }) => {
  const ids = ['100104', '100301', '000101', '000102', '000103', '000104', '000105'];
  const catalogs = Object.fromEntries(['cn', 'jp'].map(region => [region, {
    schemaVersion: 1, region, version: 'test', generatedAt: '2026-11-08T00:00:00Z', sources: [],
    availability: { art: 'test' },
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
  await page.route('**/regional-display/charas/*.webp', route => route.fulfill({ body: png, contentType: 'image/png' }));
  await page.addInitScript(({ key, designs }) => {
    for (const state of designs) localStorage.setItem(key + ':' + state.region, JSON.stringify({ version: 1, state }));
    localStorage.setItem(key, JSON.stringify({ version: 1, state: designs[0] }));
  }, {
    key: CURRENT_DESIGN_KEY,
    designs: ['cn', 'jp'].map(region => ({
      ...createDefaultState(region), region, screenMode: 'companions',
      companions: ids.slice(2).map(id => ({ id, level: 1, awakened: false })),
    })),
  });
  await setup(page, context, path => {
    const body = path.startsWith(prefix) && files.get(path.slice(prefix.length));
    if (body) return { body, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } };
    if (path.endsWith('.webp')) return { body: png, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } };
  });
  const pick = async (slot, id) => {
    await page.locator(`[data-companion-picker="${slot}"]`).click();
    await page.locator('#picker-search').fill(id);
    await item(page, id).click();
    await expect.poll(async () => (await savedState(page)).companions[slot].id).toBe(id);
    await page.keyboard.press('Escape');
    await expect(page.locator('#loading')).toBeHidden();
  };
  const sample = (boxes) => page.locator('#preview').evaluate((canvas, areas) => {
    const ctx = canvas.getContext('2d');
    return areas.map(area => Array.from(ctx.getImageData(...area).data).join(','));
  }, boxes);
  const compareDownload = async () => {
    const large = page.locator('#large-preview');
    await page.locator('#preview').press('Enter');
    await expect(large).toBeVisible();
    const preview = await large.locator('canvas').evaluate(canvas => canvas.toDataURL());
    await large.getByRole('button', { name: '关闭预览' }).click();
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出高清 PNG' }).click();
    const download = await waiting;
    const exported = await readFile(await download.path());
    expect('data:image/png;base64,' + exported.toString('base64') === preview).toBe(true);
  };
  for (const region of ['cn', 'jp']) {
    if (region === 'jp') await page.getByRole('button', { name: '切换区服展示板' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-region', region);
    await expect(page.locator('#loading')).toBeHidden();
    const leaderLayers = [[45, 371, 45, 26], [44, 405, 120, 36]];
    const memberLayers = [[215, 218, 16, 92], [217, 189, 105, 23], [224, 400, 113, 42]];
    const beforeLeader = await sample(leaderLayers);
    await pick(0, '100104');
    const afterLeader = await sample(leaderLayers);
    afterLeader.forEach((pixels, index) => expect(pixels !== beforeLeader[index]).toBe(true));
    const beforeMember = await sample(memberLayers);
    await pick(1, '100301');
    const afterMember = await sample(memberLayers);
    afterMember.forEach((pixels, index) => expect(pixels !== beforeMember[index]).toBe(true));
    const levelFrames = await page.evaluate(async design => {
      const { createRenderer } = await import('/src/renderer.js');
      const results = [];
      for (const awakened of [false, true]) for (const level of [1, 9, 10, 99, 100, 999, 1000, 9999]) {
        const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 452;
        await createRenderer(canvas).render({ ...design, companions: design.companions.map(member => ({ ...member, level, awakened })) }, { strict: true });
        const ctx = canvas.getContext('2d');
        results.push([[80, 371, 60, 3], ...[215, 354, 493, 633].map(x => [x, 240, 6, 70]), [70, 250, 25, 60]]
          .map(box => Array.from(ctx.getImageData(...box).data).join(',')));
      }
      return results;
    }, await savedState(page));
    for (let slot = 0; slot < 5; slot++) {
      expect(levelFrames[1][slot]).toBe(levelFrames[0][slot]);
      expect(levelFrames[2][slot]).not.toBe(levelFrames[1][slot]);
      expect(levelFrames[3][slot]).toBe(levelFrames[2][slot]);
      expect(levelFrames[4][slot]).not.toBe(levelFrames[3][slot]);
      expect(levelFrames[5][slot]).toBe(levelFrames[4][slot]);
      expect(levelFrames[6][slot]).not.toBe(levelFrames[5][slot]);
      expect(levelFrames[7][slot]).toBe(levelFrames[6][slot]);
      expect(levelFrames[8][slot]).not.toBe(levelFrames[0][slot]);
      for (let index = 9; index < 16; index++) expect(levelFrames[index][slot]).toBe(levelFrames[8][slot]);
    }
    for (const frame of levelFrames) expect(frame[5]).toBe(levelFrames[0][5]);
    const earnedStars = await page.evaluate(async design => {
      const { createRenderer } = await import('/src/renderer.js');
      const confirmed = await fetch('/regional-display/confirmed-companion-sets.json').then(response => response.json());
      const results = [];
      for (const level of [9, 10, 49, 50, 99, 100, 299, 300, 999, 1000, 9999]) {
        const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 452;
        await createRenderer(canvas).render({ ...design, companions: design.companions.map(member => ({ ...member, level })) }, { strict: true });
        const ctx = canvas.getContext('2d');
        results.push(confirmed.regions[design.region].map(slot => {
          let gold = 0;
          for (const rect of slot.starBounds) {
            const [x, y, width, height] = rect;
            const pixels = ctx.getImageData(Math.round(x + width * .4), Math.round(y + height * .4), Math.round(width * .2), Math.round(height * .2)).data;
            for (let i = 0; i < pixels.length; i += 4)
              if (pixels[i] > 160 && pixels[i + 1] > 100 && pixels[i + 2] < 100) gold++;
          }
          return gold;
        }));
      }
      return results;
    }, await savedState(page));
    for (let slot = 0; slot < 5; slot++) {
      for (const index of [1, 3, 5, 7, 9]) expect(earnedStars[index][slot]).toBeGreaterThan(earnedStars[index - 1][slot]);
      for (const index of [2, 4, 6, 8, 10]) expect(earnedStars[index][slot]).toBe(earnedStars[index - 1][slot]);
    }
    // Every PSD frame must retain the level caption in both display states.
    const captionCounts = await page.evaluate(async design => {
      const { createRenderer } = await import('/src/renderer.js');
      const areas = [[52, 382, 29, 14], [236, 197, 23, 11], [375, 197, 23, 11], [514, 197, 23, 11], [654, 197, 23, 11]];
      const results = [];
      for (const awakened of [false, true]) {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 452;
        await createRenderer(canvas).render({ ...design,
          companions: design.companions.map(member => ({ ...member, awakened })) }, { strict: true });
        results.push(areas.map(area => {
          const pixels = canvas.getContext('2d').getImageData(...area).data;
          let white = 0;
          for (let offset = 0; offset < pixels.length; offset += 4)
            if (pixels[offset] > 180 && pixels[offset + 1] > 180 && pixels[offset + 2] > 180) white++;
          return white;
        }));
      }
      return results;
    }, await savedState(page));
    for (const counts of captionCounts) for (const count of counts) expect(count, JSON.stringify({ region, captionCounts })).toBeGreaterThan(5);
    const relocatedBorder = await page.evaluate(async design => {
      const { createRenderer } = await import('/src/renderer.js');
      const render = async companions => {
        const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 452;
        await createRenderer(canvas).render({ ...design, companions }, { strict: true });
        return canvas;
      };
      const first = await render(design.companions);
      const companions = structuredClone(design.companions);
      [companions[1], companions[3]] = [companions[3], companions[1]];
      const moved = await render(companions);
      const sample = (canvas, x) => Array.from(canvas.getContext('2d').getImageData(x, 240, 6, 70).data);
      return { first: sample(first, 215), moved: sample(moved, 493) };
    }, await savedState(page));
    expect(relocatedBorder.moved).toEqual(relocatedBorder.first);
    const leaderLevel = page.getByRole('spinbutton', { name: '旅行伙伴 1 等级' });
    await leaderLevel.fill('9999');
    await leaderLevel.press('Tab');
    await expect.poll(async () => (await sample(leaderLayers))[1] !== afterLeader[1]).toBe(true);
    await compareDownload();
    const ordinaryStars = (await sample(leaderLayers))[1];
    await page.getByRole('checkbox', { name: '队长超觉醒' }).check();
    await expect(page.locator('#loading')).toBeHidden();
    expect((await sample(leaderLayers))[1] !== ordinaryStars).toBe(true);
    await compareDownload();
  }
});


test('JP characters without verified frame colors remain visible with accurate category counts', async ({ page, context }) => {
  const catalogs = Object.fromEntries(['cn', 'jp'].map(region => [region, {
    schemaVersion: 1, region, version: 'test', generatedAt: '2026-11-08T00:00:00Z', sources: [],
    availability: { art: 'test' }, ...Object.fromEntries(REGION_CATEGORIES.map(category => [category, []])),
  }]));
  catalogs.jp.charas = [
    { id: '000101', name: '已核实伙伴', group: '已核实区域', image: REGION_BASE_URL + 'jp/collection/charas/UI_Chara_000101.png' },
    { id: '999998', name: '待核实伙伴', group: '新区域', image: REGION_BASE_URL + 'jp/collection/charas/UI_Chara_999998.png' },
  ];
  const { files } = buildRegionalIndex({ catalogs });
  const prefix = new URL(REGION_BASE_URL).pathname;
  await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify({ version: 1, state })),
    { key: CURRENT_DESIGN_KEY, state: { ...createDefaultState('jp'), region: 'jp', screenMode: 'companions' } });
  await setup(page, context, path => {
    const body = path.startsWith(prefix) && files.get(path.slice(prefix.length));
    if (body) return { body, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } };
    if (path.endsWith('.webp')) return { body: png, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } };
  });
  await expect(page.locator('#regional-display-error')).toHaveText('');
  await page.getByRole('button', { name: '选择队长素材', exact: true }).click();
  await expect(item(page, '999998')).toBeVisible();
  await expect(item(page, '999998').locator('img')).toHaveJSProperty('naturalWidth', 1);
  await page.locator('#picker-filter').selectOption({ label: '新区域（1）' });
  await expect(item(page, '999998')).toBeVisible();
  await expect(item(page, '000101')).toHaveCount(0);
  await item(page, '999998').click();
  await expect(page.locator('#picker-message')).toContainText('边框配色尚未核实');
  expect((await savedState(page)).companions).toEqual([]);
});


test('a newly confirmed series character can be selected and rendered', async ({ page, context }) => {
  const catalogs = Object.fromEntries(['cn', 'jp'].map(region => [region, {
    schemaVersion: 1, region, version: 'test', generatedAt: '2026-11-08T00:00:00Z', sources: [],
    availability: { art: 'test' }, ...Object.fromEntries(REGION_CATEGORIES.map(category => [category, []])),
  }]));
  catalogs.jp.charas = [{ id: '450201', name: '黒楼十夜子', group: 'メトロポリスちほー8', image: REGION_BASE_URL + 'jp/collection/charas/UI_Chara_450201.png' }];
  const { files } = buildRegionalIndex({ catalogs });
  const prefix = new URL(REGION_BASE_URL).pathname;
  await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify({ version: 1, state })),
    { key: CURRENT_DESIGN_KEY, state: { ...createDefaultState('jp'), region: 'jp', screenMode: 'companions' } });
  await setup(page, context, path => {
    const body = path.startsWith(prefix) && files.get(path.slice(prefix.length));
    if (body) return { body, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } };
  });
  await page.getByRole('button', { name: '选择队长素材', exact: true }).click();
  await item(page, '450201').click();
  await expect.poll(async () => (await savedState(page)).companions[0]?.id).toBe('450201');
  await page.keyboard.press('Escape');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#regional-display-error')).toHaveText('');
});

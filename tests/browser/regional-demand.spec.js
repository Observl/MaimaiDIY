import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { REGION_BASE_URL, REGION_CATEGORIES } from '../../src/region-index.js';
import { buildRegionalIndex } from '../../tools/build-region-index.mjs';

// Real browser, deterministic data: this suite measures application requests,
// not COS uptime, image fidelity, or user-network latency.
test.use({ serviceWorkers: 'block' });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64');
const host = new URL(REGION_BASE_URL).origin;
const prefix = new URL(REGION_BASE_URL).pathname;
const categoryPaths = paths => paths.filter(path => /catalogs\/v2\/(?:cn|jp)\/(?:frames|plates|icons|charas|songs)\.json$/.test(path));
const catalogs = Object.fromEntries(['cn', 'jp'].map(region => [region, {
  schemaVersion: 1, region, version: 'test', generatedAt: '2026-11-08T00:00:00Z', sources: [],
  availability: { art: 'test' }, ...Object.fromEntries(REGION_CATEGORIES.map(category => [category, []])),
}]));
catalogs.jp.charas.push({ id: '000101', name: '测试伙伴', image: REGION_BASE_URL + 'jp/collection/charas/UI_Chara_000101.png' });
for (const region of ['cn', 'jp']) catalogs[region].songs.push({ id: '1:dx', musicId: 1, name: '测试歌曲',
  image: REGION_BASE_URL + 'shared/saltmeta/covers/000001.png', charts: [{ difficulty: 0, level: '3', version: null }] });
const { files } = buildRegionalIndex({ catalogs });
const visibility = { schemaVersion: 1, snapshotDate: '2026-11-08', sources: [],
  cnReleased: { frames: {}, plates: {}, icons: {}, titles: {} }, cnReviewed: { icons: [], titles: [] },
  jpIdentified: { frames: [], plates: [], icons: [], charas: ['000101'] } };

async function setup(page, context, intercept) {
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') {
      if (url.pathname === '/data/regions/visibility-20261108.json') return route.fulfill({ json: visibility });
      if (/^\/cos-(?:local|index)\//.test(url.pathname)) return route.fulfill({ status: 404 });
      return route.continue();
    }
    if (url.origin !== host) return route.abort();
    const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : null;
    const body = path && files.get(path);
    if (body) {
      requests.push(path);
      if (await intercept?.(path, route)) return;
      return route.fulfill({ body, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } });
    }
    const json = {
      '/materials/manifest.json': { schemaVersion: 1, categories: [] },
      '/materials/badges.json': { schemaVersion: 1, categories: [] },
      '/materials/titles.json': { schemaVersion: 1, items: [] },
      '/materials/recommendations.json': { version: 1, items: [] },
    }[url.pathname];
    return route.fulfill(json ? { json, headers: { 'access-control-allow-origin': '*' } }
      : /\.(png|webp)$/.test(url.pathname)
        ? { body: png, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }
        : { status: 404, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('.controls-summary').click();
  return { requests, errors };
}
async function switchRegion(page, region) {
  if (await page.locator('html').getAttribute('data-region') !== region)
    await page.locator('#region-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-region', region);
  await expect(page.locator('#region-select')).toBeEnabled();
}
async function mode(page, value) { await page.locator(`#screen-mode input[value="${value}"]`).check(); }
async function exported(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#template-export').click();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}

test('cold collection and mode changes fetch only demanded categories, once', async ({ page, context }, testInfo) => {
  const log = await setup(page, context);
  await switchRegion(page, 'jp');
  expect(categoryPaths(log.requests)).toEqual([]);
  await mode(page, 'companions');
  await expect(page.locator('#companion-controls .library-button').first()).toBeEnabled();
  expect(categoryPaths(log.requests)).toEqual(['catalogs/v2/jp/charas.json']);
  await mode(page, 'achievement');
  await expect.poll(() => categoryPaths(log.requests)).toEqual(['catalogs/v2/jp/charas.json', 'catalogs/v2/jp/songs.json']);
  await mode(page, 'companions');
  await expect(page.locator('#companion-controls .library-button').first()).toBeEnabled();
  expect(new Set(log.requests).size).toBe(log.requests.length);
  const bytes = log.requests.reduce((total, path) => total + files.get(path).length, 0);
  await testInfo.attach('requested-indexes', { body: JSON.stringify({ requests: log.requests, bytes }), contentType: 'application/json' });
  expect(log.errors).toEqual([]);
});

test('verified category cache survives hot reload without regional network requests', async ({ page, context }) => {
  const log = await setup(page, context);
  await switchRegion(page, 'jp');
  await mode(page, 'companions');
  await expect(page.locator('#companion-controls .library-button').first()).toBeEnabled();
  await page.locator('#companion-controls .library-button').first().click();
  await page.locator('[data-asset-id="000101"]').click();
  await expect(page.locator('#picker-message')).toContainText('已选择');
  await expect(page.locator('#companion-controls .control-file').first()).toHaveText('测试伙伴');
  await page.locator('#picker-close').click();
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('maimai-diy-region-current-design-v1'))))?.state.companions.length).toBe(1);
  const count = log.requests.length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#companion-controls .control-file').first()).toHaveText('测试伙伴');
  await expect(page.locator('#companion-controls .library-button').first()).toBeEnabled();
  expect(log.requests.slice(count)).toEqual([]);
  expect((await exported(page)).state.companions).toEqual([{ id: '000101', level: 1 }]);
  expect(log.errors).toEqual([]);
});

test('template import still validates a complete catalog and rejects unknown companions', async ({ page, context }) => {
  const log = await setup(page, context);
  await switchRegion(page, 'jp');
  const before = await exported(page);
  const invalid = structuredClone(before);
  invalid.name = 'INVALID ID';
  invalid.state.companions = [{ id: '999999', level: 1 }];
  await page.locator('#template-import').setInputFiles({ name: 'invalid.maimai.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await expect(page.locator('#template-status')).toContainText('旅行伙伴不属于');
  expect(categoryPaths(log.requests).sort()).toEqual(REGION_CATEGORIES.map(category => `catalogs/v2/jp/${category}.json`).sort());
  expect((await exported(page)).state).toEqual(before.state);
  expect(log.errors).toEqual([]);
});

test('denied region metadata preserves active region and does not request categories', async ({ page, context }) => {
  const log = await setup(page, context, async (path, route) => {
    if (path !== 'catalogs/v2/jp/index.json') return false;
    await route.fulfill({ status: 403, headers: { 'access-control-allow-origin': '*' } });
    return true;
  });
  const before = (await exported(page)).state;
  await page.locator('#region-toggle').click();
  await expect(page.locator('#region-status')).toContainText('当前搭配已保留');
  await expect(page.locator('#region-select')).toHaveValue('cn');
  await expect(page.locator('#region-select')).toBeEnabled();
  expect(categoryPaths(log.requests)).toEqual([]);
  expect((await exported(page)).state).toEqual(before);
  expect(log.errors).toEqual([]);
});

test('pending region switch cannot open a picker for the old region', async ({ page, context }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const log = await setup(page, context, async path => {
    if (path === 'catalogs/v2/jp/index.json') await gate;
    return false;
  });
  await page.locator('#region-toggle').click();
  try {
    await expect(page.locator('#region-select')).toBeDisabled();
    await page.locator('[data-control="avatar"] .library-button').click();
    await expect(page.locator('#asset-picker')).toBeHidden();
  } finally { release(); }
  await expect(page.locator('html')).toHaveAttribute('data-region', 'jp');
  await expect(page.locator('#region-select')).toBeEnabled();
  expect(categoryPaths(log.requests)).toEqual([]);
  expect(log.errors).toEqual([]);
});

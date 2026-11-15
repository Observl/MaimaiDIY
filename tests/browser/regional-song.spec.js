import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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

async function setupRegionalCatalogs(page, context) {
  const catalogs = Object.fromEntries(['cn', 'jp'].map(region => [region, {
    schemaVersion: 1, region, version: 'test', generatedAt: '2026-11-08T00:00:00Z', sources: [],
    availability: { art: 'test' },
    ...Object.fromEntries(REGION_CATEGORIES.map(category => [category, []])),
  }]));
  catalogs.jp.charas.push({ id: '000101', name: '测试伙伴',
    image: REGION_BASE_URL + 'jp/collection/charas/UI_Chara_000101.png' });
  const song = { id: '1:dx', musicId: 1, name: '测试歌曲',
    image: REGION_BASE_URL + 'shared/saltmeta/covers/000001.png',
    charts: [{ difficulty: 0, level: '3', version: null }, { difficulty: 1, level: '6+', version: null },
      { difficulty: 4, level: '13+', version: null }] };
  catalogs.jp.songs.push(song);
  catalogs.cn.songs.push(song);
  for (const catalog of Object.values(catalogs))
    catalog.songs.push({ ...song, id: '2:dx', musicId: 2, name: '替换歌曲',
      image: REGION_BASE_URL + 'shared/saltmeta/covers/000002.png' });
  for (const catalog of Object.values(catalogs)) {
    catalog.songs.push({ ...song, id: '1:sd', charts: [{ difficulty: 0, level: '4', version: null },
      { difficulty: 3, level: '12', version: null }] });
  }
  const { files } = buildRegionalIndex({ catalogs });
  const prefix = new URL(REGION_BASE_URL).pathname;
  await page.route('**/data/regions/visibility-20261108.json', route => route.fulfill({
    json: { ...visibility, jpIdentified: { ...visibility.jpIdentified, charas: ['000101'] } },
  }));
  await setup(page, context, path => {
    const body = path.startsWith(prefix) && files.get(path.slice(prefix.length));
    if (body) return { body, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } };
    if (path.endsWith('.webp')) return { body: png, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } };
  });
}

// WebP decoders can round RGB channels differently; alpha must remain opaque.
function expectFrameColor(actual, expected) {
  expect(actual).toHaveLength(4);
  for (let channel = 0; channel < 3; channel++)
    expect(Math.abs(actual[channel] - expected[channel])).toBeLessThanOrEqual(2);
  expect(actual[3]).toBe(255);
}

test('regional song module updates difficulty and score from the cover and exports', async ({ page, context }) => {
  await setupRegionalCatalogs(page, context);
  const mode = value => page.locator(`#screen-mode input[value="${value}"]`).check();
  const preview = () => page.locator('#preview').evaluate(canvas => canvas.toDataURL());
  const renderSavedOrderArtwork = async () => page.evaluate(async design => {
    const { createRenderer } = await import('/src/renderer.js');
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 452;
    await createRenderer(canvas).render(design, { strict: true });
    return canvas.toDataURL();
  }, await savedState(page));
  const songs = page.locator('#song-pick');
  for (const region of ['cn', 'jp']) {
    if (region === 'jp') await page.getByRole('button', { name: '切换区服展示板' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-region', region);
    await expect(page.locator('#magical-background')).toHaveCSS('opacity', region === 'cn' ? '0' : '1');
    await expect(page.locator('#loading')).toBeHidden();
    const collection = await preview();
    const largePreview = page.locator('#large-preview');
    const readLargePreview = async () => {
      await page.locator('#preview').press('Enter');
      await expect(largePreview).toBeVisible();
      const image = await largePreview.locator('canvas').evaluate(canvas => canvas.toDataURL());
      await largePreview.getByRole('button', { name: '关闭预览' }).click();
      return image;
    };
    await mode('achievement');
    await songs.click();
    await item(page, '1:sd').click();
    await expect(page.locator('#song-label')).toContainText('测试歌曲');
    await page.keyboard.press('Escape');
    await expect(songs).toBeFocused();
    await page.locator('#song-chart-type').selectOption('dx');
    await expect(page.locator('#song-difficulty option')).toHaveText(['BASIC', 'ADVANCED', 'Re:MASTER']);
    await expect.poll(preview).not.toBe(collection);
    const result = await preview();
    const readFramePixel = image => page.evaluate(async ({ image, x }) => {
      const bitmap = new Image();
      bitmap.src = image;
      await bitmap.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 452;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return [...ctx.getImageData(x, 189, 1, 1).data];
    }, { image, x: region === 'cn' ? 46 : 43 });
    expectFrameColor(await readFramePixel(await readLargePreview()), [69, 193, 36]);
    const advancedLabel = page.waitForResponse(response =>
      new URL(response.url()).pathname.endsWith(`/regional-display/${region}/level-label-1.webp`) && response.ok());
    await page.locator('#song-difficulty').selectOption('1');
    await advancedLabel;
    await expect.poll(preview).not.toBe(result);
    expectFrameColor(await readFramePixel(await readLargePreview()), [255, 186, 1]);
    const score = page.locator('#song-achievement');
    await score.fill('98.1234');
    await score.press('Tab');
    await score.fill('');
    await score.press('Tab');
    await expect(score).toHaveValue('98.1234');
    await songs.click();
    await expect(item(page, '1:sd')).toHaveAttribute('aria-pressed', 'true');
    await item(page, '1:sd').press('Enter');
    await expect(page.locator('#picker-message')).toHaveText('当前已选择「测试歌曲」。');
    await page.keyboard.press('Escape');
    await expect(page.locator('#song-difficulty')).toHaveValue('1');
    await expect(score).toHaveValue('98.1234');
    const refreshed = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === `/regional-display/${region}/base-1.webp` && url.searchParams.has('preview-refresh');
    });
    await page.getByRole('button', { name: '刷新预览' }).click();
    await refreshed;
    await expect(page.locator('#preview-refresh-status')).toHaveText('预览已刷新。');
    expect(await renderSavedOrderArtwork()).toBe(await preview());
    const previewMode = page.locator('#preview-mode');
    await previewMode.click();
    const songHotspot = page.getByRole('button', { name: '更换歌曲并填写达成率' });
    await songHotspot.click();
    await item(page, '2:dx').click();
    const scoreDialog = page.locator('#preview-value-dialog');
    await expect(scoreDialog).toBeVisible();
    await expect(page.locator('#song-label')).toContainText('替换歌曲');
    await expect(scoreDialog.locator('option')).toHaveText(['BASIC · Lv 3', 'ADVANCED · Lv 6+', 'Re:MASTER · Lv 13+']);
    await scoreDialog.locator('select').selectOption('1');
    await scoreDialog.locator('input').fill(region === 'cn' ? '99.1234' : '97.4321');
    await scoreDialog.locator('button[value="apply"]').click();
    await expect(score).toHaveValue(region === 'cn' ? '99.1234' : '97.4321');
    await expect(page.locator('#song-difficulty')).toHaveValue('1');
    await expect(songHotspot).toBeFocused();
    await previewMode.click();
    const reMasterFrame = page.waitForResponse(response =>
      response.url().endsWith(`/regional-display/${region}/cover-4.webp`) && response.ok());
    await page.locator('#song-difficulty').selectOption('4');
    await reMasterFrame;
    await score.fill(region === 'cn' ? '100.1000' : '101.0000');
    await score.press('Tab');
    await expect(page.locator('#loading')).toBeHidden();
    const reMasterPreview = await readLargePreview();
    expectFrameColor(await readFramePixel(reMasterPreview), [219, 170, 255]);
    const pngDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出高清 PNG' }).click();
    const reMasterExport = await pngDownload;
    expect('data:image/png;base64,' + (await readFile(await reMasterExport.path())).toString('base64') === reMasterPreview)
      .toBe(true);
  }
  await page.getByRole('button', { name: '切换区服展示板' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-region', 'cn');
  await expect(page.locator('#magical-background')).toHaveCSS('opacity', '0');
  await expect(page.locator('#song-achievement')).toHaveValue('100.1000');
  await expect(page.locator('#song-difficulty')).toHaveValue('4');
});


test('3D finish protects regional song artwork and leaves uncovered background eligible for glitter', async ({ page, context }) => {
  await setupRegionalCatalogs(page, context);
  const coverage = await page.evaluate(async () => {
    const { createCollectibleMasks } = await import('/src/collectible-masks.js');
    const { prepareRegionalDisplay } = await import('/src/regional-display.js');
    const { createDefaultState } = await import('/src/model.js');
    return Promise.all(['cn', 'jp'].map(async region => {
      const state = createDefaultState(region);
      state.visible = {};
      state.screenMode = 'achievement';
      state.song = { id: '1:dx', difficulty: 0, achievement: 100 };
      const [display, maps] = await Promise.all([
        prepareRegionalDisplay(state), createCollectibleMasks(state, undefined, {diagnostics:false}),
      ]);
      const { packed } = maps;
      const artwork = document.createElement('canvas');
      artwork.width = packed.width;
      artwork.height = packed.height;
      const context = artwork.getContext('2d', {willReadFrequently:true});
      context.imageSmoothingQuality = 'high';
      context.scale(2, 2);
      display.draw(context);
      const pixels = context.getImageData(0, 0, packed.width, packed.height).data;
      const mask = packed.getContext('2d').getImageData(0, 0, packed.width, packed.height).data;
      let covered = 0, uncovered = 0, mismatches = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3]) {
          covered++;
          if (mask[i + 2] !== 255 || mask[i] !== 0 || mask[i + 1] !== 0) mismatches++;
        } else {
          uncovered++;
          if (mask[i + 2] !== 0) mismatches++;
        }
      }
      return { region, covered, uncovered, mismatches, diagnostics: Boolean(maps.uv) };
    }));
  });
  for (const result of coverage) {
    expect(result.covered, result.region).toBeGreaterThan(100000);
    expect(result.uncovered, result.region).toBeGreaterThan(100000);
    expect(result.mismatches, result.region).toBe(0);
    expect(result.diagnostics, result.region).toBe(false);
  }
});

test('320px regional switching preserves usable dynamic companion controls', async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await setupRegionalCatalogs(page, context);
  const regionToggle = page.getByRole('button', { name: '切换区服展示板' });
  const firstRow = page.locator('#companion-controls .control-row').first();
  const noOverflow = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  };
  await expect(page.locator('html')).toHaveAttribute('data-region', 'cn');
  await page.locator('#screen-mode input[value="companions"]').check();
  await expect(firstRow.getByRole('button', { name: '素材库' })).toBeDisabled();
  await noOverflow();
  await regionToggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-region', 'jp');
  await page.locator('#screen-mode input[value="companions"]').check();
  await expect(page.locator('#companion-controls .control-row')).toHaveCount(5);
  await expect(firstRow.getByRole('button', { name: '素材库' })).toBeEnabled();
  for (const level of await page.locator('.companion-level').all()) {
    expect(await level.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect((await level.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  for (const button of await page.locator('#companion-controls button').all())
    expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await noOverflow();
  await firstRow.getByRole('button', { name: '素材库' }).click();
  await item(page, '000101').click();
  // Selection awaits image decoding; closing early intentionally cancels it.
  await expect(page.locator('#picker-message')).toHaveText('已选择：测试伙伴');
  await expect(item(page, '000101')).toHaveAttribute('aria-pressed', 'true');
  await expect(firstRow.locator('.control-file')).toHaveText('测试伙伴');
  await page.keyboard.press('Escape');
  await expect(page.locator('#asset-picker')).toBeHidden();
  await expect(firstRow.locator('.control-file')).toHaveText('测试伙伴');
  await firstRow.locator('.companion-level').fill('12');
  await firstRow.locator('.companion-level').press('Tab');
  await expect(firstRow.locator('.companion-level')).toHaveValue('12');
  await noOverflow();
  await regionToggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-region', 'cn');
  await page.locator('#screen-mode input[value="companions"]').check();
  await expect(firstRow.getByRole('button', { name: '素材库' })).toBeDisabled();
  await expect(firstRow.locator('.companion-level')).toBeDisabled();
  await noOverflow();
});


test('song library merges SD/DX and chart controls preserve independent difficulties and saves', async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await setupRegionalCatalogs(page, context);
  for (const region of ['cn', 'jp']) {
    if (region === 'jp') await page.getByRole('button', { name: '切换区服展示板' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-region', region);
    await page.locator('#screen-mode input[value="achievement"]').check();
    await page.locator('#song-pick').click();
    await page.locator('#picker-search').fill('测试歌曲');
    await expect(page.locator('#picker-grid [data-asset-id]')).toHaveCount(1);
    await item(page, '1:sd').click();
    await expect(page.locator('#song-label')).toContainText('测试歌曲');
    await page.keyboard.press('Escape');
    await expect(page.locator('#song-chart-type option')).toHaveText(['标准', 'DX']);
    await page.locator('#song-chart-type').selectOption('sd');
    await expect(page.locator('#song-difficulty option')).toHaveText(['BASIC', 'MASTER']);
    await page.locator('#song-difficulty').selectOption('3');
    await page.locator('#song-chart-type').selectOption('dx');
    await expect(page.locator('#song-difficulty option')).toHaveText(['BASIC', 'ADVANCED', 'Re:MASTER']);
    await expect(page.locator('#song-difficulty')).toHaveValue('0');
    await page.locator('#undo').click();
    await expect(page.locator('#song-chart-type')).toHaveValue('sd');
    await expect(page.locator('#song-difficulty')).toHaveValue('3');
    await page.locator('#redo').click();
    await expect(page.locator('#song-chart-type')).toHaveValue('dx');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('#song-difficulty').selectOption('4');
    await expect.poll(async () => (await savedState(page)).song.id).toBe('1:dx');
    await page.locator('#song-pick').click();
    await expect(item(page, '1:sd')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await page.locator('#song-controls').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`song-chart-type-${region}-320.png`) });
  }
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('.controls-summary').click();
  await expect(page.locator('#song-chart-type')).toHaveValue('dx');
  await expect(page.locator('#song-difficulty')).toHaveValue('4');
});

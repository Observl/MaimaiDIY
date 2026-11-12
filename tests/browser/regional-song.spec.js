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

test('regional song module updates difficulty and score from the cover and exports', async ({ page, context }) => {
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
    await item(page, '1:dx').click();
    await expect(page.locator('#song-label')).toContainText('测试歌曲');
    await expect(page.locator('#song-difficulty option')).toHaveText(['BASIC', 'ADVANCED', 'Re:MASTER']);
    await page.keyboard.press('Escape');
    await expect(songs).toBeFocused();
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
    expect(await readFramePixel(await readLargePreview())).toEqual([69, 193, 36, 255]);
    const advancedLabel = page.waitForResponse(response =>
      new URL(response.url()).pathname.endsWith(`/regional-display/${region}/level-label-1.webp`) && response.ok());
    await page.locator('#song-difficulty').selectOption('1');
    await advancedLabel;
    await expect.poll(preview).not.toBe(result);
    expect(await readFramePixel(await readLargePreview())).toEqual([255, 186, 1, 255]);
    const score = page.locator('#song-achievement');
    await score.fill('98.1234');
    await score.press('Tab');
    await score.fill('');
    await score.press('Tab');
    await expect(score).toHaveValue('98.1234');
    await songs.click();
    await expect(item(page, '1:dx')).toHaveAttribute('aria-pressed', 'true');
    await item(page, '1:dx').press('Enter');
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
    expect(await readFramePixel(reMasterPreview)).toEqual([219, 170, 255, 255]);
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

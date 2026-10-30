import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// COS allows the real site and the user's local port 4173. The isolated test
// server uses 4174: retain actual response bytes, adapting only its CORS header.
test.beforeEach(async ({ context }) => {
  await context.route('https://*.myqcloud.com/**', async (route) => {
    try {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'access-control-allow-origin': '*' },
      });
    } catch (error) {
      // Reloads cancel lazy thumbnail requests; those are not failed app operations.
      if (
        !route.request().failure() &&
        !/Test ended|Target .*closed|Route is already handled/.test(error.message)
      )
        throw error;
    }
  });
});

test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: 'ignoreErrors' });
});

const name = (page) => page.locator('[data-control="playerName"] .name-input');
const rating = (page) => page.locator('[data-control="rating"] .rating-input');
const library = (page, control = 'background') =>
  page.locator(`[data-control="${control}"] .library-button`);
async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
}
async function exportState(page) {
  const download = page.waitForEvent('download');
  await page.locator('#template-export').click();
  return JSON.parse(await readFile(await (await download).path(), 'utf8'));
}

test('default rendering, required controls, large preview and PNG export', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await expect(rating(page)).toHaveValue('16411');
  await expect(name(page)).toHaveValue('Observ.L');
  await expect(page.locator('.rating-input')).toHaveCount(1);
  await expect(page.locator('.name-input')).toHaveCount(1);
  await expect(page.locator('.file-input[accept="image/png,image/jpeg,image/webp"]')).toHaveCount(
    1
  );
  await page.locator('#preview').click();
  await expect(page.locator('#large-preview')).toBeVisible();
  await page.keyboard.press('Escape');
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  const png = await readFile(await (await download).path());
  expect(png.readUInt32BE(16)).toBe(2160);
  expect(png.readUInt32BE(20)).toBe(904);
  await testInfo.attach('default-export', { body: png, contentType: 'image/png' });
  // Compare decoded pixels against the previously published default, not PNG encoding.
  const actual = `data:image/png;base64,${png.toString('base64')}`;
  const reference = await readFile(
    process.platform === 'linux'
      ? 'tests/fixtures/default-linux.png'
      : 'docs/screenshots/composition-v1.2.0.png'
  );
  const expected = `data:image/png;base64,${reference.toString('base64')}`;
  const differences = await page.evaluate(
    async ({ src, expected }) => {
      const load = (src) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = src;
        });
      const [a, b] = await Promise.all([load(src), load(expected)]);
      const pixels = (image) => {
        const canvas = document.createElement('canvas');
        canvas.width = 2160;
        canvas.height = 904;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, 2160, 904).data;
      };
      const left = pixels(a),
        right = pixels(b);
      let different = 0,
        outsideText = 0,
        absolute = 0,
        maxError = 0;
      for (let index = 0; index < left.length; index++) {
        if (left[index] === right[index]) continue;
        const error = Math.abs(left[index] - right[index]);
        absolute += error;
        maxError = Math.max(maxError, error);
        different++;
        const pixel = Math.floor(index / 4),
          x = (pixel % 2160) / 2,
          y = Math.floor(pixel / 2160) / 2;
        const glyph =
          (x >= 142 && x <= 409 && y >= 65 && y <= 108) ||
          (x >= 225 && x <= 300 && y >= 35 && y <= 65) ||
          (x >= 141 && x <= 409 && y >= 110 && y <= 138);
        if (!glyph) outsideText++;
      }
      return { different, outsideText, meanAbsoluteError: absolute / left.length, maxError };
    },
    { src: actual, expected }
  );
  // OS-specific, visually reviewed goldens retain a strict comparison everywhere.
  if (differences.different) console.log('Pixel comparison:', JSON.stringify(differences));
  expect(differences.different).toBe(0);
  expect(errors).toEqual([]);
});

test('clear, capped history, redo and invalid name recovery', async ({ page }) => {
  await ready(page);
  await page.locator('#reset').click();
  await expect(name(page)).toHaveValue('GUEST');
  await expect(rating(page)).toHaveValue('0');
  await page.locator('#undo').click();
  await expect(rating(page)).toHaveValue('16411');
  for (let i = 0; i < 7; i++) {
    await rating(page).fill(String(14000 + i));
    await rating(page).blur();
  }
  for (let i = 0; i < 5; i++) await page.locator('#undo').click();
  await expect(page.locator('#undo')).toBeDisabled();
  await page.locator('#redo').click();
  await name(page).fill('123456789');
  await expect(name(page)).toHaveAttribute('aria-invalid', 'true');
  page.once('dialog', (dialog) => dialog.accept());
  await name(page).blur();
  await page.locator('#reset').click();
  await expect(name(page)).not.toHaveAttribute('aria-invalid');
});

test('named templates round trip, reject invalid imports without changing the editor', async ({
  page,
}) => {
  await ready(page);
  await name(page).fill('TEST');
  await name(page).blur();
  await rating(page).fill('12345');
  await rating(page).blur();
  await page.locator('#template-name').fill('回归模板');
  await page.locator('#template-save').click();
  const saved = await exportState(page);
  await page.locator('#reset').click();
  await page.locator('#template-load').click();
  await expect(name(page)).toHaveValue('TEST');
  await page.locator('#reset').click();
  const importFile = (data) =>
    page.locator('#template-import').setInputFiles({
      name: 'test.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await importFile(saved);
  await expect(page.locator('#template-status')).toContainText('已导入');
  await expect(rating(page)).toHaveValue('12345');
  await importFile({
    ...saved,
    state: { ...saved.state, files: { avatar: 'https://invalid.example/a.png' } },
  });
  await expect(page.locator('#template-status')).toContainText('导入失败');
  await expect(name(page)).toHaveValue('TEST');
  await page.locator('#template-delete').click();
  await expect(page.locator('#template-status')).toContainText('已删除');
});

test('picker reuse, refresh location, search and classification for every material', async ({
  page,
}) => {
  await ready(page);
  await library(page).click();
  await expect(page.locator('.asset-item')).toHaveCount(18);
  await page.locator('#picker-more').click();
  const choice = page.locator('.asset-item').nth(25);
  const selected = await choice.getAttribute('data-asset-id');
  await choice.click();
  await library(page).click();
  await expect(page.locator('.asset-item')).toHaveCount(36);
  await expect(page.locator('.is-selected')).toHaveAttribute('data-asset-id', selected);
  await page.locator('#picker-close').click();
  await ready(page);
  await library(page).click();
  await expect(page.locator('.asset-item')).toHaveCount(18);
  await expect(page.locator('.is-selected')).toHaveAttribute('data-asset-id', selected);
  await expect(page.locator('#picker-previous')).toBeVisible();
  await page.locator('#picker-search').fill('no-such-asset-xyz');
  await expect(page.locator('#picker-message')).toBeVisible();
  await page.locator('#picker-close').click();
  for (const control of ['avatar', 'nameplate', 'title', 'rank', 'friendBattle']) {
    await library(page, control).click();
    await expect(page.locator('.asset-item').first()).toBeVisible();
    expect(await page.locator('#picker-filter option').count()).toBeGreaterThan(1);
    await page.locator('.asset-item').first().click();
  }
  const state = await exportState(page);
  expect(state.state.visible.titleBase).toBe(true);
});

test('all author combinations preserve player information and remain undoable', async ({
  page,
}) => {
  await ready(page);
  await name(page).fill('MYNAME');
  await name(page).blur();
  await rating(page).fill('14567');
  await rating(page).blur();
  await page.locator('[data-control="rank"] .switch-wrap').click();
  await page.locator('[data-control="friendBattle"] .switch-wrap').click();
  const initial = (await exportState(page)).state;
  const protectedFields = (value) => ({
    playerName: value.playerName,
    ratingValue: value.ratingValue,
    rank: value.files.rank,
    friend: value.files.friendBattle,
    visible: value.visible,
  });
  for (let i = 0; i < 5; i++) {
    await page.locator('#author-recommendations').click();
    await expect(page.locator('.recommendation-card')).toHaveCount(5);
    await page.locator('.recommendation-card .primary').nth(i).click();
    await expect(page.locator('#loading')).toBeHidden();
    const applied = (await exportState(page)).state;
    expect(protectedFields(applied)).toEqual(protectedFields(initial));
    await page.locator('#undo').click();
    await expect(page.locator('#loading')).toBeHidden();
  }
});

test('mobile layout, motion preference and avatar upload constraints', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#background-motion').click();
  await page.reload();
  await expect(page.locator('#background-motion')).toHaveText('开启动效');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#author-recommendations').click();
  expect(
    await page
      .locator('#recommendations-dialog')
      .evaluate((el) => getComputedStyle(el).animationName)
  ).toBe('none');
  await page.keyboard.press('Escape');
  const image = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 721;
    c.height = 721;
    return c.toDataURL().split(',')[1];
  });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-control="avatar"] .file-input').setInputFiles({
    name: 'too-large.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await expect(page.locator('[data-control="avatar"] .control-file')).toHaveText('图片读取失败');
  const valid = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    return c.toDataURL().split(',')[1];
  });
  await page.locator('[data-control="avatar"] .file-input').setInputFiles({
    name: 'valid.png',
    mimeType: 'image/png',
    buffer: Buffer.from(valid, 'base64'),
  });
  await expect(page.locator('[data-control="avatar"] .control-file')).toContainText('valid.png');
});

test('template storage failure is atomic', async ({ page }) => {
  await ready(page);
  const saved = await exportState(page);
  saved.state.playerName = 'CHANGED';
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'maimai-diy-templates-v1') throw new Error('quota exceeded');
      return original.call(this, key, value);
    };
  });
  await page.locator('#template-import').setInputFiles({
    name: 'quota.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.locator('#template-status')).toContainText('导入失败');
  await expect(name(page)).toHaveValue('Observ.L');
});

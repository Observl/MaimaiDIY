import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDefaultState } from '../../src/model.js';
import { CURRENT_DESIGN_KEY } from '../../src/current-design.js';

// Deterministic artwork keeps this interaction regression independent of COS availability.
test.beforeEach(async ({ context }) => {
  await context.route('https://*.myqcloud.com/**', route => /\.png(?:\?|$)/.test(route.request().url())
    ? route.fulfill({ path: 'tests/fixtures/default-linux.png', contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } })
    : route.abort());
  await context.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify({ version: 1, state })), {
    key: CURRENT_DESIGN_KEY, state: createDefaultState(),
  });
});

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} close-up centers the nameplate and preserves JSON export without 3D PNG controls`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/custom-order.html', { waitUntil: 'domcontentloaded' });
    const viewport = page.locator('#acrylic-viewport');
    const closeup = page.getByRole('button', { name: '特写', exact: true });
    const near = page.getByRole('button', { name: '近景', exact: true });
    const full = page.getByRole('button', { name: '全景', exact: true });
    await expect(page.locator('#acrylic-preview-status')).toBeHidden();
    await expect(page.locator('#acrylic-image-export')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /3D PNG/ })).toHaveCount(0);
    await expect(page.locator('#acrylic-export-status')).toHaveCount(0);
    await expect(page.locator('#acrylic-scene-export')).toHaveCount(0);
    await expect(page.getByText('导出背景 3D PNG', { exact: true })).toHaveCount(0);
    const buttons = await page.locator('#acrylic-preview-card > .section-head button').allTextContents();
    expect(buttons).toEqual(['特写', '近景', '全景']);
    expect(await closeup.getAttribute('class')).toBe(await near.getAttribute('class'));
    const buttonBoxes = await page.locator('#acrylic-preview-card > .section-head button').evaluateAll(buttons => buttons.map(button => {
      const { x, y, right, bottom } = button.getBoundingClientRect(); return { x, y, right, bottom };
    }));
    expect(buttonBoxes[0].right).toBeLessThanOrEqual(buttonBoxes[1].x);
    expect(buttonBoxes[0].y).toBe(buttonBoxes[1].y);
    expect(buttonBoxes[2].right).toBeLessThanOrEqual(mobile ? 390 : 1440);
    await near.click();
    const nearDistance = Number(await viewport.getAttribute('data-camera-distance'));
    await closeup.click();
    await expect(viewport).toHaveAttribute('data-view-mode', 'nameplate');
    await expect(viewport).toHaveAttribute('data-orbit-target', '-1.649,4.043,-0.746');
    const closeDistance = Number(await viewport.getAttribute('data-camera-distance'));
    expect(closeDistance).toBeLessThan(nearDistance);
    await closeup.click();
    expect(Number(await viewport.getAttribute('data-camera-distance'))).toBe(closeDistance);
    await page.locator('#acrylic-viewport canvas').press('ArrowLeft');
    await expect(viewport).toHaveAttribute('data-orbit-target', '-1.649,4.043,-0.746');
    for (const [label, target] of [['镭射卡', '-1.649,4.043,0.022'], ['色纸', '-1.649,4.043,0.064'], ['亚克力砖', '-1.649,4.043,-0.746']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(viewport).toHaveAttribute('data-orbit-target', target);
      await expect(viewport).toHaveAttribute('data-view-mode', 'nameplate');
    }
    const cameraBefore = await viewport.getAttribute('data-camera-distance');
    const targetBefore = await viewport.getAttribute('data-orbit-target');
    const draftPromise = page.waitForEvent('download');
    await page.locator('#acrylic-export').click();
    const draft = JSON.parse(await readFile(await (await draftPromise).path(), 'utf8'));
    expect(draft.format).toBe('MaimaiDIY-acrylic-order-draft');
    await expect(viewport).toHaveAttribute('data-camera-distance', cameraBefore);
    await expect(viewport).toHaveAttribute('data-orbit-target', targetBefore);
    await full.click();
    await expect(viewport).toHaveAttribute('data-view-mode', 'full');
    expect(Number(await viewport.getAttribute('data-camera-distance'))).toBeGreaterThan(nearDistance);
    await near.click();
    await expect(viewport).toHaveAttribute('data-orbit-target', '0.000,2.650,0.000');
    await closeup.click();
    await page.setViewportSize({ width: mobile ? 320 : 390, height: 844 });
    await expect(viewport).toHaveAttribute('data-orbit-target', '-1.649,4.043,-0.746');
    await expect(closeup).toBeInViewport();
    expect(errors).toEqual([]);
  });
}


test('flat PNG and template JSON downloads remain available in the editor', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#template-export')).toBeEnabled();
  await expect(page.getByRole('button', { name: /3D PNG/ })).toHaveCount(0);
  const pngPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const png = await readFile(await (await pngPromise).path());
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.readUInt32BE(16)).toBe(2160);
  expect(png.readUInt32BE(20)).toBe(904);
  const jsonPromise = page.waitForEvent('download');
  await page.locator('#template-export').click();
  const template = JSON.parse(await readFile(await (await jsonPromise).path(), 'utf8'));
  expect(template.state.playerName).toBeTruthy();
  expect(errors).toEqual([]);
});

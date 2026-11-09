import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { installCosFixtures, RELEASE_URL } from './regional-index-fixtures.js';
test.use({ serviceWorkers: 'block' });
// Optional SHA-verified originals make interaction tests deterministic offline.
// Live upstream reachability is checked separately in the supported browser.
test.beforeEach(async ({ context }) => {
  if (!process.env.MAIMAI_TEST_SOURCE_ROOT) return;
  const root = resolve(process.env.MAIMAI_TEST_SOURCE_ROOT);
  await context.route('https://raw.githubusercontent.com/**', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/').filter(Boolean);
    const repositories = {
      'basilomorireal/maimai-asset-browser': [
        'maimai-asset-browser',
        '0ebcd319585af286bce5c31cc416fcf245e28428',
      ],
      'realtvop/SaltMeta': ['SaltMeta', 'd327942662643b391b6883ba40dd0b89e9a1d169'],
      'saltcute/maidraw': ['maidraw', 'a3a5027940519b6ff52831185177d58b71c404d2'],
    };
    const source = repositories[parts.slice(0, 2).join('/')];
    if (!source || parts[2] !== source[1]) {
      await route.abort();
      return;
    }
    const path = resolve(root, source[0], ...parts.slice(3));
    if (!path.startsWith(root + sep)) {
      await route.abort();
      return;
    }
    try {
      await route.fulfill({
        body: await readFile(path),
        contentType: path.endsWith('.webp') ? 'image/webp' : 'image/png',
        headers: { 'access-control-allow-origin': '*' },
      });
    } catch {
      await route.abort();
    }
  });
});

const name = (page) => page.locator('[data-control="playerName"] .name-input');
const rating = (page) => page.locator('[data-control="rating"] .rating-input');
async function ready(page) {
  await installCosFixtures(page.context());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loading')).toBeHidden();
}
async function template(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#template-export').click();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
async function save(page, title) {
  await page.locator('#template-name').fill(title);
  await page.locator('#template-save').click();
}
async function region(page, value) {
  await page.locator('#region-select').selectOption(value);
  await expect(page.locator('#region-select')).toBeEnabled();
  await expect(page.locator('#region-select')).toHaveValue(value);
}
test('original layout region isolation, modes, pickers, templates and screenshots', async ({
  page,
}, testInfo) => {
  const output = (file) =>
    process.env.MAIMAI_QA_OUTPUT
      ? resolve(process.env.MAIMAI_QA_OUTPUT, file)
      : testInfo.outputPath(file);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'maimai-diy-templates-v1',
      '[{"id":"legacy","name":"keep","state":{"playerName":"LEGACY"}}]'
    )
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      'maimai-diy-current-design-v1',
      JSON.stringify({ version: 1, state: { playerName: 'Observ.L', ratingValue: 16411 } })
    )
  );
  await ready(page);
  await expect(name(page)).toHaveValue('Observ.L');
  await expect(rating(page)).toHaveValue('16411');
  await expect(page.locator('#template-list')).toContainText('keep');
  await expect(page.locator('#preview')).toHaveAttribute('width', '1080');
  await expect(page.locator('#circle-background')).toBeVisible();
  await expect(page.locator('#magical-background')).toBeHidden();
  await page.screenshot({ path: output('cn-desktop.png'), fullPage: true });
  await name(page).fill('CN TEST');
  await name(page).press('Tab');
  await rating(page).fill('12345');
  await rating(page).press('Tab');
  await save(page, 'CN COLLECTION');
  await page.locator('#screen-mode').selectOption('companions');
  await expect(page.locator('#companion-controls .control-row')).toHaveCount(5);
  await expect(page.locator('#region-content-note')).toContainText('暂不可选');
  await save(page, 'CN COMPANIONS');
  await expect(page.locator('#template-list')).not.toContainText('CN COLLECTION');
  await region(page, 'jp');
  await expect(page.locator('#asset-status')).toHaveText('国服原素材库已连接 · 2247 项');
  await name(page).fill('JP TEST');
  await name(page).press('Tab');
  await page.locator('#screen-mode').selectOption('companions');
  await expect(page.locator('#companion-controls .library-button').first()).toBeEnabled();
  for (let i = 0; i < 5; i++) {
    await page
      .locator('#companion-controls .control-row')
      .nth(i)
      .getByRole('button', { name: '素材库' })
      .click();
    await expect(page.locator('#asset-picker')).toBeVisible();
    await page.locator('#picker-grid .asset-item').nth(i).click();
    await expect(page.locator('#asset-picker')).not.toBeVisible();
  }
  await expect(page.locator('#companion-controls input:enabled')).toHaveCount(5);
  await page.locator('#companion-controls input').first().fill('77');
  await page.locator('#companion-controls input').first().press('Tab');
  await save(page, 'JP COMPANIONS');
  let data = await template(page);
  expect(data.state.region).toBe('jp');
  expect(data.state.companions).toHaveLength(5);
  expect(data.state.companions[0].level).toBe(77);
  const partyBeforeSwap = data.state.companions;
  await page
    .locator('#companion-controls .control-row')
    .nth(1)
    .getByRole('button', { name: '素材库' })
    .click();
  await page.locator('#picker-grid .asset-item').first().click();
  await expect(page.locator('#asset-picker')).not.toBeVisible();
  const swappedParty = (await template(page)).state.companions;
  expect(swappedParty).toHaveLength(5);
  expect(swappedParty.map((member) => member.id).sort()).toEqual(
    partyBeforeSwap.map((member) => member.id).sort()
  );
  expect(swappedParty).toEqual([
    partyBeforeSwap[1],
    partyBeforeSwap[0],
    ...partyBeforeSwap.slice(2),
  ]);
  await page.locator('#undo').click();
  expect((await template(page)).state.companions).toEqual(partyBeforeSwap);
  await expect(page.locator('#magical-background')).toBeVisible();
  await expect(page.locator('#circle-background')).toBeHidden();
  const jpFiles = (await template(page)).state.files;
  expect(jpFiles.ratingFrame).toBe(`${RELEASE_URL}ui/maidraw/dxRating/jp/circleplus/kiwami.webp`);
  for (const control of ['rank', 'friendBattle']) {
    expect(jpFiles[control]).toBe('');
    await expect(page.locator(`[data-control="${control}"] .library-button`)).toBeDisabled();
    await expect(page.locator(`[data-control="${control}"] .visibility`)).toBeDisabled();
    await expect(page.locator(`[data-control="${control}"] .control-icon img`)).toHaveCount(0);
  }
  const themeOnly = await page.evaluate(async () => {
    const { applyRegionBackground } = await import('/src/region-background.js');
    const canvas = document.querySelector('#preview');
    const before = canvas.toDataURL();
    const geometry = document.querySelector('.preview-card').getBoundingClientRect().toJSON();
    applyRegionBackground('cn');
    applyRegionBackground('jp');
    return {
      sameCanvas: before === canvas.toDataURL(),
      sameGeometry:
        JSON.stringify(geometry) ===
        JSON.stringify(document.querySelector('.preview-card').getBoundingClientRect().toJSON()),
    };
  });
  expect(themeOnly).toEqual({ sameCanvas: true, sameGeometry: true });
  expect((await template(page)).state.files).toEqual(jpFiles);
  for (const control of ['background', 'nameplate', 'avatar']) {
    await page.locator(`[data-control="${control}"] .library-button`).click();
    await expect(page.locator('#picker-filter option')).not.toHaveCount(1);
    expect(await page.locator('#picker-filter option').count()).toBeGreaterThan(10);
    await page.locator('#picker-filter').selectOption({ index: 1 });
    await expect(page.locator('#picker-grid .asset-item').first()).toBeVisible();
    await page.locator('#picker-filter').selectOption('');
    await page.locator('#picker-close').click();
  }
  await page
    .locator('#companion-controls .control-row')
    .first()
    .getByRole('button', { name: '素材库' })
    .click();
  expect(await page.locator('#picker-filter option').count()).toBeGreaterThan(10);
  await page.locator('#picker-close').click();
  await page.locator('#background-motion').click();
  await expect(page.locator('html')).toHaveAttribute('data-background-motion', 'paused');
  expect(
    await page
      .locator('#magical-background .croud_01')
      .evaluate((el) => getComputedStyle(el).animationPlayState)
  ).toBe('paused');
  await page.locator('#background-motion').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator('#magical-background .croud_01')
      .evaluate((el) => getComputedStyle(el).animationPlayState)
  ).toBe('running');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.screenshot({ path: output('jp-desktop.png'), fullPage: true });
  await page.locator('#screen-mode').selectOption('achievement');
  await expect(page.locator('#template-list')).not.toContainText('JP COMPANIONS');
  await page.locator('#song-pick').click();
  await page.locator('#picker-grid .asset-item').first().click();
  await expect(page.locator('#asset-picker')).not.toBeVisible();
  const options = await page.locator('#song-difficulty option').allTextContents();
  expect(options.length).toBeGreaterThan(1);
  await page.locator('#song-difficulty').selectOption({ index: options.length - 1 });
  await page.locator('#song-achievement').fill('100.1234');
  await page.locator('#song-achievement').press('Tab');
  await save(page, 'JP SONG');
  data = await template(page);
  expect(data.state.song.achievement).toBe('100.1234');
  expect(data.state.song.id).toBeTruthy();
  await region(page, 'cn');
  await expect(name(page)).toHaveValue('CN TEST');
  await expect(page.locator('#circle-background')).toBeVisible();
  await expect(page.locator('#magical-background')).toBeHidden();
  await expect(rating(page)).toHaveValue('12345');
  await expect(page.locator('#screen-mode')).toHaveValue('companions');
  await region(page, 'jp');
  await expect(name(page)).toHaveValue('JP TEST');
  await expect(page.locator('#song-achievement')).toHaveValue('100.1234');
  await expect(page.locator('#template-list')).toContainText('JP SONG');
  expect((await template(page)).state.files.background).toBe(jpFiles.background);
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(name(page)).toHaveValue('JP TEST');
  await expect(page.locator('#song-achievement')).toHaveValue('100.1234');
  expect(await page.evaluate(() => localStorage.getItem('maimai-diy-templates-v1'))).toBe(
    '[{"id":"legacy","name":"keep","state":{"playerName":"LEGACY"}}]'
  );

  expect(await page.evaluate(() => localStorage.getItem('maimai-diy-current-design-v1'))).toBe(
    JSON.stringify({ version: 1, state: { playerName: 'Observ.L', ratingValue: 16411 } })
  );
  await expect(page.locator('#magical-background')).toBeVisible();
  await expect(page.locator('#circle-background')).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
  const brokenImages = await page.locator('img')
    .evaluateAll((imgs) => imgs.filter((i) => !i.naturalWidth).map((i) => i.src));
  await writeFile(output('broken-images.json'), JSON.stringify(brokenImages, null, 2));
  expect(brokenImages).toEqual([]);
  const pngPending = page.waitForEvent('download');
  await page.locator('#export').click();
  const png = await readFile(await (await pngPending).path());
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2160, 904]);
  await writeFile(output('jp-export.png'), png);
  await page.setViewportSize({ width: 390, height: 844 });
  // Inspect the real scrolled view, then synchronize with paint after resizing.
  // Do not disable page animations or rewrite styles for screenshots.
  await page.locator('[data-control="rating"]').scrollIntoViewIfNeeded();
  await expect(rating(page)).toHaveValue('16411');
  await page.screenshot({ path: output('jp-mobile-controls.png') });
  await page.locator('#song-controls').scrollIntoViewIfNeeded();
  await expect(page.locator('#song-achievement')).toHaveValue('100.1234');
  await page.screenshot({ path: output('jp-mobile-song.png') });
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerWidth * 1.5) {
      window.scrollTo(0, y);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    }
    window.scrollTo(0, 0);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await page.screenshot({ path: output('jp-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

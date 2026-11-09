import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// These are ordinary desktop-browser component tests, NOT iOS emulation or
// evidence of native Safari/Photos behavior. Exercise the production controller
// and markup with an explicit preview option and mocked optional share APIs.
const html = await readFile('index.html', 'utf8');
const dialog = html.match(/  <dialog id="image-export-dialog"[\s\S]*?<\/dialog>/)[0];
async function harness(page, { preview = true, share = 'resolve', canShare = 'true', delayed = false } = {}) {
  await page.addInitScript(({ share, canShare, delayed }) => {
    window.shareCalls = [];
    window.revoked = [];
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = url => { window.revoked.push(url); revoke(url); };
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }) => {
      if (canShare === 'throw') throw new Error('unsupported');
      return canShare === 'true' && files[0] instanceof window.File;
    } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: data => {
      window.shareCalls.push({ data, active: navigator.userActivation.isActive });
      if (share === 'pending') return new Promise((resolve, reject) => { window.finishShare = { resolve, reject }; });
      if (share !== 'resolve') return Promise.reject(new window.DOMException('share failed', share));
      return Promise.resolve();
    } });
    if (delayed) {
      const original = window.HTMLCanvasElement.prototype.toBlob;
      window.pendingEncodes = [];
      window.HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
        window.pendingEncodes.push(() => original.call(this, callback, ...args));
      };
    }
  }, { share, canShare, delayed });
  await page.route('**/image-export-harness', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"></head>
    <body><button id="export" class="button primary">导出高清 PNG</button>${dialog}
    <script type="module">
      import { initializeImageExport } from '/src/image-export.js';
      const canvas = document.createElement('canvas'); canvas.width = 2160; canvas.height = 904;
      const context = canvas.getContext('2d'); context.fillStyle = '#1256ab'; context.fillRect(0, 0, 2160, 904);
      window.exportCanvas = canvas;
      window.exportApi = initializeImageExport({ renderCanvas: canvas, width: 2160, height: 904, preferPreview: ${preview} });
    </script></body></html>` }));
  await page.goto('/image-export-harness');
  await page.waitForFunction(() => !!window.exportApi);
}
async function readyPreview(page) {
  await page.locator('#export').click();
  await expect(page.locator('#image-export-preview')).toBeVisible();
  await expect(page.locator('#image-export-actions')).toBeVisible();
  await page.locator('#image-export-preview').evaluate(image => image.decode());
}
async function expectQuietStatus(page) {
  const status = page.locator('#image-export-status');
  await expect(status).toHaveClass('sr-only');
  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).toHaveAttribute('aria-atomic', 'true');
  const box = await status.boundingBox();
  expect(box.width).toBe(1);
  expect(box.height).toBe(1);
}
function checkPng(png) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.readUInt32BE(16)).toBe(2160);
  expect(png.readUInt32BE(20)).toBe(904);
}

test('desktop exports a real 2160 x 904 PNG in one click without opening the dialog', async ({ page }) => {
  await harness(page, { preview: false });
  const pending = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await pending;
  checkPng(await readFile(await download.path()));
  expect(download.suggestedFilename()).toMatch(/^maimai-diy-2160x904-\d+\.png$/);
  await expect(page.locator('#image-export-dialog')).not.toBeVisible();
  await expect(page.locator('#export')).toBeEnabled();
  expect(await page.evaluate(() => window.revoked)).toEqual([]);
});

test('preview keeps full PNG pixels and native image context menu; share requires a new activated click', async ({ page }, testInfo) => {
  await harness(page);
  await expect(page.locator('#export')).toHaveText('保存到相册');
  await readyPreview(page);
  await expect(page.locator('#image-export-share')).toHaveText('保存到相册');
  await expect(page.locator('#image-export-download')).toHaveText('保存到文件');
  await expectQuietStatus(page);
  expect(await page.evaluate(() => window.shareCalls.length)).toBe(0);
  expect(await page.locator('#image-export-preview').evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight })))
    .toEqual({ width: 2160, height: 904 });
  await page.locator('#image-export-preview').click();
  await expect(page.locator('#image-export-dialog')).toBeVisible();
  expect(await page.locator('#image-export-preview').evaluate(image =>
    image.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(true);
  await testInfo.attach('save-image-preview', { body: await page.screenshot(), contentType: 'image/png' });
  await page.locator('#image-export-share').click();
  const shared = await page.evaluate(async () => {
    const { data, active } = window.shareCalls[0];
    const bitmap = await createImageBitmap(data.files[0]);
    const sample = document.createElement('canvas'); sample.width = sample.height = 1;
    const context = sample.getContext('2d'); context.drawImage(bitmap, 0, 0);
    const result = { active, type: data.files[0].type, name: data.files[0].name,
      width: bitmap.width, height: bitmap.height, pixel: [...context.getImageData(0, 0, 1, 1).data] };
    bitmap.close(); return result;
  });
  expect(shared).toMatchObject({ active: true, type: 'image/png', width: 2160, height: 904, pixel: [18, 86, 171, 255] });
  expect(shared.name).toMatch(/\.png$/);
  await expect(page.locator('#image-export-status')).not.toContainText('已保存');
  await expect(page.locator('#image-export-status')).toHaveText('系统操作已结束。');
  await expectQuietStatus(page);
  const pending = page.waitForEvent('download');
  await page.locator('#image-export-download').click();
  checkPng(await readFile(await (await pending).path()));
  await expect(page.locator('#image-export-dialog')).toBeVisible();
  expect(await page.evaluate(() => window.revoked)).toEqual([]);
  await page.locator('#image-export-close').click();
  await expect(page.locator('#export')).toBeFocused();
  await expect(page.locator('#image-export-preview')).not.toHaveAttribute('src');
  expect(await page.evaluate(() => window.revoked)).toEqual([]);
});

for (const canShare of ['false', 'throw']) test(`canShare ${canShare} preserves image and explicit download`, async ({ page }) => {
  await harness(page, { canShare });
  await readyPreview(page);
  await expect(page.locator('#image-export-share')).not.toBeVisible();
  await expect(page.locator('#image-export-status')).toContainText('长按');
  await expectQuietStatus(page);
  const actionWidth = (await page.locator('#image-export-actions').boundingBox()).width;
  expect((await page.locator('#image-export-download').boundingBox()).width).toBe(actionWidth);
  const pending = page.waitForEvent('download');
  await page.locator('#image-export-download').click();
  checkPng(await readFile(await (await pending).path()));
  await page.keyboard.press('Escape');
  await expect(page.locator('#image-export-dialog')).not.toBeVisible();
  await readyPreview(page);
});

for (const share of ['AbortError', 'NotAllowedError']) test(`${share} keeps preview and permits retry without automatic download`, async ({ page }) => {
  await harness(page, { share });
  let downloads = 0;
  page.on('download', () => downloads++);
  await readyPreview(page);
  await page.locator('#image-export-share').click();
  await expect(page.locator('#image-export-status')).toContainText(share === 'AbortError' ? '已取消' : '暂不可用');
  if (share === 'AbortError') await expectQuietStatus(page);
  else {
    await expect(page.locator('#image-export-status')).not.toHaveClass('sr-only');
    await expect(page.locator('#image-export-status')).toBeVisible();
  }
  await expect(page.locator('#image-export-preview')).toBeVisible();
  await page.locator('#image-export-share').click();
  expect(await page.evaluate(() => window.shareCalls.length)).toBe(2);
  expect(downloads).toBe(0);
});

test('pending share ignores repeat clicks; stale cancellation cannot overwrite a reopened preview', async ({ page }) => {
  await harness(page, { share: 'pending' });
  await readyPreview(page);
  await page.locator('#image-export-share').click();
  await expect(page.locator('#image-export-share')).toBeDisabled();
  await page.locator('#image-export-share').evaluate(button => button.dispatchEvent(new window.Event('click')));
  expect(await page.evaluate(() => window.shareCalls.length)).toBe(1);
  await page.locator('#image-export-close').click();
  await readyPreview(page);
  await page.evaluate(() => window.finishShare.reject(new window.DOMException('cancelled', 'AbortError')));
  await expect(page.locator('#image-export-share')).toBeEnabled();
  await expect(page.locator('#image-export-status')).toContainText('图片已生成');
  await expectQuietStatus(page);
});

test('close during encoding cancels obsolete results; export is a snapshot and not a later edit', async ({ page }) => {
  await harness(page, { delayed: true });
  await page.locator('#export').click();
  await expect(page.locator('#image-export-status')).toContainText('正在生成');
  await expect(page.locator('#image-export-status')).not.toHaveClass('sr-only');
  await expect(page.locator('#image-export-status')).toBeVisible();
  await expect(page.locator('#image-export-preview')).not.toBeVisible();
  await expect(page.locator('#image-export-actions')).not.toBeVisible();
  await page.locator('#export').evaluate(button => button.dispatchEvent(new window.Event('click')));
  expect(await page.evaluate(() => window.pendingEncodes.length)).toBe(1);
  await page.keyboard.press('Escape');
  await page.locator('#export').click();
  await page.evaluate(() => {
    const context = window.exportCanvas.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, 2160, 904);
    window.pendingEncodes[1]();
  });
  await expect(page.locator('#image-export-preview')).toBeVisible();
  const url = await page.locator('#image-export-preview').getAttribute('src');
  await page.evaluate(() => window.pendingEncodes[0]());
  await expect(page.locator('#image-export-preview')).toHaveAttribute('src', url);
  await page.locator('#image-export-preview').evaluate(image => image.decode());
  expect(await page.locator('#image-export-preview').evaluate(image => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return [...context.getImageData(0, 0, 1, 1).data];
  })).toEqual([18, 86, 171, 255]);
});

test('encoding failure is recoverable and does not falsely claim CORS', async ({ page }) => {
  await harness(page);
  await page.evaluate(() => {
    window.originalToBlob = window.HTMLCanvasElement.prototype.toBlob;
    window.HTMLCanvasElement.prototype.toBlob = callback => callback(null);
  });
  await page.locator('#export').click();
  await expect(page.locator('#image-export-status')).toContainText('图片生成失败');
  await expect(page.locator('#image-export-status')).not.toHaveClass('sr-only');
  await expect(page.locator('#image-export-status')).toBeVisible();
  await expect(page.locator('#image-export-status')).not.toContainText('跨域');
  await expect(page.locator('#image-export-preview')).not.toBeVisible();
  await expect(page.locator('#image-export-actions')).not.toBeVisible();
  await page.locator('#image-export-close').click();
  await page.evaluate(() => { window.HTMLCanvasElement.prototype.toBlob = window.originalToBlob; });
  await readyPreview(page);
  await expectQuietStatus(page);
});

for (const viewport of [
  { width: 320, height: 568 }, { width: 390, height: 844 },
  { width: 430, height: 932 }, { width: 844, height: 390 },
  { width: 1024, height: 768 },
]) test(`save dialog has centered labels and equal actions at ${viewport.width} x ${viewport.height}`, async ({ page }, testInfo) => {
  await page.setViewportSize(viewport);
  await harness(page);
  await readyPreview(page);
  await expectQuietStatus(page);
  const layout = await page.locator('#image-export-dialog').evaluate(dialog => {
    const bounds = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const buttons = [...dialog.querySelectorAll('#image-export-actions > :not([hidden])')].map(button => {
      const range = document.createRange();
      range.selectNodeContents(button);
      return { box: bounds(button), text: bounds(range), align: getComputedStyle(button).textAlign };
    });
    return { box: bounds(dialog), title: bounds(dialog.querySelector('h2')),
      preview: bounds(dialog.querySelector('img')), actions: bounds(dialog.querySelector('#image-export-actions')),
      head: bounds(dialog.querySelector('.section-head')), buttons,
      overflow: dialog.scrollWidth > dialog.clientWidth };
  });
  expect(layout.overflow).toBe(false);
  expect(layout.box.x).toBeGreaterThanOrEqual(0);
  expect(layout.box.x + layout.box.width).toBeLessThanOrEqual(viewport.width);
  expect(layout.buttons).toHaveLength(2);
  expect(layout.buttons[0].box.width).toBeCloseTo(layout.buttons[1].box.width, 1);
  expect(layout.buttons[0].box.height).toBe(layout.buttons[1].box.height);
  expect(layout.buttons[0].box.y).toBe(layout.buttons[1].box.y);
  for (const { box, text, align } of layout.buttons) {
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(align).toBe('center');
    expect(Math.abs(text.x + text.width / 2 - box.x - box.width / 2)).toBeLessThan(1);
    expect(Math.abs(text.y + text.height / 2 - box.y - box.height / 2)).toBeLessThan(1.5);
  }
  expect(Math.abs(layout.title.x + layout.title.width / 2 - layout.box.x - layout.box.width / 2)).toBeLessThan(1);
  expect(layout.preview.y - layout.head.y - layout.head.height).toBeCloseTo(16, 1);
  expect(layout.actions.y - layout.preview.y - layout.preview.height).toBeCloseTo(16, 1);
  await testInfo.attach('compact-save-dialog', { body: await page.screenshot(), contentType: 'image/png' });
});

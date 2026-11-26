import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { REGION_BASE_URL, REGION_CATEGORIES } from '../../src/region-index.js';
import { buildRegionalIndex } from '../../tools/build-region-index.mjs';

test.use({ serviceWorkers: 'block' });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64');
// Deterministic structural UI tests: tiny artwork fixtures do not assert visual fidelity.
async function openEditor(page, context) {
  await context.route('https://**/*', async route => {
    const path = new URL(route.request().url()).pathname;
    const json = path.endsWith('/manifest.json') ? {schemaVersion:1,categories:[{id:'avatars',items:[{id:'avatars/1',name:'测试头像',file:'avatars/1.png'}]}]}
      :path.endsWith('/badges.json')?{schemaVersion:1,categories:[]}
        :path.endsWith('/titles.json')?{schemaVersion:1,items:[]}
          :path.endsWith('/recommendations.json')?{version:1,items:[]}:null;
    if(json) return route.fulfill({json,headers:{'access-control-allow-origin':'*'}});
    if(/\.(?:png|webp|jpe?g)$/.test(path)) return route.fulfill({body:png,contentType:'image/png',headers:{'access-control-allow-origin':'*'}});
    return route.fulfill({status:404,body:'Fixture unavailable',headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('.controls-summary').click();
}
for(const width of [1440,390,320]) {
  test(`shared controls and repeated dialogs at ${width}px`,async({page,context},info)=>{
    await page.setViewportSize({width,height:1000});
    await openEditor(page,context);
    const name=page.locator('.name-input');
    const rating=page.locator('.rating-input');
    await expect(name).toBeVisible();
    await expect(rating).toBeVisible();
    if(width<=680){ await expect(name).toHaveCSS('font-size','16px'); await expect(rating).toHaveCSS('font-size','16px'); }
    const originalName = await name.inputValue();
    await name.fill('UI测试'); await name.press('Tab');
    await expect(name).toHaveValue('UI测试');
    await page.locator('#undo').click(); await expect(name).toHaveValue(originalName);
    await page.locator('#redo').click(); await expect(name).toHaveValue('UI测试');
    const open=page.locator('[data-control="avatar"] .library-button');
    for(let i=0;i<2;i++) {await open.click();await expect(page.locator('#asset-picker')).toBeVisible();await page.locator('#picker-search').fill('测试');await page.locator('#picker-close').click();await expect(page.locator('#asset-picker')).toBeHidden();}
    await page.locator('#template-name').fill('UI regression'); await page.locator('#template-save').click();
    const event=page.waitForEvent('download'); await page.locator('#template-export').click();
    const data=JSON.parse(await readFile(await(await event).path(),'utf8'));expect(JSON.stringify(data)).toContain('UI测试');
    const download=page.waitForEvent('download');await page.locator('#export').click();
    const bytes=await readFile(await(await download).path());expect(bytes.readUInt32BE(16)).toBe(2160);expect(bytes.readUInt32BE(20)).toBe(904);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);expect(overflow).toBe(false);
    await page.locator('.controls-card').scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath(`controls-${width}.png`),fullPage:true});
  });
}
for (const width of [1440, 1024, 768, 390, 320]) {
  test(`v1.4.0 editor hierarchy and touch layout at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openEditor(page, context);
    await expect(page).toHaveTitle(/v1\.4\.0/);
    await expect(page.locator('.editor-hero h1')).toHaveCount(1);
    await expect(page.locator('.preview-spec, .controls-summary p, .controls-summary-hint, .template-io p')).toHaveCount(0);
    await expect(page.locator('.support-note, .support-copy .eyebrow')).toHaveCount(2);
    await expect(page.locator('.support-copy h1')).toHaveText('支持项目持续运行');
    const merch = page.locator('.support-actions > .support-merch-link');
    const feedback = page.locator('.support-actions > #feedback-open');
    await expect(merch).toBeVisible();
    await expect(feedback).toBeVisible();
    await expect(merch).toHaveAttribute('href', './custom-order.html');
    const actionBounds = await page.locator('.support-actions').evaluate(group => {
      const buttons = [...group.children].map(el => el.getBoundingClientRect());
      const qr = document.querySelector('.support-qr-wrap').getBoundingClientRect();
      return { first: buttons[0].toJSON(), second: buttons[1].toJSON(), top: group.getBoundingClientRect().top, qrBottom: qr.bottom };
    });
    expect(Math.abs(actionBounds.first.width - actionBounds.second.width)).toBeLessThan(1);
    expect(actionBounds.first.height).toBeGreaterThanOrEqual(52);
    expect(actionBounds.second.height).toBeGreaterThanOrEqual(52);
    expect(actionBounds.top).toBeGreaterThanOrEqual(actionBounds.qrBottom);
    if (width <= 360) expect(actionBounds.second.top).toBeGreaterThanOrEqual(actionBounds.first.bottom + 12);
    else expect(Math.abs(actionBounds.first.top - actionBounds.second.top)).toBeLessThan(1);
    await feedback.click();
    await expect(page.locator('#feedback-dialog')).toBeVisible();
    await page.locator('#feedback-close').click();
    await expect(page.locator('#feedback-dialog')).toBeHidden();
    await expect(page.locator('#support')).toHaveCSS('border-radius', width <= 680 ? '24px' : '32px');
    const qrWidth = await page.locator('.support-qr-wrap img').evaluate(el => el.getBoundingClientRect().width);
    expect(qrWidth).toBeGreaterThanOrEqual(width <= 320 ? 210 : width <= 390 ? 280 : 380);
    expect(await page.locator('.controls-card').evaluate(el =>
      Boolean(el.compareDocumentPosition(document.querySelector('.template-card')) & window.Node.DOCUMENT_POSITION_FOLLOWING)
    )).toBe(true);

    const layout = await page.evaluate(() => {
      const rect = selector => {
        const { x, y, width, height, right, bottom } = document.querySelector(selector).getBoundingClientRect();
        return { x, y, width, height, right, bottom };
      };
      const overlaps = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
      const header = ['.editor-hero > div:first-child', '#asset-status', '.hero-links', '.hero-background-controls'].map(rect);
      const collisions = header.flatMap((a, i) => header.slice(i + 1).filter(b => overlaps(a, b)));
      const targets = ['#undo', '#redo', '#reset', '#export', '#preview-mode', '#preview-refresh', '#region-toggle', '#background-motion'].map(rect);
      const history = [rect('#undo'), rect('#redo')];
      return {
        collisions: collisions.length,
        targets,
        historyGap: history[1].x - history[0].right,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        export: rect('#export'),
        shell: rect('.app-shell'),
      };
    });
    expect(layout.collisions).toBe(0);
    expect(layout.overflow).toBe(false);
    expect(layout.historyGap).toBeGreaterThanOrEqual(8);
    expect(layout.historyGap).toBeLessThanOrEqual(12);
    for (const target of layout.targets) {
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
    }
    expect(layout.export.right).toBeLessThanOrEqual(layout.shell.right);

    await page.locator('[data-control="avatar"] .library-button').click();
    await expect(page.locator('#asset-picker')).toBeVisible();
    // The dialog entrance scales its children until the animation finishes.
    await expect(page.locator('#asset-picker')).toHaveCSS('transform', 'none');
    expect(await page.locator('#picker-close').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await page.locator('#asset-picker').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await page.locator('.controls-summary').click();
    await expect(page.locator('.controls-card')).not.toHaveAttribute('open');
  });
}

test('header hints follow CN and JP switching without technical status copy', async ({ page, context }) => {
  const catalogs = Object.fromEntries(['cn', 'jp'].map(region => [region, {
    schemaVersion: 1, region, version: 'test', generatedAt: '2026-11-24T00:00:00Z', sources: [],
    availability: { art: 'test' }, ...Object.fromEntries(REGION_CATEGORIES.map(category => [category, []])),
  }]));
  const { files } = buildRegionalIndex({ catalogs });
  const prefix = new URL(REGION_BASE_URL).pathname;
  await page.route(REGION_BASE_URL + '**', async route => {
    const body = files.get(new URL(route.request().url()).pathname.slice(prefix.length));
    if (body) return route.fulfill({ body, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } });
    return route.fallback();
  });
  await openEditor(page, context);
  const toggle = page.locator('#region-toggle');
  for (const region of ['cn', 'jp', 'cn']) {
    if (await page.locator('html').getAttribute('data-region') !== region) {
      await expect(toggle).toBeEnabled();
      await toggle.click();
    }
    await expect(page.locator('html')).toHaveAttribute('data-region', region);
    await expect(toggle).toHaveText(region === 'cn' ? '国服展示板' : '日服展示板');
    // Move off the clicked control to check the resting tint, not its hover tint.
    await page.locator('.editor-hero h1').hover();
    for (const selector of ['#region-toggle', '#background-motion']) {
      await expect(page.locator(selector)).toHaveCSS('background-color', region === 'cn' ? 'rgb(255, 240, 246)' : 'rgb(237, 247, 222)');
      await expect(page.locator(selector)).toHaveCSS('color', region === 'cn' ? 'rgb(141, 40, 88)' : 'rgb(61, 100, 30)');
    }
    await expect(toggle).toBeEnabled();
    await expect(page.locator('#region-status')).toBeEmpty();
    await expect(page.locator('#region-status')).toBeHidden();
  }
});

test('order configurator inherits shared palette and remains interactive',async({page,context},info)=>{
  await page.setViewportSize({width:390,height:1000});await openEditor(page,context);
  await page.goto('/custom-order.html');
  await expect(page.locator('#custom-order')).toBeVisible();
  expect(await page.locator('#custom-order').evaluate(el=>getComputedStyle(el).getPropertyValue('--store-blue').trim())).toBe('#6c5ce7');
  const choices=page.locator('.configuration-choice');expect(await choices.count()).toBeGreaterThan(0);
  await choices.first().click();await expect(page.locator('.configuration-row.is-active')).toBeVisible();
  await page.locator('[data-preview-product="card"]').click();await expect(page.locator('[data-preview-product="card"]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  await page.screenshot({path:info.outputPath('order-mobile.png'),fullPage:true});
});

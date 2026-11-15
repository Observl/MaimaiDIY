import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
    await name.fill('UI测试'); await name.press('Tab');
    await expect(name).toHaveValue('UI测试');
    await page.locator('#undo').click(); await expect(name).toHaveValue('Observ.L');
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

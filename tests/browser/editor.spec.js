import { test, expect } from '@playwright/test';
import { readFile,writeFile } from 'node:fs/promises';

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
  await page.goto('/', { waitUntil: 'domcontentloaded' });
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
  const recommendationCount=await page.evaluate(async()=>{
    const {COS}=await import('/src/config.js');
    const {fetchJson}=await import('/src/assets.js');
    const data=await fetchJson(COS.recommendationsUrl);
    return new Set(['author-default',...data.items.map(item=>item.id)]).size;
  });
  expect(recommendationCount).toBeGreaterThan(1);
  for (let i = 0; i < recommendationCount; i++) {
    await page.locator('#author-recommendations').click();
    await expect(page.locator('.recommendation-card')).toHaveCount(recommendationCount);
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
  await page.reload({ waitUntil: 'domcontentloaded' });
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

test('merch opens separately with the latest design and returns to the same edits', async ({ page }) => {
  const shaderErrors = [];
  page.on('pageerror',error=>shaderErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /THREE.WebGLProgram|Shader Error|VALIDATE_STATUS/.test(message.text())) shaderErrors.push(message.text());
  });
  await ready(page);
  await name(page).fill('最新设计');
  await rating(page).fill('12345');
  await expect(page.locator('#custom-order')).toHaveCount(0);
  await expect(page.locator('.support-merch-link')).toHaveCount(0);
  await page.goto('/custom-order.html',{waitUntil:'domcontentloaded'});
  await expect(page).toHaveURL(/custom-order\.html$/);
  await expect(page.locator('#design-status')).toHaveText('已自动载入你最近编辑的上屏设计。');
  await expect(page.locator('#order-preview-shell')).toBeVisible();
  await expect(page.locator('#acrylic-preview-status')).toBeHidden();
  await expect(page.locator('#acrylic-viewport canvas')).toBeVisible();
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-variant', 'effect');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-material-engine','custom-shader-material+mesh-transmission');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-quality',/balanced|high|ultra/);
  await expect(page.locator('#acrylic-variant')).toHaveValue('effect');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-print-layers','1');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-print-placement','innermost');
  expect(Number(await page.locator('#acrylic-viewport').getAttribute('data-print-plane-z'))).toBeLessThan(-0.74);
  await expect(page.locator('#finish-inspector')).toHaveCount(0);
  await page.getByRole('button',{name:'近景'}).click();
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/acrylic-actual-detail.png'});
  await page.getByRole('button',{name:'全景'}).click();
  const premiumSurface=await page.locator('#acrylic-viewport').screenshot();
  await page.getByRole('button', { name: '基础款', exact: true }).click();
  await page.locator('#acrylic-preview-card').screenshot({ path: 'output/playwright/acrylic-basic.png' });
  const basicSurface = await page.locator('#acrylic-viewport').screenshot();
  const difference=await page.evaluate(async ({ first,second })=>{
    const decode=(src)=>new Promise(resolve=>{const image=new Image(); image.onload=()=>resolve(image); image.src=src;});
    const [a,b]=await Promise.all([decode(first),decode(second)]);
    const canvas=document.createElement('canvas'); canvas.width=a.width; canvas.height=a.height;
    const context=canvas.getContext('2d'); context.drawImage(a,0,0); const ap=context.getImageData(0,0,a.width,a.height).data;
    context.drawImage(b,0,0); const bp=context.getImageData(0,0,a.width,a.height).data;
    let visiblyChanged=0;
    for(let i=0;i<ap.length;i+=4) if(Math.abs(ap[i]-bp[i])+Math.abs(ap[i+1]-bp[i+1])+Math.abs(ap[i+2]-bp[i+2])>45) visiblyChanged++;
    return visiblyChanged;
  },{first:'data:image/png;base64,'+premiumSurface.toString('base64'),second:'data:image/png;base64,'+basicSurface.toString('base64')});
  expect(difference).toBeGreaterThan(250);
  await page.getByRole('button', { name: '特效款', exact: true }).click();
  await expect(page.locator('#acrylic-variant')).toHaveValue('effect');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-variant', 'effect');
  const uvSurface = await page.locator('#acrylic-viewport').screenshot();
  expect(basicSurface.equals(uvSurface)).toBe(false);
  await page.getByRole('button', { name: '特效款', exact: true }).click();
  await expect(page.locator('#acrylic-variant')).toHaveValue('effect');
  await page.locator('#acrylic-preview-card').screenshot({ path: 'output/playwright/acrylic-premium.png' });
  const originalLight = await page.locator('#acrylic-viewport').screenshot();
  const dial=page.locator('#acrylic-light-angle');
  await dial.scrollIntoViewIfNeeded();
  const dialBox=await dial.boundingBox();
  await page.mouse.move(dialBox.x+dialBox.width/2,dialBox.y+dialBox.height/2);
  await page.mouse.down();
  await page.mouse.move(dialBox.x+dialBox.width/2+100,dialBox.y+dialBox.height/2,{steps:12});
  await page.mouse.up();
  await expect(dial).toHaveAttribute('aria-valuenow','15');
  await expect(page.locator('#acrylic-light-value')).toHaveText('15°');
  const movedLight = await page.locator('#acrylic-viewport').screenshot();
  expect(originalLight.equals(movedLight)).toBe(false);
  await page.locator('#acrylic-preview-card').screenshot({ path: 'output/playwright/acrylic-light-moved.png' });
  const quotedBefore=await page.locator('#acrylic-total .price-current').textContent();
  await page.getByRole('button',{name:'镭射卡',exact:true}).click();
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-product','card');
  await expect(page.locator('.acrylic-variants')).toBeHidden();
  await expect(page.locator('#acrylic-material-detail')).toContainText('彩色镭射覆膜');
  await expect(page.locator('#acrylic-total .price-current')).toHaveText(quotedBefore);
  const cardStyle=await page.locator('#acrylic-viewport').screenshot({path:'output/playwright/card-style-before.png'});
  await page.locator('[data-finish="basic"]').click();
  const cardAfter=await page.locator('#acrylic-viewport').screenshot({path:'output/playwright/card-style-after.png'});
  const cardStyleError=await page.evaluate(async({before,after})=>{
    const decode=src=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.src=src;});
    const [a,b]=await Promise.all([decode(before),decode(after)]);
    const c=document.createElement('canvas');c.width=a.width;c.height=a.height;const ctx=c.getContext('2d');
    ctx.drawImage(a,0,0);const ap=ctx.getImageData(0,0,a.width,a.height).data;
    ctx.drawImage(b,0,0);const bp=ctx.getImageData(0,0,a.width,a.height).data;
    let delta=0;for(let i=0;i<ap.length;i+=4)for(let n=0;n<3;n++)delta+=Math.abs(ap[i+n]-bp[i+n]);
    return delta/(a.width*a.height*3);
  },{before:'data:image/png;base64,'+cardStyle.toString('base64'),after:'data:image/png;base64,'+cardAfter.toString('base64')});
  expect(cardStyleError).toBeLessThan(1);
  await page.getByRole('button',{name:'近景'}).click();
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/laser-card-60.png'});
  await dial.focus();
  await page.keyboard.press('Home');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/laser-card-minus150.png'});
  const cardDark=await page.locator('#acrylic-viewport').screenshot();
  for(let i=0;i<13;i++)await page.keyboard.press('PageUp');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/laser-card-45.png'});
  expect(cardDark.equals(await page.locator('#acrylic-viewport').screenshot())).toBe(false);
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-reverse-material','black-cardstock');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-reverse-texture','fine-card-grain');
  await page.locator('#acrylic-viewport canvas').focus();
  for(let i=0;i<26;i++)await page.keyboard.press('ArrowLeft');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/card-black-reverse.png'});
  await page.getByRole('button',{name:'全景'}).click();
  await page.getByRole('button',{name:'色纸',exact:true}).click();
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-product','shikishi');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-reverse-texture','paper-fibers');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/shikishi-material.png'});
  const paperBefore=await page.locator('#acrylic-viewport').screenshot();
  await dial.focus();await page.keyboard.press('Home');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/shikishi-light-angle.png'});
  expect(paperBefore.equals(await page.locator('#acrylic-viewport').screenshot())).toBe(false);
  await page.locator('[data-finish="effect"]').click();
  await page.getByRole('button',{name:'亚克力砖',exact:true}).click();
  await expect(page.locator('.acrylic-variants')).toBeVisible();
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-product','acrylic');
  await page.getByRole('button',{name:'全景'}).click();
  await page.locator('#acrylic-viewport canvas').focus();
  for(let i=0;i<8;i++)await page.keyboard.press('ArrowLeft');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/acrylic-side-single-layer.png'});
  await page.getByRole('button',{name:'全景'}).click();
  expect(shaderErrors).toEqual([]);
  const sceneCanvas = page.locator('#acrylic-viewport canvas');
  await sceneCanvas.scrollIntoViewIfNeeded();
  const beforeZoom=Number(await page.locator('#acrylic-viewport').getAttribute('data-camera-distance'));
  await sceneCanvas.hover();
  await page.mouse.wheel(0,-400);
  await expect.poll(async()=>Number(await page.locator('#acrylic-viewport').getAttribute('data-camera-distance'))).toBeLessThan(beforeZoom);
  await page.getByRole('button',{name:'全景'}).click();
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await sceneCanvas.scrollIntoViewIfNeeded();
  const box=await sceneCanvas.boundingBox();
  const cx=box.x+box.width/2,cy=box.y+box.height/2;
  const beforePinch=Number(await page.locator('#acrylic-viewport').getAttribute('data-camera-distance'));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-40,y:cy,id:1},{x:cx+40,y:cy,id:2}]});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-85,y:cy,id:1},{x:cx+85,y:cy,id:2}]});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>Number(await page.locator('#acrylic-viewport').getAttribute('data-camera-distance'))).toBeLessThan(beforePinch);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await cdp.detach();
  await page.getByRole('button',{name:'全景'}).click();
  await sceneCanvas.focus();
  for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowDown');
  await page.locator('#acrylic-preview-card').screenshot({ path: 'output/playwright/acrylic-lowest-angle.png' });
  await page.getByRole('button', { name: '全景' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#acrylic-preview-card').screenshot({ path: 'output/playwright/acrylic-mobile.png' });
  await expect(page.locator('.bg.circle')).toHaveCount(1);
  const download = page.waitForEvent('download');
  await page.locator('#acrylic-export').click();
  const draft = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(draft.design.playerName).toBe('最新设计');
  expect(draft.design.ratingValue).toBe(12345);
  await page.getByRole('link', { name: '返回编辑器' }).click();
  await expect(name(page)).toHaveValue('最新设计');
  await expect(rating(page)).toHaveValue('12345');
});
test('purchase presets select products, update newcomer prices and export all items', async ({page})=>{
  await ready(page);
  await page.goto('/custom-order.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#acrylic-preview-status')).toBeHidden();
  await expect(page.locator('.configuration-panel img')).toHaveCount(0);
  await expect(page.locator('#bundle-presets')).toHaveCount(0);
  await expect(page.locator('.configuration-image')).toHaveCount(7);
  await expect(page.locator('[data-config="display"]')).toHaveCount(0);
  const powderSlots=await page.evaluate(async()=>{
    const {readCurrentDesign}=await import('/src/current-design.js');
    const {createCollectibleMasks}=await import('/src/collectible-masks.js');
    const maps=await createCollectibleMasks(readCurrentDesign());
    return maps.entries.filter(entry=>entry.powderPixels>0).map(entry=>entry.slot);
  });
  for(const slot of ['nameplate','rank','friendBattle'])expect(powderSlots).toContain(slot);
  for(const slot of ['titleBase','ratingFrame'])expect(powderSlots).not.toContain(slot);
  await expect(page.locator('[data-config-image="acrylic"]').first()).toHaveAttribute('src',/^data:image\/png/);
  await expect(page.locator('[data-config-image="complete"]').first()).toHaveAttribute('data-products','acrylic,card,shikishi');
  await expect(page.locator('[data-config-image="shikishi"]').first()).toHaveAttribute('data-products','shikishi');
  const transparentProduct=await page.locator('[data-config-image="complete"]').evaluate(async image=>{
    await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>128)visible++;
    return pixels[3]===0&&visible>500;
  });
  expect(transparentProduct).toBe(true);
  await expect(page.locator('.configuration-choice')).toHaveCount(7);
  await expect(page.locator('.configuration-panel:visible')).toHaveCount(1);
  await expect(page.locator('.purchase-product-caption')).toHaveCount(0);
  await page.locator('[data-finish="basic"]').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#acrylic-variant')).toHaveValue('basic');
  await expect(page.locator('[data-finish="basic"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-finish="effect"]').click();
  await page.locator('[data-config="shikishi"]').click();
  await expect(page.locator('#buy-shikishi')).toBeChecked();
  await expect(page.locator('#buy-acrylic')).not.toBeChecked();
  await expect(page.locator('.purchase-options')).toBeHidden();
  await expect(page.locator('#acrylic-total .price-current')).toHaveText('¥29.90');
  await page.locator('#shikishi-quantity').fill('2');
  await expect(page.locator('#acrylic-total .price-current')).toHaveText('¥49.80');
  await page.locator('[data-config="cardPaper"]').click();
  await expect(page.locator('#acrylic-total .price-current')).toHaveText('¥39.90');
  await expect(page.locator('.configuration-panel:visible')).toHaveCount(1);
  await page.locator('[data-config="shikishi"]').click();
  await expect(page.locator('#shikishi-quantity')).toHaveValue('2');
  await page.locator('#shikishi-quantity').fill('1');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-product','shikishi');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/shikishi-material.png'});
  const paperBefore=await page.locator('#acrylic-viewport').screenshot();
  await page.locator('#acrylic-light-angle').focus();
  for(let i=0;i<4;i++)await page.keyboard.press('PageUp');
  const paperAfter=await page.locator('#acrylic-viewport').screenshot();
  expect(paperAfter.equals(paperBefore)).toBe(false);
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/shikishi-light-angle.png'});
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-reverse-material','ivory-paper');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-reverse-texture','paper-fibers');
  await page.locator('#acrylic-viewport canvas').focus();
  for(let i=0;i<26;i++)await page.keyboard.press('ArrowLeft');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/shikishi-paper-reverse.png'});
  await page.getByRole('button',{name:'全景'}).click();
  await expect(page.locator('#acrylic-newcomer')).toHaveCount(0);
  await expect(page.locator('#acrylic-total .price-current')).toHaveText('¥29.90');
  await expect(page.locator('[data-config="shikishi"] .price-current')).toHaveText('¥24.90');
  await expect(page.locator('[data-config="shikishi"] del')).toHaveCount(0);
  await expect(page.locator('[data-config="shikishi"] .price-shipping')).toHaveText('运费 ¥5.00');
  await expect(page.locator('#shikishi-product-price del')).toHaveCount(0);
  await expect(page.locator('#purchase-lines')).toContainText('¥5.00');
  for(const [id,basic,effect] of [['duo','49.90','59.90'],['acrylicPaper','59.90','69.90']]){
    await page.locator(`[data-config="${id}"]`).click();
    await expect(page.locator('[data-finish="basic"] .price-current')).toHaveText(`¥${basic} / 份`);
    await expect(page.locator('[data-finish="effect"] strong')).toHaveText('特效款');
    await expect(page.locator('[data-finish="effect"] .price-current')).toHaveText(`¥${effect} / 份`);
  }
  await page.locator('[data-config="complete"]').click();
  await expect(page.locator('[data-finish="basic"] .price-current')).toHaveText('¥74.90 / 份');
  await expect(page.locator('[data-finish="effect"] .price-current')).toHaveText('¥84.90 / 份');
  await expect(page.locator('#acrylic-total .price-current')).toHaveText('¥84.90');
  await expect(page.locator('[data-config="complete"] .config-price')).toHaveClass(/is-offer/);
  await expect(page.locator('[data-config="complete"] del')).toHaveText('¥83.70');
  await expect(page.locator('[data-config="complete"] .price-current')).toHaveText('¥74.90 起 / 份');
  await expect(page.locator('#bundle-quantity')).toBeVisible();
  for(const id of ['acrylic-quantity','acrylic-cards','shikishi-quantity']){await expect(page.locator('#'+id)).toBeHidden();await expect(page.locator('#'+id)).toBeDisabled();}
  await page.locator('#bundle-quantity').fill('2');
  await expect(page.locator('#acrylic-total .price-current')).toHaveText('¥169.80');
  await expect(page.locator('[data-config="complete"] .price-current')).toHaveText('¥74.90 起 / 份');
  for(const id of ['acrylic-quantity','acrylic-cards','shikishi-quantity'])await expect(page.locator('#'+id)).toHaveValue('2');
  await page.locator('[data-config="cardPaper"]').click();await expect(page.locator('#bundle-quantity')).toHaveValue('1');
  await page.locator('[data-config="complete"]').click();await expect(page.locator('#bundle-quantity')).toHaveValue('2');
  await expect(page.locator('#acrylic-accessory')).toHaveValue('clearStand');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-product','acrylic');
  await page.locator('#custom-order').screenshot({path:'output/playwright/purchase-desktop.png'});
  const download=page.waitForEvent('download');await page.locator('#acrylic-export').click();
  const draft=JSON.parse(await readFile(await(await download).path(),'utf8'));
  expect(draft.items.map(item=>item.type)).toEqual(['acrylic-brick','clear-stand','holographic-card','shikishi']);
  expect(draft.items.map(item=>item.quantity)).toEqual([2,2,2,2]);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#custom-order').screenshot({path:'output/playwright/purchase-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.locator('[data-config="shikishi"]').click();
  await page.locator('#shikishi-quantity').fill('0');
  await expect(page.locator('#acrylic-export')).toBeDisabled();
  await expect(page.locator('#purchase-message')).toContainText('至少选择一件商品');
  await page.locator('[data-config="card"]').click();
  await page.locator('[data-config="shikishi"]').click();
  await expect(page.locator('#shikishi-quantity')).toBeVisible();
  await page.locator('#shikishi-quantity').fill('1');
  await expect(page.locator('#acrylic-export')).toBeEnabled();
});

test('special plate lettering masks emphasize all four collectible families',async({page})=>{
  await ready(page);await page.goto('/custom-order.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#acrylic-preview-status')).toBeHidden();
  const counts=await page.evaluate(async()=>{
    const {readCurrentDesign}=await import('/src/current-design.js');
    const {createCollectibleMasks}=await import('/src/collectible-masks.js');
    const result=[];
    for(const id of ['559101','559102','559103','559104']) {
      const state=readCurrentDesign();state.files.nameplate=`assets/nameplates/UI_Plate_${id}.png`;
      const maps=await createCollectibleMasks(state);
      const entry=maps.entries.find(entry=>entry.slot==='nameplate');
      result.push({lettering:entry.letteringPixels,powder:entry.powderPixels});
    }
    return result;
  });
  for(const count of counts) {
    expect(count.lettering).toBeGreaterThan(50);
    expect(count.powder).toBeGreaterThan(50);
    expect(count.powder).toBeLessThan(717*116*4*0.24+1);
  }
});

test('direct order-page visit asks for a design instead of showing someone else’s default', async ({ page }) => {
  await page.goto('/custom-order.html');
  await expect(page.locator('#design-status')).toContainText('还没有可用的上屏设计');
  await expect(page.locator('#order-preview-shell')).toBeHidden();
  await expect(page.locator('#acrylic-export')).toBeDisabled();
});

test('order preview continues when the optional display font is rejected', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.FontFaceSet.prototype.load;
    window.FontFaceSet.prototype.load = function (font, ...rest) {
      if (String(font).includes('SEGA Maru Gothic DB'))
        return Promise.reject(new window.DOMException('font decode failed', 'NetworkError'));
      return original.call(this, font, ...rest);
    };
  });
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.goto('/custom-order.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#design-status')).toBeHidden();
  await expect(page.locator('#acrylic-viewport canvas')).toBeVisible();
});

test('component powder and reflection masks follow source pixels with reflection only on white',async({page})=>{
  await ready(page);await page.goto('/custom-order.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#acrylic-preview-status')).toBeHidden();
  const results=await page.evaluate(async()=>{
    const {readCurrentDesign}=await import('/src/current-design.js');
    const {createCollectibleMasks}=await import('/src/collectible-masks.js');
    const {createRenderer}=await import('/src/renderer.js');
    const {slots}=await import('/src/config.js');
    const results=[];
    for(const id of ['nameplate','friendBattle','rank','titleBase','ratingFrame']) {
      const state=readCurrentDesign();state.visible=Object.fromEntries(Object.keys(slots).map(key=>[key,key===id]));
      const maps=await createCollectibleMasks(state);
      const original=createRenderer(document.createElement('canvas'));await original.render(state,{strict:true});
      const canvas=document.createElement('canvas');canvas.width=maps.packed.width;canvas.height=maps.packed.height;
      const context=canvas.getContext('2d');context.drawImage(original.renderCanvas,0,0,canvas.width,canvas.height);
      const art=context.getImageData(0,0,canvas.width,canvas.height).data;
      const mask=maps.packed.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let coloredReflection=0,powder=0,whiteReflection=0,titleCoverageErrors=0,badgeCoverageErrors=0;
      const density=maps.entries.find(entry=>entry.slot===id)?.powder;
      for(let i=0;i<mask.length;i+=4) {
        if(mask[i+1]>12)powder++;
        if(id==='titleBase'&&mask[i+1]>0)titleCoverageErrors++;
        if(['rank','friendBattle'].includes(id)&&art[i+3]>250) {
          const expected=mask[i]>0?0:Math.round(art[i+3]*density);
          if(Math.abs(mask[i+1]-expected)>1)badgeCoverageErrors++;
        }
        if(mask[i]>12) {
          whiteReflection++;
          const r=art[i],g=art[i+1],b=art[i+2];
          if(Math.min(r,g,b)<215||Math.max(r,g,b)-Math.min(r,g,b)>22)coloredReflection++;
        }
      }
      results.push({id,powder,whiteReflection,coloredReflection,titleCoverageErrors,badgeCoverageErrors});
      original.renderCanvas.width=1;
    }
    return results;
  });
  for(const item of results) {
    if(['titleBase','ratingFrame'].includes(item.id))expect(item.powder,item.id).toBe(0);else expect(item.powder,item.id).toBeGreaterThan(0);
    expect(item.coloredReflection,item.id).toBe(0);
    expect(item.titleCoverageErrors,item.id+' full-board powder').toBe(0);
    expect(item.badgeCoverageErrors,item.id+' powder except white strokes').toBe(0);
  }
  expect(results.reduce((total,item)=>total+item.whiteReflection,0)).toBeGreaterThan(50);
});

test('title white lettering reflects without powder or title-board pearl',async({page})=>{
  await ready(page);
  const result=await page.evaluate(async()=>{
    const {createDefaultState}=await import('/src/model.js');
    const {createCollectibleMasks}=await import('/src/collectible-masks.js');
    const {createRenderer}=await import('/src/renderer.js');
    const {slots}=await import('/src/config.js');
    const state=createDefaultState();
    state.visible=Object.fromEntries(Object.keys(slots).map(id=>[id,['titleBase','titleText'].includes(id)]));
    const maps=await createCollectibleMasks(state);
    state.visible.titleBase=false;
    const renderer=createRenderer(document.createElement('canvas'));await renderer.render(state,{strict:true});
    const glyphs=document.createElement('canvas');glyphs.width=maps.packed.width;glyphs.height=maps.packed.height;
    const ctx=glyphs.getContext('2d');ctx.drawImage(renderer.renderCanvas,0,0,glyphs.width,glyphs.height);
    const letters=ctx.getImageData(0,0,glyphs.width,glyphs.height).data;
    const mask=maps.packed.getContext('2d').getImageData(0,0,glyphs.width,glyphs.height).data;
    const pearl=maps.componentCoverage.getContext('2d').getImageData(0,0,glyphs.width,glyphs.height).data;
    let glyphPixels=0,coatedGlyphs=0,boardPixels=0,whiteReflection=0,pearlLeaks=0;
    for(let i=0;i<mask.length;i+=4) {
      if(letters[i+3]>250){glyphPixels++;if(mask[i+1]>0)coatedGlyphs++;if(mask[i]>12)whiteReflection++;if(pearl[i]>5)pearlLeaks++;}
      else if(pearl[i]>200)boardPixels++;
    }
    return {glyphPixels,coatedGlyphs,boardPixels,whiteReflection,pearlLeaks};
  });
  expect(result.glyphPixels).toBeGreaterThan(100);
  expect(result.coatedGlyphs).toBe(0);
  expect(result.whiteReflection).toBeGreaterThan(100);
  expect(result.pearlLeaks).toBe(0);
  expect(result.boardPixels).toBeGreaterThan(1000);
});

test('generated finishes remain visible in the final acrylic and paper render',async({page})=>{
  await ready(page);
  const output=await page.evaluate(async()=>{
    const {createDefaultState}=await import('/src/model.js');
    const {createRenderer}=await import('/src/renderer.js');
    const {createCollectibleMasks}=await import('/src/collectible-masks.js');
    const {createAcrylicPreview}=await import('/src/acrylic-preview.js');
    const finishUrl=new URL('/src/finish-settings.js',location.origin);finishUrl.search=new URL(document.querySelector('script[src*="app.js"]').src).search;
    const {uniforms}=await import(finishUrl.href);
    for(const key of ['pearlStrength','titlePearlStrength','avatarPearlStrength','rankPearlStrength','battlePearlStrength'])uniforms['lab_'+key].value=0;
    const state=createDefaultState(),art=createRenderer(document.createElement('canvas'));
    await art.render(state,{strict:true});
    const maps=await createCollectibleMasks(state);
    const host=document.createElement('div');Object.assign(host.style,{width:'1000px',height:'600px',position:'fixed',left:'-1100px'});document.body.append(host);
    const viewer=createAcrylicPreview(host,{snapshot:true});
    const original=maps.packed.getContext('2d').getImageData(0,0,maps.packed.width,maps.packed.height);
    const packed=(red,green)=>{
      const c=document.createElement('canvas');c.width=maps.packed.width;c.height=maps.packed.height;
      const ctx=c.getContext('2d'),data=ctx.createImageData(c.width,c.height);data.data.set(original.data);
      for(let i=0;i<data.data.length;i+=4){if(!red)data.data[i]=0;if(!green)data.data[i+1]=0;}
      ctx.putImageData(data,0,0);return c;
    };
    const decode=async src=>{const image=new Image();image.src=src;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    const metrics=[],images=[];
    for(const width of [1000,360]) {
    host.style.width=width+'px';host.style.height=(width===1000?600:300)+'px';
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    for(const product of ['acrylic','paper']) {
      const config={variant:'effect',quantity:product==='acrylic'?1:0,shikishiQuantity:product==='paper'?1:0,cardQuantity:0,accessory:'none'};
      let firstPowderDifference;
      for(const angle of [0,75]) {
        viewer.setLightAngle(angle);
        const frames={};
        for(const [mode,channels] of Object.entries({none:[false,false],powder:[false,true],uv:[true,false]})) {
          viewer.setDesign(art.renderCanvas,{...maps,packed:packed(...channels)});
          frames[mode]=viewer.captureConfiguration(config);
          if(angle===75) {
            // Keep geometry/material/program alive: this matches dragging the light dial.
            viewer.setLightAngle(0);
            const before=await decode(viewer.captureFrame());
            viewer.setLightAngle(75);
            const after=await decode(viewer.captureFrame());
            frames[mode]=viewer.captureFrame();
            if(mode==='powder') {
              let changed=0;
              for(let i=0;i<before.length;i+=4)if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>18)changed++;
              metrics.push({width,product,angle,mode:'live-light-update',visible:changed});
            }
          }
        }
        const reference=await decode(frames.none);
        for(const mode of ['powder','uv']) {
          const pixels=await decode(frames[mode]);let visible=0,total=0;
          for(let i=0;i<pixels.length;i+=4){const delta=Math.abs(pixels[i]-reference[i])+Math.abs(pixels[i+1]-reference[i+1])+Math.abs(pixels[i+2]-reference[i+2]);if(delta>12)visible++;total+=delta;}
          metrics.push({width,product,angle,mode,visible,total});
          if(mode==='powder') {
            const difference=new Int16Array(pixels.length);
            for(let i=0;i<pixels.length;i+=4)for(let c=0;c<3;c++)difference[i+c]=pixels[i+c]-reference[i+c];
            if(!firstPowderDifference)firstPowderDifference=difference;
            else {
              let lightResponsive=0;
              for(let i=0;i<difference.length;i+=4)if(Math.abs(difference[i]-firstPowderDifference[i])+Math.abs(difference[i+1]-firstPowderDifference[i+1])+Math.abs(difference[i+2]-firstPowderDifference[i+2])>18)lightResponsive++;
              metrics.push({width,product,angle,mode:'powder-light-response',visible:lightResponsive});
            }
          }
        }
        const noBackground=document.createElement('canvas');noBackground.width=maps.componentCoverage.width;noBackground.height=maps.componentCoverage.height;
        const noBackgroundContext=noBackground.getContext('2d');noBackgroundContext.fillStyle='#fff';noBackgroundContext.fillRect(0,0,noBackground.width,noBackground.height);
        viewer.setDesign(art.renderCanvas,{...maps,packed:packed(false,false),componentCoverage:noBackground});
        const noGlitter=await decode(viewer.captureConfiguration(config));let glitterVisible=0;
        for(let i=0;i<noGlitter.length;i+=4)if(Math.abs(noGlitter[i]-reference[i])+Math.abs(noGlitter[i+1]-reference[i+1])+Math.abs(noGlitter[i+2]-reference[i+2])>12)glitterVisible++;
        metrics.push({width,product,angle,mode:'glitter',visible:glitterVisible});
        if(angle===0)images.push({product:product+'-'+width,none:frames.none,powder:frames.powder,uv:frames.uv});
      }
    }
    }
    viewer.dispose();host.remove();art.renderCanvas.width=1;
    return {metrics,images};
  });
  await test.info().attach('finish-render-metrics',{body:JSON.stringify(output.metrics,null,2),contentType:'application/json'});
  await writeFile('output/playwright/finish-render-metrics.json',JSON.stringify(output.metrics,null,2));
  for(const image of output.images)for(const mode of ['none','powder','uv'])await writeFile(`output/playwright/${image.product}-${mode}.png`,Buffer.from(image[mode].split(',')[1],'base64'));
  for(const width of [1000,360])for(const product of ['acrylic','paper'])for(const mode of ['powder','uv','glitter','powder-light-response','live-light-update']) {
    const views=output.metrics.filter(item=>item.width===width&&item.product===product&&item.mode===mode);
    // Approved density is 61%; title/rating powder is intentionally absent.
    const minimum=mode==='powder'?(width===1000?2500:350):mode==='glitter'?(width===1000?2500:350):mode==='live-light-update'?(width===1000?1500:180):mode==='powder-light-response'?Math.max(...output.metrics.filter(item=>item.width===width&&item.product===product&&item.mode==='powder').map(item=>item.visible))*0.15:(width===1000?200:25);
    expect(Math.max(...views.map(item=>item.visible)),`${width} ${product} ${mode}`).toBeGreaterThan(minimum);
    if(mode==='uv')expect(Math.abs(views[0].total-views[1].total),`${width} ${product} lighting response`).toBeGreaterThan(50);
  }
});

test('editor and product preview work without a local assets directory',async({page})=>{
  const localRequests=[];
  page.on('request',request=>{const url=new URL(request.url());if(url.hostname==='127.0.0.1'&&url.pathname.startsWith('/assets/'))localRequests.push(url.pathname);});
  await ready(page);
  expect(await page.evaluate(()=>[...document.fonts].some(font=>font.family.includes('SEGA Maru Gothic DB')&&font.status==='loaded'))).toBe(true);
  const defaults=await exportState(page);
  for(const url of Object.values(defaults.state.files))expect(url).toMatch(/^https:\/\/maimai-diy-assets-1517578456\.cos\.ap-shanghai\.myqcloud\.com\/materials\//);
  await page.goto('/custom-order.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#acrylic-preview-status')).toBeHidden();
  await expect(page.locator('#acrylic-viewport canvas')).toBeVisible();
  expect(localRequests).toEqual([]);
});


test('approved pearl settings affect all five regions without background leakage',async({page})=>{
  await ready(page);
  const result=await page.evaluate(async()=>{
    const {createAcrylicPreview}=await import('/src/acrylic-preview.js');
    const {createDefaultState}=await import('/src/model.js');
    const {createRenderer}=await import('/src/renderer.js');
    const {createCollectibleMasks}=await import('/src/collectible-masks.js');
    const finishUrl=new URL('/src/finish-settings.js',location.origin);finishUrl.search=new URL(document.querySelector('script[src*="app.js"]').src).search;
    const {FINISH_PARAMETERS,uniforms}=await import(finishUrl.href);
    const settings={values:{...FINISH_PARAMETERS},applyParameters(input){Object.assign(this.values,input);for(const [key,value]of Object.entries(input))uniforms['lab_'+key].value=value;}};
    const saved={...settings.values};
    const host=document.createElement('div');Object.assign(host.style,{width:'1000px',height:'600px',position:'fixed',left:'-1200px'});document.body.append(host);
    const art=createRenderer(document.createElement('canvas'));const state=createDefaultState();await art.render(state,{strict:true});
    const maps=await createCollectibleMasks(state);const viewer=createAcrylicPreview(host,{snapshot:true});
    const decode=async src=>{const image=new Image();image.src=src;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    const diffs=[];
    try{
      settings.applyParameters({...saved,powderStrength:0,powderContrast:0,glitterStrength:0,uvStrength:0,titlePearlStrength:0,avatarPearlStrength:0,rankPearlStrength:0,battlePearlStrength:0});
      viewer.setDesign(art.renderCanvas,maps);
      for(const angle of [0,75]){
        viewer.setLightAngle(angle);const images=[];
        for(const strength of [0,saved.pearlStrength]){settings.applyParameters({...settings.values,pearlStrength:strength});images.push(await decode(viewer.captureConfiguration({variant:'effect',quantity:1,cardQuantity:0,shikishiQuantity:0,accessory:'none'})));}
        const diff=new Int16Array(images[0].length);let visible=0;
        for(let i=0;i<diff.length;i+=4){let delta=0;for(let c=0;c<3;c++){diff[i+c]=images[1][i+c]-images[0][i+c];delta+=Math.abs(diff[i+c]);}if(delta>3)visible++;}
        diffs.push({diff,visible});
      }
      let angular=0;for(let i=0;i<diffs[0].diff.length;i+=4)if(Math.abs(diffs[0].diff[i]-diffs[1].diff[i])+Math.abs(diffs[0].diff[i+1]-diffs[1].diff[i+1])+Math.abs(diffs[0].diff[i+2]-diffs[1].diff[i+2])>3)angular++;
      const regions={};
      for(const key of ['titlePearlStrength','avatarPearlStrength','rankPearlStrength','battlePearlStrength']) {
        const images=[];
        for(const strength of [0,saved[key]]){
          settings.applyParameters({...settings.values,pearlStrength:0,titlePearlStrength:0,avatarPearlStrength:0,rankPearlStrength:0,battlePearlStrength:0,[key]:strength});
          images.push(await decode(viewer.captureConfiguration({variant:'effect',quantity:1,cardQuantity:0,shikishiQuantity:0,accessory:'none'})));
        }
        let visible=0;for(let i=0;i<images[0].length;i+=4)if(Math.abs(images[0][i]-images[1][i])+Math.abs(images[0][i+1]-images[1][i+1])+Math.abs(images[0][i+2]-images[1][i+2])>3)visible++;
        if(visible<20)throw Error(key+' has no visible effect');regions[key]=visible;
      }
      settings.applyParameters({...settings.values,titlePearlStrength:0,avatarPearlStrength:0,rankPearlStrength:0,battlePearlStrength:0});
      const coverage=document.createElement('canvas');coverage.width=maps.packed.width;coverage.height=maps.packed.height;const ctx=coverage.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,coverage.width,coverage.height);
      viewer.setDesign(art.renderCanvas,{...maps,componentCoverage:coverage});const covered=[];
      for(const strength of [0,1]){settings.applyParameters({...settings.values,pearlStrength:strength});covered.push(await decode(viewer.captureConfiguration({variant:'effect',quantity:1,cardQuantity:0,shikishiQuantity:0,accessory:'none'})));}
      let leaks=0;for(let i=0;i<covered[0].length;i++)if(covered[0][i]!==covered[1][i])leaks++;
      if(Math.max(...diffs.map(d=>d.visible))<1000||angular<300||leaks)throw Error(JSON.stringify({visible:diffs.map(d=>d.visible),angular,leaks}));
      return {visible:diffs.map(d=>d.visible),angular,regions,componentLeaks:leaks};
    }finally{settings.applyParameters(saved);viewer.dispose();host.remove();art.renderCanvas.width=1;}
  });
  expect(result.componentLeaks).toBe(0);
  for(const count of Object.values(result.regions))expect(count).toBeGreaterThan(20);
});

test('acrylic reverse is opaque beige and shikishi has a paper easel',async({page})=>{
  await ready(page);
  const result=await page.evaluate(async()=>{
    const {createAcrylicPreview}=await import('/src/acrylic-preview.js');
    const host=document.createElement('div');host.id='reverse-test';Object.assign(host.style,{width:'1000px',height:'600px',position:'fixed',left:'-1100px'});document.body.append(host);
    const source=document.createElement('canvas');source.width=2160;source.height=904;
    const packed=document.createElement('canvas');packed.width=2160;packed.height=904;
    const componentCoverage=document.createElement('canvas');componentCoverage.width=2160;componentCoverage.height=904;
    const badgeCoverage=document.createElement('canvas');badgeCoverage.width=2160;badgeCoverage.height=904;
    const maps={packed,componentCoverage,badgeCoverage};
    const viewer=createAcrylicPreview(host,{snapshot:true});
    const images=[];
    for(const color of ['#ff0000','#0000ff']){
      source.getContext('2d').fillStyle=color;source.getContext('2d').fillRect(0,0,source.width,source.height);viewer.setDesign(source,maps);
      if(!images.length)for(let i=0;i<26;i++)host.querySelector('canvas').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
      images.push(viewer.captureFrame());
    }
    const decode=async src=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    const a=await decode(images[0]),b=await decode(images[1]);let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>9)changed++;
    const reverse=host.dataset.reverseMaterial;
    viewer.setSelection({variant:'effect',cardOnly:false,shikishi:true,accessory:'none'});const paperStand=host.dataset.paperStand,paperImage=viewer.captureFrame();
    viewer.dispose();host.remove();return {changed,reverse,paperStand,reverseImage:images[0],paperImage};
  });
  expect(result.reverse).toBe('opaque-ivory');expect(result.changed).toBeLessThan(60);expect(result.paperStand).toBe('folded-cardstock');
  await writeFile('output/playwright/opaque-acrylic-back.png',Buffer.from(result.reverseImage.split(',')[1],'base64'));
  await writeFile('output/playwright/shikishi-paper-easel.png',Buffer.from(result.paperImage.split(',')[1],'base64'));
});

test('finishes respond to orbiting the camera with lights fixed',async({page})=>{
  await ready(page);
  const metrics=await page.evaluate(async()=>{
    const {createAcrylicPreview}=await import('/src/acrylic-preview.js');
    const settingsUrl=new URL('/src/finish-settings.js',location.origin);settingsUrl.search=new URL(document.querySelector('script[src*="app.js"]').src).search;
    const {uniforms}=await import(settingsUrl.href);const saved=Object.fromEntries(Object.entries(uniforms).map(([k,v])=>[k,v.value]));
    const host=document.createElement('div');Object.assign(host.style,{width:'800px',height:'480px',position:'fixed',left:'-900px'});document.body.append(host);
    const canvas=color=>{const c=document.createElement('canvas');c.width=1080;c.height=452;if(color){const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,c.width,c.height);}return c;};
    const source=canvas('#5785a3'),maps={packed:canvas('#ffff00'),componentCoverage:canvas(),badgeCoverage:canvas()};
    const viewer=createAcrylicPreview(host,{snapshot:true});const metrics=[];
    const decode=async src=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    const strengths=['powderStrength','uvStrength','glitterStrength','pearlStrength','titlePearlStrength','avatarPearlStrength','rankPearlStrength','battlePearlStrength'];
    try{
      viewer.setDesign(source,maps);viewer.setLightAngle(0);
      for(const product of ['acrylic','paper']){
        viewer.setSelection({variant:'effect',shikishi:product==='paper',cardOnly:false,accessory:'none'});
        for(const mode of ['powderStrength','uvStrength','glitterStrength','pearlStrength']){
          viewer.focusCollectibles();const energies=[];
          for(let pose=0;pose<3;pose++){
            if(pose)for(let i=0;i<4;i++)host.querySelector('canvas').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
            strengths.forEach(key=>uniforms['lab_'+key].value=0);uniforms.lab_powderContrast.value=0;
            const base=await decode(viewer.captureFrame());uniforms['lab_'+mode].value=saved['lab_'+mode];
            const coated=await decode(viewer.captureFrame());let delta=0,area=0;
            for(let i=0;i<base.length;i+=4)if(base[i+3]>200){area++;delta+=Math.abs(coated[i]-base[i])+Math.abs(coated[i+1]-base[i+1])+Math.abs(coated[i+2]-base[i+2]);}
            energies.push(delta/Math.max(area,1));
          }
          metrics.push({product,mode,energies,variation:(Math.max(...energies)-Math.min(...energies))/Math.max(...energies,0.001)});
        }
      }
    }finally{for(const [key,value]of Object.entries(saved))uniforms[key].value=value;viewer.dispose();host.remove();}
    return metrics;
  });
  await writeFile('output/playwright/view-angle-finish-metrics.json',JSON.stringify(metrics,null,2));
  for(const metric of metrics){expect(Math.max(...metric.energies),JSON.stringify(metric)).toBeGreaterThan(0.1);expect(metric.variation,JSON.stringify(metric)).toBeGreaterThan(0.06);}
});

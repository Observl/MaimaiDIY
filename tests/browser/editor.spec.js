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
  page.on('console', (message) => {
    if (message.type() === 'error' && /THREE.WebGLProgram|Shader Error|VALIDATE_STATUS/.test(message.text())) shaderErrors.push(message.text());
  });
  await ready(page);
  await name(page).fill('最新设计');
  await rating(page).fill('12345');
  await expect(page.locator('#custom-order')).toHaveCount(0);
  const entry = page.locator('.support-merch-link');
  await expect(entry).toHaveAttribute('href', 'custom-order.html');
  const sizes = await entry.evaluate((element) => ({
    button: element.getBoundingClientRect().width,
    parent: element.parentElement.clientWidth,
    padding: parseFloat(getComputedStyle(element.parentElement).paddingLeft) * 2,
  }));
  expect(Math.abs(sizes.button - (sizes.parent - sizes.padding))).toBeLessThan(2);
  await entry.click();
  await expect(page).toHaveURL(/custom-order\.html$/);
  await expect(page.locator('#design-status')).toHaveText('已自动载入你最近编辑的上屏设计。');
  await expect(page.locator('#order-preview-shell')).toBeVisible();
  await expect(page.locator('#acrylic-preview-status')).toBeHidden();
  await expect(page.locator('#acrylic-viewport canvas')).toBeVisible();
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-variant', 'premium');
  await expect(page.locator('#acrylic-variant')).toHaveValue('premium');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-print-layers','2');
  await expect(page.locator('#finish-inspector')).toHaveCount(0);
  await page.getByRole('button',{name:'收藏品近景'}).click();
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/acrylic-actual-detail.png'});
  await page.getByRole('button',{name:'复位视角'}).click();
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
  await page.getByRole('button', { name: '轻量特效款', exact: true }).click();
  await expect(page.locator('#acrylic-variant')).toHaveValue('light');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-variant', 'light');
  const uvSurface = await page.locator('#acrylic-viewport').screenshot();
  expect(basicSurface.equals(uvSurface)).toBe(false);
  await page.getByRole('button', { name: '高配特效款', exact: true }).click();
  await expect(page.locator('#acrylic-variant')).toHaveValue('premium');
  await page.locator('#acrylic-preview-card').screenshot({ path: 'output/playwright/acrylic-premium.png' });
  const originalLight = await page.locator('#acrylic-viewport').screenshot();
  const dial=page.locator('#acrylic-light-angle');
  await dial.scrollIntoViewIfNeeded();
  const dialBox=await dial.boundingBox();
  await page.mouse.move(dialBox.x+dialBox.width/2,dialBox.y+dialBox.height/2);
  await page.mouse.down();
  await page.mouse.move(dialBox.x+dialBox.width/2+100,dialBox.y+dialBox.height/2,{steps:12});
  await page.mouse.up();
  await expect(dial).toHaveAttribute('aria-valuenow','60');
  await expect(page.locator('#acrylic-light-value')).toHaveText('60°');
  const movedLight = await page.locator('#acrylic-viewport').screenshot();
  expect(originalLight.equals(movedLight)).toBe(false);
  await page.locator('#acrylic-preview-card').screenshot({ path: 'output/playwright/acrylic-light-moved.png' });
  const quotedBefore=await page.locator('#acrylic-total').textContent();
  await page.getByRole('button',{name:'镭射卡',exact:true}).click();
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-product','card');
  await expect(page.locator('.acrylic-variants')).toBeHidden();
  await expect(page.locator('#acrylic-material-detail')).toContainText('彩色镭射覆膜');
  await expect(page.locator('#acrylic-total')).toHaveText(quotedBefore);
  const cardStyle=await page.locator('#acrylic-viewport').screenshot({path:'output/playwright/card-style-before.png'});
  await page.locator('#acrylic-variant').selectOption('basic');
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
  await page.getByRole('button',{name:'收藏品近景'}).click();
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/laser-card-60.png'});
  await dial.focus();
  await page.keyboard.press('Home');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/laser-card-minus150.png'});
  const cardDark=await page.locator('#acrylic-viewport').screenshot();
  for(let i=0;i<13;i++)await page.keyboard.press('PageUp');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/laser-card-45.png'});
  expect(cardDark.equals(await page.locator('#acrylic-viewport').screenshot())).toBe(false);
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-reverse-material','black-cardstock');
  await page.locator('#acrylic-viewport canvas').focus();
  for(let i=0;i<26;i++)await page.keyboard.press('ArrowLeft');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/card-black-reverse.png'});
  await page.getByRole('button',{name:'复位视角'}).click();
  await page.locator('#acrylic-variant').selectOption('premium');
  await page.getByRole('button',{name:'亚克力砖',exact:true}).click();
  await expect(page.locator('.acrylic-variants')).toBeVisible();
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-product','acrylic');
  await page.getByRole('button',{name:'复位视角'}).click();
  await page.locator('#acrylic-viewport canvas').focus();
  for(let i=0;i<8;i++)await page.keyboard.press('ArrowLeft');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/acrylic-side-two-layers.png'});
  await page.getByRole('button',{name:'复位视角'}).click();
  expect(shaderErrors).toEqual([]);
  const sceneCanvas = page.locator('#acrylic-viewport canvas');
  await sceneCanvas.scrollIntoViewIfNeeded();
  const beforeZoom=Number(await page.locator('#acrylic-viewport').getAttribute('data-camera-distance'));
  await sceneCanvas.hover();
  await page.mouse.wheel(0,-400);
  await expect.poll(async()=>Number(await page.locator('#acrylic-viewport').getAttribute('data-camera-distance'))).toBeLessThan(beforeZoom);
  await page.getByRole('button',{name:'复位视角'}).click();
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const box=await sceneCanvas.boundingBox();
  const cx=box.x+box.width/2,cy=box.y+box.height/2;
  const beforePinch=Number(await page.locator('#acrylic-viewport').getAttribute('data-camera-distance'));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-40,y:cy,id:1},{x:cx+40,y:cy,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-85,y:cy,id:1},{x:cx+85,y:cy,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>Number(await page.locator('#acrylic-viewport').getAttribute('data-camera-distance'))).toBeLessThan(beforePinch);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await cdp.detach();
  await page.getByRole('button',{name:'复位视角'}).click();
  await sceneCanvas.focus();
  for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowDown');
  await page.locator('#acrylic-preview-card').screenshot({ path: 'output/playwright/acrylic-lowest-angle.png' });
  await page.getByRole('button', { name: '复位视角' }).click();
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
  await page.locator('.support-merch-link').click();
  await expect(page.locator('#acrylic-preview-status')).toBeHidden();
  await page.locator('[data-bundle="shikishi"]').click();
  await expect(page.locator('#buy-shikishi')).toBeChecked();
  await expect(page.locator('#buy-acrylic')).not.toBeChecked();
  await expect(page.locator('#acrylic-total')).toHaveText('¥24.99');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-product','shikishi');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/shikishi-material.png'});
  const paperBefore=await page.locator('#acrylic-viewport').screenshot();
  await page.locator('#acrylic-light-angle').focus();
  for(let i=0;i<4;i++)await page.keyboard.press('PageUp');
  const paperAfter=await page.locator('#acrylic-viewport').screenshot();
  expect(paperAfter.equals(paperBefore)).toBe(false);
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/shikishi-light-angle.png'});
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-reverse-material','ivory-paper');
  await page.locator('#acrylic-viewport canvas').focus();
  for(let i=0;i<26;i++)await page.keyboard.press('ArrowLeft');
  await page.locator('#acrylic-preview-card').screenshot({path:'output/playwright/shikishi-paper-reverse.png'});
  await page.getByRole('button',{name:'复位视角'}).click();
  await page.locator('#acrylic-newcomer').check();
  await expect(page.locator('#acrylic-total')).toHaveText('¥21.99');
  await expect(page.locator('#purchase-lines')).toContainText('¥5.00');
  await page.locator('[data-bundle="complete"]').click();
  await expect(page.locator('#acrylic-total')).toHaveText('¥77.97');
  await expect(page.locator('#acrylic-accessory')).toHaveValue('clearStand');
  await expect(page.locator('#acrylic-viewport')).toHaveAttribute('data-product','acrylic');
  await page.locator('#custom-order').screenshot({path:'output/playwright/purchase-desktop.png'});
  const download=page.waitForEvent('download');await page.locator('#acrylic-export').click();
  const draft=JSON.parse(await readFile(await(await download).path(),'utf8'));
  expect(draft.items.map(item=>item.type)).toEqual(['acrylic-brick','clear-stand','holographic-card','shikishi']);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#custom-order').screenshot({path:'output/playwright/purchase-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  for(const id of ['buy-acrylic','buy-card','buy-shikishi'])await page.locator('#'+id).uncheck();
  await expect(page.locator('#acrylic-export')).toBeDisabled();
  await expect(page.locator('#purchase-message')).toContainText('至少选择一件商品');
});

test('direct order-page visit asks for a design instead of showing someone else’s default', async ({ page }) => {
  await page.goto('/custom-order.html');
  await expect(page.locator('#design-status')).toContainText('还没有可用的上屏设计');
  await expect(page.locator('#order-preview-shell')).toBeHidden();
  await expect(page.locator('#acrylic-export')).toBeDisabled();
});

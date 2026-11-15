import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDefaultState } from '../../src/model.js';
import { CURRENT_DESIGN_KEY } from '../../src/current-design.js';
import { REGION_BASE_URL, REGION_CATEGORIES } from '../../src/region-index.js';
import { buildRegionalIndex } from '../../tools/build-region-index.mjs';

test.use({ serviceWorkers: 'block' });
const longTitle = '这是一个超出称号框宽度需要滚动播放才能完整看清的很长称号 ABCDEFG';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64');
async function fixtures(context) {
  const catalogs = Object.fromEntries(['cn', 'jp'].map(region => [region, {
    schemaVersion: 1, region, version: 'test', generatedAt: '2026-11-08T00:00:00Z', sources: [],
    availability: { art: 'test' }, ...Object.fromEntries(REGION_CATEGORIES.map(category => [category, []])),
  }]));
  const { files } = buildRegionalIndex({ catalogs });
  const prefix = new URL(REGION_BASE_URL).pathname;
  await context.route('https://**/*', route => {
    const path = new URL(route.request().url()).pathname;
    const indexed = path.startsWith(prefix) && files.get(path.slice(prefix.length));
    if (indexed) return route.fulfill({body:indexed,contentType:'application/json',headers:{'access-control-allow-origin':'*'}});
    const json = path.endsWith('/manifest.json') ? {schemaVersion:1,categories:[]}
      :path.endsWith('/badges.json')?{schemaVersion:1,categories:[]}
        :path.endsWith('/titles.json')?{schemaVersion:1,items:[{id:'titles/900003',name:longTitle,color:'Gold'},{id:'titles/900004',name:'短称号',color:'Gold'}]}
          :path.endsWith('/recommendations.json')?{version:1,items:[]}:null;
    return route.fulfill(json ? {json,headers:{'access-control-allow-origin':'*'}}
      :/\.(png|webp|jpg)$/.test(path)?{body:png,contentType:'image/png',headers:{'access-control-allow-origin':'*'}}:{status:404});
  });
  await context.route('**/data/regions/visibility-20261108.json*', route => route.fulfill({json:{
    schemaVersion:1,snapshotDate:'2026-11-08',sources:[],cnReleased:{frames:{},plates:{},icons:{},titles:{}},
    cnReviewed:{titles:['900003','900004']},jpIdentified:{frames:[],plates:[],icons:[],charas:[]},
  }}));
}
const titlePixels = page => page.locator('#preview').evaluate(canvas => {
  const data=canvas.getContext('2d').getImageData(145,111,260,25).data;
  return Array.from(data).join(',');
});
test('long titles scroll, enlarged preview moves, selection warns, PNG stays a static snapshot', async ({page,context},info) => {
  await fixtures(context);
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('.controls-summary').click();
  await page.locator('[data-control="title"] .library-button').click();
  await page.locator('[data-asset-id="titles/900003"]').click();
  await expect(page.locator('#picker-message')).toContainText('静态图片');
  await expect(page.locator('#title-overflow-notice')).toBeVisible();
  await page.locator('#picker-close').click();
  const initial=await titlePixels(page);
  await expect.poll(()=>titlePixels(page),{timeout:6000}).not.toBe(initial);
  await page.locator('#preview').click();
  const large = page.locator('#large-preview canvas');
  const first=await large.evaluate(c=>c.toDataURL());
  await expect.poll(()=>large.evaluate(c=>c.toDataURL()),{timeout:6000}).not.toBe(first);
  await page.keyboard.press('Escape');
  const download=page.waitForEvent('download'); await page.locator('#export').click();
  const bytes=await readFile(await(await download).path());
  expect(bytes.readUInt32BE(16)).toBe(2160);expect(bytes.readUInt32BE(20)).toBe(904);
  expect(bytes.includes(Buffer.from('acTL'))).toBe(false);
  await page.screenshot({path:info.outputPath('title-scroll.png'),fullPage:true});
  await page.locator('[data-control="title"] .library-button').click();
  await page.locator('[data-asset-id="titles/900004"]').click();
  await expect(page.locator('#title-overflow-notice')).toBeHidden();
  await page.locator('#picker-close').click();
  const short=await titlePixels(page);await page.waitForTimeout(1800);expect(await titlePixels(page)).toBe(short);
});

test('isolated static renderers never animate and animated renderers stop after disposal', async ({page})=>{
  await page.route('**/app.js*',route=>route.abort());await page.route('https://**/*',route=>route.abort());
  await page.goto('/');
  const result=await page.evaluate(async title=>{
    const {createRenderer}=await import('/src/renderer.js');
    const {createDefaultState}=await import('/src/model.js');
    const state=createDefaultState();Object.keys(state.visible).forEach(k=>state.visible[k]=k==='titleText');state.titleName=title;
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=452;
    let frames=0;
    const renderer=createRenderer(canvas,{scale:1,onFrame:()=>frames++});await renderer.render(state);
    await new Promise(r=>setTimeout(r,1700));const staticFrames=frames;
    const moving=createRenderer(canvas,{scale:1,animateTitles:true,onFrame:()=>frames++});await moving.render(state);
    await new Promise(r=>setTimeout(r,250));moving.dispose();const stopped=frames;
    await new Promise(r=>setTimeout(r,250));return {staticFrames,stopped,final:frames,overflow:renderer.titleOverflow};
  },longTitle);
  expect(result.staticFrames).toBe(0);expect(result.stopped).toBeGreaterThan(0);expect(result.final).toBe(result.stopped);expect(result.overflow).toBe(true);
});

test('product page continues scrolling the design and updates its live 3D texture',async({page,context},info)=>{
  await fixtures(context);
  const state=createDefaultState();state.titleName=longTitle;
  await context.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify({version:1,state})),{key:CURRENT_DESIGN_KEY,state});
  await page.goto('/custom-order.html');
  await expect(page.locator('#acrylic-preview-status')).toBeHidden();
  await expect(page.locator('#title-overflow-notice')).toBeVisible();
  const a=await titlePixels(page);await expect.poll(()=>titlePixels(page),{timeout:6000}).not.toBe(a);
  const viewport=page.locator('#acrylic-viewport');
  await expect.poll(()=>viewport.getAttribute('data-design-frame'),{timeout:6000}).not.toBe(null);
  const frame=await viewport.getAttribute('data-design-frame');
  await expect.poll(()=>viewport.getAttribute('data-design-frame'),{timeout:6000}).not.toBe(frame);
  await page.screenshot({path:info.outputPath('title-product.png'),fullPage:true});
});

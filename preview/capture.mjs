import {chromium} from 'playwright';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
await mkdir('polish-evidence',{recursive:true});
const browser=await chromium.launch();
const css=await readFile('preview/refinement.css','utf8');
for (const width of [1440,390]) {
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',deviceScaleFactor:1});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://observl.github.io/MaimaiDIY/',{waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:90000});
 await page.locator('#asset-status').filter({hasText:/云端|缓存/}).waitFor({timeout:90000});
 await page.locator('.controls-summary').click();
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(2500);
 for (const version of ['before','after']) {
  if(version==='after') await page.addStyleTag({content:css});
  await page.screenshot({path:`polish-evidence/${version}-${width}-full.png`,fullPage:true,animations:'disabled'});
  await page.locator('.controls-card').screenshot({path:`polish-evidence/${version}-${width}-controls.png`,animations:'disabled'});
 }
 await writeFile(`polish-evidence/status-${width}.json`,JSON.stringify({url:page.url(),assetStatus:await page.locator('#asset-status').textContent(),errors}));
 await context.close();
}
await browser.close();

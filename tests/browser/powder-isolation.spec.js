import { test, expect } from '@playwright/test';

test('powder changes stay inside the selected finish and leave other surfaces unchanged', async ({ page }) => {
  await page.goto('/custom-order.html', { waitUntil:'domcontentloaded' });
  const result=await page.evaluate(async()=>{
    const previewURL=new URL('/src/acrylic-preview.js',location.href);
    const {createAcrylicPreview}=await import(previewURL.href);
    // Follow the exact versioned imports used by the shader, not a second copy
    // of the uniform module with a different cache-busting query string.
    const previewSource=await (await fetch(previewURL)).text();
    const opticsURL=new URL(previewSource.match(/from ['"]([^'"]*acrylic-optics\.js[^'"]*)['"]/)[1],previewURL);
    const opticsSource=await (await fetch(opticsURL)).text();
    const settingsURL=new URL(opticsSource.match(/from ['"]([^'"]*finish-settings\.js[^'"]*)['"]/)[1],opticsURL);
    const {uniforms}=await import(settingsURL.href);
    const density=uniforms.lab_powderDensity.value;
    const make=color=>{const c=document.createElement('canvas');c.width=1080;c.height=452;if(color){const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,c.width,c.height);}return c;};
    const host=document.createElement('div');Object.assign(host.style,{width:'360px',height:'300px'});document.body.append(host);
    const viewer=createAcrylicPreview(host,{snapshot:true});
    const images={};
    try {
      for(const [label,color,variant] of [['selected','#00ff00','effect'],['matte','#000000','effect'],['protected','#00ffff','effect'],['basic','#00ff00','basic']]) {
        viewer.setDesign(make('#456786'),{packed:make(color),componentCoverage:make(),badgeCoverage:make()});
        viewer.setSelection({variant,cardOnly:false,shikishi:false,accessory:'none'});
        viewer.focusCollectibles();viewer.setLightAngle(15);
        uniforms.lab_powderDensity.value=0;const off=viewer.captureFrame({width:360,background:'#f3eee4'});
        uniforms.lab_powderDensity.value=density;const on=viewer.captureFrame({width:360,background:'#f3eee4'});
        images[label]={off,on};
      }
      return Object.fromEntries(Object.entries(images).map(([label,{off,on}])=>[label,off===on]));
    } finally {uniforms.lab_powderDensity.value=density;viewer.dispose();host.remove();}
  });
  expect(result.selected).toBe(false);
  expect(result.matte).toBe(true);
  expect(result.protected).toBe(true);
  expect(result.basic).toBe(true);
});

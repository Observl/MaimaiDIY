import { test, expect } from '@playwright/test';

for(const effect of ['powder','glitter'])test(`${effect} changes stay in the selected finish and leave other surfaces unchanged`, async ({ page }) => {
  await page.goto('/custom-order.html', { waitUntil:'domcontentloaded' });
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/shader|WebGL|program/i.test(message.text()))errors.push(message.text());});
  const result=await page.evaluate(async(effect)=>{
    const previewURL=new URL('/src/acrylic-preview.js',location.href);
    const {createAcrylicPreview}=await import(previewURL.href);
    // Use the shader's exact versioned module, not a second set of uniforms.
    const previewSource=await (await fetch(previewURL)).text();
    const opticsURL=new URL(previewSource.match(/from ['"]([^'"]*acrylic-optics\.js[^'"]*)['"]/)[1],previewURL);
    const opticsSource=await (await fetch(opticsURL)).text();
    const settingsURL=new URL(opticsSource.match(/from ['"]([^'"]*finish-settings\.js[^'"]*)['"]/)[1],opticsURL);
    const {uniforms}=await import(settingsURL.href);
    const control=uniforms[`lab_${effect}Density`],density=control.value;
    const strength=uniforms[`lab_${effect}Strength`],originalStrength=strength.value;
    const make=color=>{const c=document.createElement('canvas');c.width=1080;c.height=452;if(color){const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,c.width,c.height);}return c;};
    const host=document.createElement('div');Object.assign(host.style,{width:'360px',height:'300px'});document.body.append(host);
    const viewer=createAcrylicPreview(host,{snapshot:true});
    const results={};
    try {
      for(const label of ['selected','excluded','protected','basic','disabled','zero-strength','laser','paper']) {
        const powder=effect==='powder';
        const packed=label==='protected'?'#00ffff':powder&&label!=='excluded'?'#00ff00':'#000000';
        const component=!powder&&label==='excluded'?'#000000':undefined;
        viewer.setDesign(make('#456786'),{packed:make(packed),componentCoverage:make(component),badgeCoverage:make()});
        viewer.setSelection({variant:label==='basic'?'basic':'effect',cardOnly:label==='laser',shikishi:label==='paper',accessory:'none'});
        viewer.focusCollectibles();viewer.setLightAngle(15);uniforms.lab_enabled.value=label==='disabled'?0:1;
        strength.value=label==='zero-strength'?0:originalStrength;
        control.value=0;const off=viewer.captureFrame({width:360,background:'#f3eee4'});
        control.value=density;const on=viewer.captureFrame({width:360,background:'#f3eee4'});
        const again=viewer.captureFrame({width:360,background:'#f3eee4'});
        results[label]={same:off===on,stable:on===again};
      }
      return results;
    } finally {control.value=density;strength.value=originalStrength;uniforms.lab_enabled.value=1;viewer.dispose();host.remove();}
  },effect);
  expect(errors).toEqual([]);
  for(const [label,{same,stable}] of Object.entries(result)) {
    expect(same,`${effect} ${label}`).toBe(!['selected','paper'].includes(label));
    expect(stable,`${effect} ${label} is stationary`).toBe(true);
  }
});

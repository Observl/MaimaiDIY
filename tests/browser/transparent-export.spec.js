import { test, expect } from '@playwright/test';

test('3D export preserves glass alpha, print opacity, light and the live viewport', async ({ page }) => {
  await page.goto('/custom-order.html', { waitUntil: 'domcontentloaded' });
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  const result=await page.evaluate(async()=>{
    const { createAcrylicPreview }=await import('/src/acrylic-preview.js');
    const host=document.createElement('div');Object.assign(host.style,{width:'800px',height:'480px'});document.body.append(host);
    const make=color=>{const c=document.createElement('canvas');c.width=1080;c.height=452;if(color){const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,c.width,c.height);}return c;};
    const source=make('#456786'),maps={packed:make('#ffff00'),componentCoverage:make(),badgeCoverage:make()};
    const viewer=createAcrylicPreview(host,{snapshot:true});viewer.setDesign(source,maps);viewer.focusCollectibles();
    const decode=async data=>{const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {width:c.width,height:c.height,data:ctx.getImageData(0,0,c.width,c.height).data};};
    try {
      const before=viewer.captureFrame({background:'#f3eee4'});
      const cutout=await decode(viewer.captureFrame({width:1600}));
      const transparent=await decode(viewer.captureFrame());
      const after=viewer.captureFrame({background:'#f3eee4'});
      const dark=await decode(viewer.captureFrame({background:'#182234'}));
      const light=await decode(viewer.captureFrame({background:'#edf5fc'}));
      let clear=0,partial=0,opaque=0,backdropResponsive=0;
      for(let i=0;i<transparent.data.length;i+=4){
        const alpha=transparent.data[i+3];if(alpha===0)clear++;else if(alpha<250)partial++;else opaque++;
        if(alpha>10&&alpha<240&&Math.abs(dark.data[i]-light.data[i])+Math.abs(dark.data[i+1]-light.data[i+1])+Math.abs(dark.data[i+2]-light.data[i+2])>30)backdropResponsive++;
      }
      viewer.setLightAngle(60);const changed=viewer.captureFrame({background:'#f3eee4'});
      viewer.setSelection({variant:'basic',cardOnly:false,shikishi:false,accessory:'none'});const basic=await decode(viewer.captureFrame({background:'#f3eee4'}));
      viewer.setSelection({variant:'effect',cardOnly:false,shikishi:false,accessory:'none'});const effect=await decode(viewer.captureFrame({background:'#f3eee4'}));
      let effectPixels=0;for(let i=0;i<basic.data.length;i+=4)if(Math.abs(basic.data[i]-effect.data[i])+Math.abs(basic.data[i+1]-effect.data[i+1])+Math.abs(basic.data[i+2]-effect.data[i+2])>12)effectPixels++;
      return {width:cutout.width,height:cutout.height,viewport:[host.firstChild.width,host.firstChild.height],restored:before===after,lightChanged:before!==changed,clear,partial,opaque,backdropResponsive,effectPixels,cutout:viewer.captureFrame()};
    } finally { viewer.dispose();host.remove(); }
  });
  expect(errors).toEqual([]);
  expect(result.width).toBe(1600); expect(result.height).toBe(960);expect(result.viewport).toEqual([800,480]);
  expect(result.restored).toBe(true);expect(result.lightChanged).toBe(true);
  expect(result.clear).toBeGreaterThan(10000);expect(result.partial).toBeGreaterThan(1000);expect(result.opaque).toBeGreaterThan(5000);
  expect(result.backdropResponsive).toBeGreaterThan(300);expect(result.effectPixels).toBeGreaterThan(1500);
  await test.info().attach('transparent-3d-export',{body:Buffer.from(result.cutout.split(',')[1],'base64'),contentType:'image/png'});
});

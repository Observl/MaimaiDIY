import {test,expect} from '@playwright/test';

for(const mobile of [true,false])test(`${mobile?'mobile':'desktop'} production grains retain visible contrast on light, dark and colored inks`,async({browser})=>{
  const context=await browser.newContext({viewport:{width:mobile?390:1440,height:900},deviceScaleFactor:mobile?3:2,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|program/i.test(m.text()))errors.push(m.text());});
  try {
    await page.goto('/custom-order.html',{waitUntil:'domcontentloaded'});
    const results=await page.evaluate(async(mobile)=>{
      const previewURL=new URL('/src/acrylic-preview.js',location.href);
      const {createAcrylicPreview}=await import(previewURL.href);
      const source=await(await fetch(previewURL)).text();
      const opticsURL=new URL(source.match(/from ['"]([^'"]*acrylic-optics\.js[^'"]*)['"]/)[1],previewURL);
      const optics=await(await fetch(opticsURL)).text();
      const {uniforms}=await import(new URL(optics.match(/from ['"]([^'"]*finish-settings\.js[^'"]*)['"]/)[1],opticsURL).href);
      const saved=Object.fromEntries(Object.entries(uniforms).map(([k,v])=>[k,v.value]));
      const make=color=>{const c=document.createElement('canvas');c.width=1080;c.height=452;if(color){const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,c.width,c.height);}return c;};
      const host=document.createElement('div'),width=mobile?360:960;
      Object.assign(host.style,{width:width+'px',height:Math.round(width*5/6)+'px'});document.body.append(host);
      const viewer=createAcrylicPreview(host);
      const decode=async url=>{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=width;c.height=Math.round(width*5/6);const ctx=c.getContext('2d');ctx.drawImage(img,0,0,c.width,c.height);return ctx.getImageData(0,0,c.width,c.height).data;};
      const results=[];
      try {
        // Wait for the production quality selection, rather than mutating the
        // drawing buffer between the two frames of the on/off comparison.
        for(let i=0;i<100&&!host.dataset.gpuTier;i++)await new Promise(r=>setTimeout(r,50));
        for(const color of ['#121820','#f4f0e8','#bd277b'])for(const paper of [false,true]) {
          // Thin source-like strips exercise derivative quads crossing a mask
          // boundary. The right half remains background-only glitter.
          const packed=make('#000000'),components=make();
          const ctx=packed.getContext('2d');ctx.fillStyle='#00ff00';
          for(let x=0;x<540;x+=8)ctx.fillRect(x,0,5,452);
          const cc=components.getContext('2d');cc.fillStyle='#000';cc.fillRect(0,0,540,452);
          viewer.setDesign(make(color),{packed,componentCoverage:components,badgeCoverage:make()});
          viewer.setSelection({variant:'effect',cardOnly:false,shikishi:paper,accessory:'none'});
          viewer.reset();viewer.setLightAngle(15);
          for(const effect of ['powder','glitter']) {
            for(const [k,v] of Object.entries(saved))uniforms[k].value=v;
            uniforms[`lab_${effect==='powder'?'glitter':'powder'}Density`].value=0;
            const control=uniforms[`lab_${effect}Density`],density=control.value;
            control.value=0;const off=await decode(viewer.captureFrame({background:'#f3eee4'}));
            control.value=density;const image=viewer.captureFrame({background:'#f3eee4'}),on=await decode(image);
            const again=viewer.captureFrame({background:'#f3eee4'});
            let visible=0,strong=0,max=0;
            for(let i=0;i<on.length;i+=4){const d=Math.max(Math.abs(on[i]-off[i]),Math.abs(on[i+1]-off[i+1]),Math.abs(on[i+2]-off[i+2]));if(d>5)visible++;if(d>15)strong++;max=Math.max(max,d);}
            results.push({color,paper,effect,visible,strong,max,stable:image===again,ratio:host.firstChild.width/width});
          }
        }
      } finally {for(const [k,v] of Object.entries(saved))uniforms[k].value=v;viewer.dispose();host.remove();}
      return results;
    },mobile);
    expect(errors).toEqual([]);
    await test.info().attach('displayed-pixel-contrast',{body:Buffer.from(JSON.stringify(results,null,2)),contentType:'application/json'});
    for(const result of results) {
      expect(result.stable,JSON.stringify(result)).toBe(true);
      // A non-identical PNG is insufficient: require a visible population of
      // >5/255 changes in the actual CSS-sized full view, on every tested ink.
      expect(result.visible,JSON.stringify(result)).toBeGreaterThan(mobile?30:150);
      expect(result.max,JSON.stringify(result)).toBeGreaterThan(15);
    }
  } finally {await context.close();}
});

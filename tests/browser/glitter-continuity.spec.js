import {test,expect} from '@playwright/test';

for(const mobile of [true,false])test(`${mobile?'mobile reduced-motion':'desktop'} acrylic glitter fades continuously across both light horizons`,async({browser})=>{
  const context=await browser.newContext({viewport:{width:mobile?360:1280,height:900},deviceScaleFactor:mobile?3:1,isMobile:mobile,hasTouch:mobile,reducedMotion:mobile?'reduce':'no-preference'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|program/i.test(m.text()))errors.push(m.text());});
  try {
    await page.goto('/custom-order.html',{waitUntil:'domcontentloaded'});
    const result=await page.evaluate(async(mobile)=>{
      const previewURL=new URL('/src/acrylic-preview.js',location.href);
      const {createAcrylicPreview}=await import(previewURL.href);
      const source=await(await fetch(previewURL)).text();
      const opticsURL=new URL(source.match(/from ['"]([^'"]*acrylic-optics\.js[^'"]*)['"]/)[1],previewURL);
      const optics=await(await fetch(opticsURL)).text();
      const {uniforms}=await import(new URL(optics.match(/from ['"]([^'"]*finish-settings\.js[^'"]*)['"]/)[1],opticsURL).href);
      const make=color=>{const c=document.createElement('canvas');c.width=1080;c.height=452;if(color){const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,c.width,c.height);}return c;};
      const width=mobile?320:640,height=Math.round(width*5/6),host=document.createElement('div');
      Object.assign(host.style,{width:width+'px',height:height+'px'});document.body.append(host);
      const viewer=createAcrylicPreview(host,{snapshot:true}),density=uniforms.lab_glitterDensity.value;
      const decode=async url=>{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,width,height);return ctx.getImageData(0,0,width,height).data;};
      const capture=()=>viewer.captureFrame({width,background:'#f3eee4'});
      const glitter=async angle=>{
        viewer.setLightAngle(angle);uniforms.lab_glitterDensity.value=0;const off=await decode(capture());
        uniforms.lab_glitterDensity.value=density;const on=await decode(capture());
        return Float32Array.from({length:width*height},(_,i)=>Math.max(0,on[i*4]-off[i*4],on[i*4+1]-off[i*4+1],on[i*4+2]-off[i*4+2]));
      };
      try {
        viewer.setDesign(make('#314b63'),{packed:make('#000000'),componentCoverage:make(),badgeCoverage:make()});
        viewer.setSelection({variant:'effect',cardOnly:false,accessory:'none'});viewer.reset();
        const sweeps=[];
        // Full production shader, isolated by same-angle glitter-on minus off.
        // Both light entries must be tested: the weaker source also used to pop.
        for(const [start,end] of [[-47,-30],[25,42]]) {
          let previous=await glitter(start),peak=0,changed=0,tileMean=0,energyStep=0,peakAngle=start;
          const frames=[];
          for(let angle=start+0.5;angle<=end;angle+=0.5) {
            const next=await glitter(angle),tiles=Array(16).fill(0),counts=Array(16).fill(0);
            let framePeak=0,frameChanged=0,sum=0,energy=0;
            for(let i=0;i<next.length;i++) {
              const d=Math.abs(next[i]-previous[i]),tile=Math.floor((i%width)/width*4)+4*Math.floor(Math.floor(i/width)/height*4);
              framePeak=Math.max(framePeak,d);frameChanged+=d>20?1:0;sum+=next[i]-previous[i];energy+=next[i];tiles[tile]+=d;counts[tile]++;
            }
            if(framePeak>peak){peak=framePeak;peakAngle=angle;}
            changed=Math.max(changed,frameChanged);tileMean=Math.max(tileMean,...tiles.map((x,i)=>x/counts[i]));energyStep=Math.max(energyStep,Math.abs(sum)/next.length);
            frames.push({angle,energy,peak:framePeak,changed:frameChanged});previous=next;
          }
          sweeps.push({start,end,peak,peakAngle,changed,tileMean,energyStep,frames});
        }
        const visible=[];
        for(const angle of [-10,15,60,110]){const field=await glitter(angle);visible.push({angle,count:field.filter(x=>x>5).length,peak:field.reduce((a,b)=>Math.max(a,b),0)});}
        viewer.setLightAngle(15);const first=capture();await new Promise(r=>setTimeout(r,80));const stable=first===capture();
        return {mobile,width,sweeps,visible,stable};
      } finally {uniforms.lab_glitterDensity.value=density;viewer.dispose();host.remove();}
    },mobile);
    await test.info().attach('glitter-frame-sequence',{body:Buffer.from(JSON.stringify(result,null,2)),contentType:'application/json'});
    expect(errors).toEqual([]);expect(result.stable).toBe(true);
    for(const sweep of result.sweeps) {
      expect(sweep.peak,JSON.stringify(sweep)).toBeLessThan(20);
      expect(sweep.changed).toBe(0);
      expect(sweep.tileMean).toBeLessThan(0.35);
    }
    for(const visible of result.visible){expect(visible.count,JSON.stringify(visible)).toBeGreaterThan(mobile?30:120);expect(visible.peak).toBeGreaterThan(15);}
  } finally {await context.close();}
});

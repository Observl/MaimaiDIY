import { CANVAS, slots, COMPOSITION_ORDER } from './config.js';
import { createRenderer } from './renderer.js';
import { collectibleFinish } from './collectible-finishes.js';
import { COLLECTIBLE_MASK_FILES } from './collectible-mask-files.js';
import { loadImage } from './assets.js';

function canvas(width, height) {
  const value = document.createElement('canvas'); value.width = width; value.height = height; return value;
}

export async function createCollectibleMasks(state) {
  const scale = 2, width = CANVAS.width * scale, height = CANVAS.height * scale;
  const packed = canvas(width,height), tint = canvas(width,height);
  const pctx = packed.getContext('2d'), tctx = tint.getContext('2d');
  const data = pctx.createImageData(width,height), colors = tctx.createImageData(width,height);
  const owners=new Uint8Array(width*height), entries=[];
  const layerCanvas = canvas(width,height), layerContext = layerCanvas.getContext('2d', { willReadFrequently: true });
  const region = canvas(width,height), regionContext = region.getContext('2d', { willReadFrequently: true });
  const isolated = createRenderer(canvas(CANVAS.width,CANVAS.height));
  const layers=Array.from({length:4},()=>canvas(width,height));
  const ordered = COMPOSITION_ORDER;
  for (const id of ordered) {
    if (!state.visible[id]) continue;
    const visible = Object.fromEntries(Object.keys(slots).map(key => [key, key === id]));
    await isolated.render({ ...state, visible }, { strict: true });
    layerContext.clearRect(0,0,width,height);
    layerContext.drawImage(isolated.renderCanvas,0,0,width,height);
    const group=id==='background'?0:['nameplate','nameBase','playerName'].includes(id)?1:id==='friendBattle'?3:2;
    layers[group].getContext('2d').drawImage(layerCanvas,0,0);
    const layer = layerContext.getImageData(0,0,width,height).data;
    const profile = collectibleFinish(state,id);
    const entryId=profile ? entries.push({ ...profile, slot:id, name: id.startsWith('title') ? `${state.titleColor==='Gold'?'金色':'银色'}称号「${state.titleName}」` : state.labels[id] || id, uvPixels:0, glitterPixels:0 }) : 0;
    let uvShape, glitterShape;
    if (profile) {
      if(!['titleBase','ratingFrame'].includes(id)) {
        const key=id+'|'+state.files[id].split(/[?#]/)[0].split('/').pop();
        const files=COLLECTIBLE_MASK_FILES[key];
        if(!files) throw Error('Missing independent mask: '+key);
        const images=await Promise.all([loadImage(files.uv),loadImage(files.glitter)]);
        const slot=slots[id];
        const masks=images.map(image=>{
          regionContext.clearRect(0,0,width,height);
          if(id==='titleBase') regionContext.drawImage(image,0,5,image.naturalWidth,25,slot.x*scale,slot.y*scale,slot.width*scale,slot.height*scale);
          else regionContext.drawImage(image,slot.x*scale,slot.y*scale,slot.width*scale,slot.height*scale);
          return regionContext.getImageData(0,0,width,height).data;
        });
        [uvShape,glitterShape]=masks;
      }
    }
    for (let i=0;i<layer.length;i+=4) {
      const alpha=layer[i+3]/255;
      if (!alpha) continue;
      if(alpha>0.5) owners[i/4]=0;
      // Every real layer erases covered effects, including exact text glyphs.
      for(let c=0;c<3;c++) { data.data[i+c]*=1-alpha; colors.data[i+c]*=1-alpha; }
      if(id==='titleText') data.data[i+2]=255*alpha;
      if (!profile) continue;
      // User-selected title text is dynamic; use its rendered glyph alpha, never a template.
      const u=['titleBase','ratingFrame'].includes(id)?alpha:uvShape[i]/255*alpha;
      const g=id==='ratingFrame'?alpha:id==='titleBase'?0:glitterShape[i]/255*alpha;
      if(u>0||g>0) owners[i/4]=entryId;
      data.data[i]=255*profile.uv*u;
      data.data[i+1]=255*profile.glitter*g;
      for(let c=0;c<3;c++) colors.data[i+c]=profile.tint[c]*Math.max(u,g);
    }
  }
  for(let i=3;i<data.data.length;i+=4) { data.data[i]=255; colors.data[i]=255; }
  for(let pixel=0;pixel<owners.length;pixel++) {
    const entry=entries[owners[pixel]-1]; if(!entry) continue;
    if(data.data[pixel*4]>12) entry.uvPixels++;
    if(data.data[pixel*4+1]>12) entry.glitterPixels++;
  }
  pctx.putImageData(data,0,0); tctx.putImageData(colors,0,0);
  const uv = canvas(width,height), glitter = canvas(width,height);
  for(const [target,channel] of [[uv,0],[glitter,1]]) {
    const ctx=target.getContext('2d'), pixels=ctx.createImageData(width,height);
    for(let i=0;i<pixels.data.length;i+=4) {
      pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=data.data[i+channel]; pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);
  }
  // Release the temporary 4x renderer buffers after composing the masks.
  isolated.renderCanvas.width=1; layerCanvas.width=1; region.width=1;
  return { packed,tint,uv,glitter,entries,layers };
}

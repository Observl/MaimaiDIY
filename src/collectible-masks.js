import { CANVAS, slots, COMPOSITION_ORDER } from './config.js';
import { createRenderer } from './renderer.js';
import { collectibleFinish } from './collectible-finishes.js';
import { createSourceFinishMask } from './source-finish-mask.js';
import { COLLECTIBLE_PLATES } from './collectible-catalog.js';
import { createPlateLetteringMask } from './plate-lettering-mask.js';

function canvas(width, height) {
  const value = document.createElement('canvas'); value.width = width; value.height = height; return value;
}

export async function createCollectibleMasks(state) {
  const scale = 2, width = CANVAS.width * scale, height = CANVAS.height * scale;
  const packed = canvas(width,height), tint = canvas(width,height);
  const pctx = packed.getContext('2d'), tctx = tint.getContext('2d');
  const data = pctx.createImageData(width,height), colors = tctx.createImageData(width,height);
  const owners=new Uint8Array(width*height), entries=[];
  const letteringOwners=new Uint8Array(width*height);
  const layerCanvas = canvas(width,height), layerContext = layerCanvas.getContext('2d', { willReadFrequently: true });
  const region = canvas(width,height), regionContext = region.getContext('2d', { willReadFrequently: true });
  const isolated = createRenderer(canvas(CANVAS.width,CANVAS.height));
  const componentCoverage=canvas(width,height);
  const ordered = COMPOSITION_ORDER;
  for (const id of ordered) {
    if (!state.visible[id]) continue;
    const visible = Object.fromEntries(Object.keys(slots).map(key => [key, key === id]));
    await isolated.render({ ...state, visible }, { strict: true });
    layerContext.clearRect(0,0,width,height);
    layerContext.drawImage(isolated.renderCanvas,0,0,width,height);
    if(id!=='background')componentCoverage.getContext('2d').drawImage(layerCanvas,0,0);
    const layer = layerContext.getImageData(0,0,width,height).data;
    const profile = collectibleFinish(state,id);
    const entryId=profile ? entries.push({ ...profile, slot:id, name: id.startsWith('title') ? `${state.titleColor==='Gold'?'金色':'银色'}称号「${state.titleName}」` : state.labels[id] || id, uvPixels:0, glitterPixels:0, letteringPixels:0 }) : 0;
    let uvShape, glitterShape;
    if (profile && id==='nameplate') {
      const slot=slots[id];
      const x=Math.round(slot.x*scale),y=Math.round(slot.y*scale);
      const w=Math.round(slot.width*scale),h=Math.round(slot.height*scale);
      const source=layerContext.getImageData(x,y,w,h);
      const generated=createSourceFinishMask(source.data,w,h);
      const shapes=[generated.uv,generated.glitter].map(mask=>{
        const pixels=regionContext.createImageData(w,h);
        for(let p=0;p<mask.length;p++) {
          pixels.data[p*4]=pixels.data[p*4+1]=pixels.data[p*4+2]=mask[p];
          pixels.data[p*4+3]=255;
        }
        regionContext.clearRect(0,0,width,height);
        regionContext.putImageData(pixels,x,y);
        return regionContext.getImageData(0,0,width,height).data;
      });
      [uvShape,glitterShape]=shapes;
    }
    let letteringShape;
    const plate=id==='nameplate'?COLLECTIBLE_PLATES[state.files[id].match(/UI_Plate_\d+\.png/)?.[0]]:null;
    if(uvShape&&['shogun','kiwami','maimai','god'].includes(plate?.kind)) {
      const slot=slots[id];
      const shape=createPlateLetteringMask(uvShape,width,height,{x:slot.x*scale,y:slot.y*scale,width:slot.width*scale,height:slot.height*scale});
      if(shape.some(Boolean))letteringShape=shape;
    }
    for (let i=0;i<layer.length;i+=4) {
      const alpha=layer[i+3]/255;
      if (!alpha) continue;
      if(alpha>0.5) {owners[i/4]=0;letteringOwners[i/4]=0;}
      // Every real layer erases covered effects, including exact text glyphs.
      for(let c=0;c<3;c++) { data.data[i+c]*=1-alpha; colors.data[i+c]*=1-alpha; }
      if(id==='titleText') data.data[i+2]=255*alpha;
      if (!profile) continue;
      // User-selected title text is dynamic; use its rendered glyph alpha, never a template.
      const u=uvShape?uvShape[i]/255*alpha:alpha;
      // Plate backing never receives a fallback full-surface glitter coat.
      const g=id==='titleBase'?0:id==='nameplate'?(glitterShape?.[i]||0)/255*alpha:alpha;
      const lettering=letteringShape?letteringShape[i/4]/255:0;
      const glitterStrength=letteringShape?profile.glitter+(1-profile.glitter)*lettering:profile.glitter;
      if(u>0||g>0) owners[i/4]=entryId;
      data.data[i]=255*profile.uv*u;
      data.data[i+1]=255*glitterStrength*g;
      if(lettering>0.5)letteringOwners[i/4]=1;
      for(let c=0;c<3;c++) colors.data[i+c]=profile.tint[c]*Math.max(u,g);
    }
  }
  for(let i=3;i<data.data.length;i+=4) { data.data[i]=255; colors.data[i]=255; }
  for(let pixel=0;pixel<owners.length;pixel++) {
    const entry=entries[owners[pixel]-1]; if(!entry) continue;
    if(data.data[pixel*4]>12) entry.uvPixels++;
    if(data.data[pixel*4+1]>12) entry.glitterPixels++;
    if(letteringOwners[pixel])entry.letteringPixels++;
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
  return { packed,tint,uv,glitter,entries,componentCoverage };
}

import {MASK_PARAMETERS} from './finish-settings.js';
import { CANVAS, slots, COMPOSITION_ORDER } from './config.js';
import { createRenderer } from './renderer.js';
import { collectibleFinish } from './collectible-finishes.js';
import { createSourceFinishMask } from './source-finish-mask.js';
import { COLLECTIBLE_PLATES } from './collectible-catalog.js';
import { createPlateLetteringMask } from './plate-lettering-mask.js';
import { createRatingInsetMask } from './rating-inset-mask.js';
import { prepareRegionalDisplay } from './regional-display.js';

function canvas(width, height) {
  const value = document.createElement('canvas'); value.width = width; value.height = height; return value;
}

export async function createCollectibleMasks(state,options=MASK_PARAMETERS,{diagnostics=true}={}) {
  const scale = 2, width = CANVAS.width * scale, height = CANVAS.height * scale;
  const packed = canvas(width,height), tint = diagnostics ? canvas(width,height) : null;
  const pctx = packed.getContext('2d'), tctx = tint?.getContext('2d');
  const data = pctx.createImageData(width,height), colors = tctx?.createImageData(width,height);
  const owners=diagnostics ? new Uint8Array(width*height) : null, entries=[];
  const letteringOwners=diagnostics ? new Uint8Array(width*height) : null;
  const region = canvas(width,height), regionContext = region.getContext('2d', { willReadFrequently: true });
  const isolated = createRenderer(canvas(1,1), {scale, readFrequently:true});
  const layerCanvas = isolated.renderCanvas, layerContext = layerCanvas.getContext('2d');
  const componentCoverage=canvas(width,height);
  const badgeCoverage=canvas(width,height);
  const ordered = COMPOSITION_ORDER;
  for (const id of ordered) {
    // The background is the first layer and carries no authored spot finish.
    if (id==='background' || !state.visible[id]) continue;
    await new Promise(resolve=>setTimeout(resolve,0));
    const visible = Object.fromEntries(Object.keys(slots).map(key => [key, key === id]));
    await isolated.render({ ...state, visible, screenMode: 'collection' }, { strict: true });
    {
      // Alpha tracks all components; red/green identify visible title/avatar pigment.
      // Later components and text occlude these regions in the same composition order.
      regionContext.clearRect(0,0,width,height);regionContext.drawImage(layerCanvas,0,0);
      regionContext.globalCompositeOperation='source-in';
      regionContext.fillStyle=id==='titleBase'?'#ff0000':id==='avatar'?'#00ff00':'#000000';
      regionContext.fillRect(0,0,width,height);regionContext.globalCompositeOperation='source-over';
      componentCoverage.getContext('2d').drawImage(region,0,0);
      regionContext.clearRect(0,0,width,height);regionContext.drawImage(layerCanvas,0,0);
      regionContext.globalCompositeOperation='source-in';
      regionContext.fillStyle=id==='rank'?'#ff0000':id==='friendBattle'?'#00ff00':'#000000';
      regionContext.fillRect(0,0,width,height);regionContext.globalCompositeOperation='source-over';
      badgeCoverage.getContext('2d').drawImage(region,0,0);
    }
    const layer = layerContext.getImageData(0,0,width,height).data;
    const profile = id==='titleText'?{shape:'title-lettering',uv:1,powder:0,tint:[255,255,255]}:collectibleFinish(state,id);
    const entryId=profile ? entries.push({ ...profile, slot:id, name: id.startsWith('title') ? `${state.titleColor==='Gold'?'金色':'银色'}称号「${state.titleName}」` : state.labels[id] || id, uvPixels:0, powderPixels:0, letteringPixels:0 }) : 0;
    let uvShape, powderShape;
    if (profile) {
      const slot=id==='titleText'?slots.titleBase:slots[id];
      const x=Math.round(slot.x*scale),y=Math.round(slot.y*scale);
      const w=Math.round(slot.width*scale),h=Math.round(slot.height*scale);
      const source=layerContext.getImageData(x,y,w,h);
      const generated=createSourceFinishMask(source.data,w,h,{...options,allowWhiteLettering:id==='rank',powderFraction:id==='nameplate'?(options.plateFraction??0.24):(options.componentFraction??0.14)});
      if(id==='titleText')for(let p=0;p<generated.uv.length;p++) {
        const i=p*4,r=source.data[i],g=source.data[i+1],b=source.data[i+2];
        generated.uv[p]=source.data[i+3]>(options.alphaThreshold??96)&&Math.min(r,g,b)>=(options.whiteThreshold??215)&&Math.max(r,g,b)-Math.min(r,g,b)<=(options.whiteTolerance??22)?255:0;
        generated.powder[p]=0;
      }
      if(['titleBase','rank','friendBattle'].includes(id)) {
        // Title board: full coverage. Badges: full real shape except white varnish strokes.
        for(let p=0;p<generated.powder.length;p++)generated.powder[p]=source.data[p*4+3]>0&&(id==='titleBase'||!generated.uv[p])?255:0;
      }
      if(id==='ratingFrame') {
        const inset=createRatingInsetMask(source.data,w,h,options);
        for(let p=0;p<generated.powder.length;p++)generated.powder[p]=source.data[p*4+3]>0&&!inset[p]?255:0;
      }
      // Full-board policies must still leave every selected white stroke powder-free.
      for(let p=0;p<generated.powder.length;p++)if(generated.uv[p])generated.powder[p]=0;
      const shapes=[generated.uv,generated.powder].map(mask=>{
        const pixels=regionContext.createImageData(w,h);
        for(let p=0;p<mask.length;p++) {
          pixels.data[p*4]=pixels.data[p*4+1]=pixels.data[p*4+2]=mask[p];
          pixels.data[p*4+3]=255;
        }
        regionContext.clearRect(0,0,width,height);
        regionContext.putImageData(pixels,x,y);
        return regionContext.getImageData(0,0,width,height).data;
      });
      [uvShape,powderShape]=shapes;
    }
    let letteringShape;
    const plate=id==='nameplate'?COLLECTIBLE_PLATES[state.files[id].match(/UI_Plate_\d+\.png/)?.[0]]:null;
    if(powderShape&&['shogun','kiwami','maimai','god'].includes(plate?.kind)) {
      const slot=slots[id];
      const shape=createPlateLetteringMask(powderShape,width,height,{x:slot.x*scale,y:slot.y*scale,width:slot.width*scale,height:slot.height*scale});
      if(shape.some(Boolean))letteringShape=shape;
    }
    for (let i=0;i<layer.length;i+=4) {
      const alpha=layer[i+3]/255;
      if (!alpha) continue;
      if(diagnostics && alpha>0.5) {owners[i/4]=0;letteringOwners[i/4]=0;}
      // Every real layer erases covered effects, including exact text glyphs.
      const textLayer=['playerName','ratingDigits','titleText'].includes(id),exclusion=options.textProtection??1;
      const eraseAlpha=alpha*(textLayer?exclusion:1);
      for(let c=0;c<3;c++) {
        data.data[i+c]*=1-eraseAlpha;
        if(colors) colors.data[i+c]*=1-eraseAlpha;
      }
      if(['playerName','ratingDigits','titleText'].includes(id))data.data[i+2]=255*alpha*exclusion;
      if (!profile) continue;
      // No full-alpha finish fallback: each component uses its own source-derived contours.
      const u=(uvShape?.[i]||0)/255*alpha;
      const g=(powderShape?.[i]||0)/255*alpha;
      const lettering=letteringShape?letteringShape[i/4]/255:0;
      const powderStrength=letteringShape?profile.powder+(1-profile.powder)*lettering:profile.powder;
      if(diagnostics && (u>0||g>0)) owners[i/4]=entryId;
      data.data[i]=255*profile.uv*u;
      if(id==='titleText')data.data[i+2]*=1-u;
      data.data[i+1]=255*powderStrength*g;
      if(diagnostics && lettering>0.5)letteringOwners[i/4]=1;
      if(colors) for(let c=0;c<3;c++) colors.data[i+c]=profile.tint[c]*Math.max(u,g);
    }
  }
  const display = await prepareRegionalDisplay(state);
  if(display) {
    regionContext.clearRect(0,0,width,height);
    regionContext.save();
    regionContext.imageSmoothingQuality='high';
    regionContext.scale(scale,scale);
    display.draw(regionContext);
    regionContext.restore();
    const artwork = regionContext.getImageData(0,0,width,height).data;
    for(let i=0;i<artwork.length;i+=4) {
      if(!artwork[i+3]) continue;
      data.data[i]=data.data[i+1]=0;
      data.data[i+2]=255;
      if(owners) owners[i/4]=0;
      if(colors) colors.data[i]=colors.data[i+1]=colors.data[i+2]=0;
    }
  }
  for(let i=3;i<data.data.length;i+=4) {
    data.data[i]=255;
    if(colors) colors.data[i]=255;
  }
  // Alpha-composited edges can otherwise reintroduce powder under white varnish.
  for(let i=0;i<data.data.length;i+=4)if(data.data[i]>0)data.data[i+1]=0;
  for(let pixel=0;pixel<(owners?.length ?? 0);pixel++) {
    const entry=entries[owners[pixel]-1]; if(!entry) continue;
    if(data.data[pixel*4]>12) entry.uvPixels++;
    if(data.data[pixel*4+1]>12) entry.powderPixels++;
    if(letteringOwners[pixel])entry.letteringPixels++;
  }
  pctx.putImageData(data,0,0);
  // Release the temporary layer buffers before handing the textures to WebGL.
  isolated.dispose(); layerCanvas.width=1; region.width=1;
  if(!diagnostics) return { packed,componentCoverage,badgeCoverage };
  tctx.putImageData(colors,0,0);
  const uv = canvas(width,height), powder = canvas(width,height);
  for(const [target,channel] of [[uv,0],[powder,1]]) {
    const ctx=target.getContext('2d'), pixels=ctx.createImageData(width,height);
    for(let i=0;i<pixels.data.length;i+=4) {
      pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=data.data[i+channel]; pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);
  }
  return { packed,tint,uv,powder,entries,componentCoverage,badgeCoverage };
}

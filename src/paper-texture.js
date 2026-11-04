import * as THREE from '../vendor/three.module.js';

// Deterministic micro-height and roughness maps; the reverse keeps its plain ink color.
export function createPaperTexture(card=false) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(512,512);
  let seed=card?17621:92731;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<pixels.data.length;i+=4) {
    const value=128+(random()-0.5)*(card?22:58);
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  ctx.lineCap='round';
  for(let i=0;i<(card?1600:2600);i++) {
    const x=random()*512,y=random()*512,length=card?2+random()*5:4+random()*20;
    const angle=random()*Math.PI;
    ctx.strokeStyle=random()>0.5?'rgba(235,235,235,0.2)':'rgba(35,35,35,0.15)';
    ctx.lineWidth=card?0.4:0.5+random()*0.8;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(angle)*length,y+Math.sin(angle)*length);ctx.stroke();
  }
  const bump=new THREE.CanvasTexture(canvas);
  bump.wrapS=bump.wrapT=THREE.RepeatWrapping;bump.repeat.set(card?8:2.5,card?3.3:1.05);
  const roughCanvas=document.createElement('canvas');roughCanvas.width=roughCanvas.height=512;
  const roughCtx=roughCanvas.getContext('2d');roughCtx.fillStyle='#eee';roughCtx.fillRect(0,0,512,512);
  roughCtx.globalAlpha=0.08;roughCtx.drawImage(canvas,0,0);
  const roughness=new THREE.CanvasTexture(roughCanvas);roughness.wrapS=roughness.wrapT=THREE.RepeatWrapping;roughness.repeat.copy(bump.repeat);
  const colorCanvas=document.createElement('canvas');colorCanvas.width=colorCanvas.height=512;
  const colorCtx=colorCanvas.getContext('2d'),colorPixels=ctx.getImageData(0,0,512,512);
  for(let i=0;i<colorPixels.data.length;i+=4) {
    const shade=244+(colorPixels.data[i]-128)*(card?0.08:0.32);
    colorPixels.data[i]=colorPixels.data[i+1]=colorPixels.data[i+2]=shade;
  }
  colorCtx.putImageData(colorPixels,0,0);
  const color=new THREE.CanvasTexture(colorCanvas);color.colorSpace=THREE.SRGBColorSpace;
  color.wrapS=color.wrapT=THREE.RepeatWrapping;color.repeat.copy(bump.repeat);
  return {bump,roughness,color,dispose(){bump.dispose();roughness.dispose();color.dispose();}};
}

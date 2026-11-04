// Derive a per-asset lettering mask from that asset's authored white contours.
// Component outlines are preserved; no rectangular region is painted white.
export function createPlateLetteringMask(rgba,width,height,bounds) {
  const x0=Math.max(0,Math.floor(bounds.x)),y0=Math.max(0,Math.floor(bounds.y));
  const x1=Math.min(width,Math.ceil(bounds.x+bounds.width)),y1=Math.min(height,Math.ceil(bounds.y+bounds.height));
  const result=new Uint8Array(width*height);
  function select(opened) {
    const seed=new Uint8Array(width*height),seen=new Uint8Array(width*height);
    for(let y=y0+1;y<y1-1;y++)for(let x=x0+1;x<x1-1;x++) {
      const p=y*width+x;if(rgba[p*4]<48)continue;
      let keep=true;
      if(opened)for(let dy=-1;dy<=1&&keep;dy++)for(let dx=-1;dx<=1;dx++)if(rgba[((y+dy)*width+x+dx)*4]<48){keep=false;break;}
      if(keep)seed[p]=1;
    }
    let selected=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++) {
      const start=y*width+x;if(!seed[start]||seen[start])continue;
      const component=[start];seen[start]=1;let left=x,right=x,top=y,bottom=y,sumX=0;
      for(let cursor=0;cursor<component.length;cursor++) {
        const p=component[cursor],px=p%width,py=Math.floor(p/width);sumX+=px;
        left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
        for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx=px+dx,ny=py+dy,np=ny*width+nx;
          if(nx>=x0&&nx<x1&&ny>=y0&&ny<y1&&seed[np]&&!seen[np]){seen[np]=1;component.push(np);}
        }
      }
      // Large, tall print contours distinguish the lettering from thin rails and left-side ornaments.
      if(component.length<Math.max(12,bounds.height*bounds.height*0.001)||bottom-top<bounds.height*0.18||right-left>bounds.width*0.72||sumX/component.length<x0+bounds.width*0.5)continue;
      for(const p of component) {
        const px=p%width,py=Math.floor(p/width);
        for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++) {
          const nx=px+dx,ny=py+dy;
          if(dx*dx+dy*dy<=10&&nx>=x0&&nx<x1&&ny>=y0&&ny<y1)result[ny*width+nx]=255;
        }
      }
      selected++;
    }
    return selected;
  }
  if(!select(true))select(false);
  return result;
}

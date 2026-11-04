// Generate independent white effect contours from the current source pixels in memory.
export function createSourceFinishMask(data,width,height) {
  const count=width*height;
  const candidate=new Uint8Array(count), luma=new Float32Array(count), contrast=new Float32Array(count);
  for(let p=0;p<count;p++) {
    const i=p*4,r=data[i],g=data[i+1],b=data[i+2];
    luma[p]=(r+g+b)/3;
    const spread=Math.max(r,g,b)-Math.min(r,g,b);
    const pale=Math.min(r,g,b)>165&&spread<95;
    const gold=r>165&&g>105&&b<175&&r>b*1.12;
    const cool=g>175&&b>180&&r>135&&spread<100;
    if(data[i+3]>96&&(pale||gold||cool)) candidate[p]=1;
  }
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const p=y*width+x; let low=luma[p],high=low;
    for(const [dx,dy] of [[-2,0],[2,0],[0,-2],[0,2],[-1,-1],[1,1]]) {
      const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;
      low=Math.min(low,luma[ny*width+nx]);high=Math.max(high,luma[ny*width+nx]);
    }
    contrast[p]=high-low;
  }
  const uv=new Uint8Array(count), glitter=new Uint8Array(count), seen=new Uint8Array(count);
  for(let start=0;start<count;start++) {
    if(!candidate[start]||seen[start])continue;
    const component=[start]; seen[start]=1;let edge=0;
    for(let cursor=0;cursor<component.length;cursor++) {
      const p=component[cursor],x=p%width,y=Math.floor(p/width);edge+=contrast[p];
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx=x+dx,ny=y+dy,np=ny*width+nx;
        if(nx>=0&&ny>=0&&nx<width&&ny<height&&candidate[np]&&!seen[np]){seen[np]=1;component.push(np);}
      }
    }
    // Reject broad flat backing regions and isolated compression noise.
    const contourOnly=component.length>count*0.28;
    if(component.length<3||(!contourOnly&&edge/component.length<12))continue;
    for(const p of component) {
      if(contourOnly&&contrast[p]<16)continue;
      uv[p]=255;
      if(luma[p]>170&&contrast[p]>14) glitter[p]=255;
    }
  }
  // Per-source contrast ranking keeps flat backing colors out of the selected foil.
  for(const [mask,maxFraction] of [[uv,0.24],[glitter,0.14]]) {
    const selected=[];for(let p=0;p<count;p++)if(mask[p])selected.push(p);
    const limit=Math.floor(count*maxFraction);
    if(selected.length>limit) {
      selected.sort((a,b)=>contrast[b]-contrast[a]||luma[b]-luma[a]);
      mask.fill(0);for(const p of selected.slice(0,limit))mask[p]=255;
    }
  }
  return {uv,glitter};
}


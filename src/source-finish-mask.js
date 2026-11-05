// Trace thin, neutral-white strokes. Broad white backing and colored foil are matte.
export function createWhiteOutlineMask(data,width,height,options={}) {
  const {alphaThreshold=96,whiteThreshold=215,whiteTolerance=22,maxStroke=8,boundaryContrast=48}=options;
  const white=new Uint8Array(width*height),result=new Uint8Array(width*height);
  for(let p=0;p<white.length;p++) {
    const i=p*4,r=data[i],g=data[i+1],b=data[i+2];
    white[p]=data[i+3]>alphaThreshold&&Math.min(r,g,b)>=whiteThreshold&&Math.max(r,g,b)-Math.min(r,g,b)<=whiteTolerance?1:0;
  }
  function distance(x,y,dx,dy) {
    for(let n=1;n<=Math.max(1,Math.ceil(maxStroke)-2);n++) {
      const nx=x+dx*n,ny=y+dy*n;
      if(nx<0||ny<0||nx>=width||ny>=height||!white[ny*width+nx])return n;
    }
    return 99;
  }
  function boundary(x,y) {
    if(x<0||y<0||x>=width||y>=height)return [0,0,0,0];
    return data.subarray((y*width+x)*4,(y*width+x)*4+4);
  }
  function isStroke(x,y,dx,dy) {
    const left=distance(x,y,-dx,-dy),right=distance(x,y,dx,dy);
    if(left+right>maxStroke)return false;
    const a=boundary(x-dx*left,y-dy*left),b=boundary(x+dx*right,y+dy*right);
    if((a[3]>alphaThreshold)!==(b[3]>alphaThreshold))return true;
    // White glyphs can have the same dark outline on both sides.
    if(options.allowWhiteLettering&&a[3]>alphaThreshold&&b[3]>alphaThreshold)return true;
    return a[3]>alphaThreshold&&b[3]>alphaThreshold&&Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2])>boundaryContrast;
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const p=y*width+x;if(!white[p])continue;
    // Rank artwork uses white glyph fills as well as thin rims. Include the exact
    // neutral-white source pixels even where a thick glyph exceeds the rim width.
    if(options.allowWhiteLettering){result[p]=255;continue;}
    // Both sides must terminate nearby, rather than merely tracing a white panel edge.
    if(isStroke(x,y,1,0)||isStroke(x,y,0,1))result[p]=255;
  }
  return result;
}

// Independent powder and white-outline masks, generated in memory from each source.
export function createSourceFinishMask(data,width,height,options={}) {
  const {powderFraction=0.14,alphaThreshold=96,edgeRadius=2,minComponent=3,componentContrast=12,contourFraction=0.28,contourContrast=16,contrastThreshold=14}=options;
  const count=width*height;
  const candidate=new Uint8Array(count), luma=new Float32Array(count), contrast=new Float32Array(count);
  for(let p=0;p<count;p++) {
    const i=p*4,r=data[i],g=data[i+1],b=data[i+2];
    luma[p]=(r+g+b)/3;
    const spread=Math.max(r,g,b)-Math.min(r,g,b);
    const pale=Math.min(r,g,b)>165&&spread<95;
    const gold=r>165&&g>105&&b<175&&r>b*1.12;
    const cool=g>175&&b>180&&r>135&&spread<100;
    const colored=spread>35&&luma[p]>45;
    if(data[i+3]>alphaThreshold&&(pale||gold||cool||colored)) candidate[p]=1;
  }
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const p=y*width+x; let low=luma[p],high=low;
    for(const [dx,dy] of [[-edgeRadius,0],[edgeRadius,0],[0,-edgeRadius],[0,edgeRadius],[-1,-1],[1,1]]) {
      const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;
      low=Math.min(low,luma[ny*width+nx]);high=Math.max(high,luma[ny*width+nx]);
    }
    contrast[p]=high-low;
  }
  const powder=new Uint8Array(count), seen=new Uint8Array(count);
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
    const contourOnly=component.length>count*contourFraction;
    if(component.length<minComponent||(!contourOnly&&edge/component.length<componentContrast))continue;
    for(const p of component) {
      if(contourOnly&&contrast[p]<contourContrast)continue;
      if(luma[p]>45&&contrast[p]>contrastThreshold) powder[p]=255;
    }
  }
  // Per-source contrast ranking keeps flat backing colors out of the selected foil.
  for(const [mask,maxFraction] of [[powder,powderFraction]]) {
    const selected=[];for(let p=0;p<count;p++)if(mask[p])selected.push(p);
    const limit=Math.floor(count*maxFraction);
    if(selected.length>limit) {
      selected.sort((a,b)=>contrast[b]-contrast[a]||luma[b]-luma[a]);
      mask.fill(0);for(const p of selected.slice(0,limit))mask[p]=255;
    }
  }
  const uv=createWhiteOutlineMask(data,width,height,options);
  // White strokes have their own clear finish, never additive glitter particles.
  for(let p=0;p<count;p++)if(uv[p])powder[p]=0;
  return {uv,powder};
}


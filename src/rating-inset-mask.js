// Find the neutral dark number well in the actual rating artwork, not a shared rectangle.
export function createRatingInsetMask(data,width,height,{insetBrightness=165}={}) {
  const seen=new Uint8Array(width*height),result=new Uint8Array(width*height);
  let best=[],score=0;
  const candidate=p=>{
    const i=p*4,r=data[i],g=data[i+1],b=data[i+2];
    return data[i+3]>96&&Math.max(r,g,b)<insetBrightness&&Math.max(r,g,b)-Math.min(r,g,b)<65;
  };
  for(let start=0;start<seen.length;start++) {
    if(seen[start]||!candidate(start))continue;
    const points=[start];seen[start]=1;let sumX=0;
    for(let cursor=0;cursor<points.length;cursor++) {
      const p=points[cursor],x=p%width,y=Math.floor(p/width);sumX+=x;
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx=x+dx,ny=y+dy,np=ny*width+nx;
        if(nx<0||ny<0||nx>=width||ny>=height||seen[np]||!candidate(np))continue;
        seen[np]=1;points.push(np);
      }
    }
    if(sumX/points.length>width*0.5&&points.length>score){best=points;score=points.length;}
  }
  // Close internal separator strokes and glyph holes, keeping the well's row contours.
  const left=new Int32Array(height).fill(width),right=new Int32Array(height).fill(-1);
  for(const p of best){const x=p%width,y=Math.floor(p/width);left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);}
  for(let y=0;y<height;y++)for(let x=left[y];x<=right[y];x++)result[y*width+x]=255;
  return result;
}

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { COLLECTIBLE_PLATES } from '../src/collectible-catalog.js';

// Authoring only. Install sharp in output/mask-tools; the website loads static SVGs.
const root=process.cwd();
const require=createRequire(resolve(root,'output/mask-tools/package.json'));
const sharp=require('sharp');
const output=resolve(root,'assets/finish-masks');
await mkdir(output,{recursive:true});
const jobs=[];
for(const [file,item] of Object.entries(COLLECTIBLE_PLATES)) jobs.push({key:'nameplate|'+file,name:item.name,candidates:[resolve(root,'../nameplates',file),resolve(root,'assets/nameplates',file)]});
for(let n=12;n<=23;n++) {const file=String(n).padStart(2,'0')+'.png';jobs.push({key:'rank|'+file,name:'rank-'+n,candidates:[resolve(root,'assets/ranks',file)]});}
for(let n=10;n<=25;n++) {const file=String(n).padStart(2,'0')+'.png';jobs.push({key:'friendBattle|'+file,name:'battle-'+n,candidates:[resolve(root,'assets/friend-battles',file)]});}
for(const color of ['Gold','Silver']) {const file=`UI_CMN_Shougou_${color}.png`; jobs.push({key:'titleBase|'+file,name:color+' title',candidates:[resolve(root,'assets/titles',file)],noGlitter:true});}

function trace(data,width,height) {
  // Each contour is extracted from this specific source image, without region templates.
  const path=[];
  for(let y=0;y<height;y++) {
    for(let x=0;x<width;) {
      if(!data[y*width+x]) {x++;continue;}
      const start=x; while(x<width&&data[y*width+x]) x++;
      path.push(`M${start} ${y}h${x-start}v1h-${x-start}z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#000"/><path fill="#fff" d="${path.join('')}"/></svg>\n`;
}
const registry={};
const audit=[];
for(const job of jobs) {
  let source;
  for(const candidate of job.candidates) {try {await access(candidate);source=candidate;break;} catch {}}
  if(!source) throw Error('Missing original: '+job.key);
  const original=await readFile(source);
  const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height}=info, count=width*height;
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
      uv[p]=1;
      if(!job.noGlitter&&luma[p]>170&&contrast[p]>14) glitter[p]=1;
    }
  }
  // Per-source contrast ranking keeps flat backing colors out of the selected foil.
  for(const [mask,maxFraction] of [[uv,0.24],[glitter,0.14]]) {
    const selected=[];for(let p=0;p<count;p++)if(mask[p])selected.push(p);
    const limit=Math.floor(count*maxFraction);
    if(selected.length>limit) {
      selected.sort((a,b)=>contrast[b]-contrast[a]||luma[b]-luma[a]);
      mask.fill(0);for(const p of selected.slice(0,limit))mask[p]=1;
    }
  }
  const id=job.key.replace('|','-').replace(/\.png$/,'');
  const uvName=id+'.uv.svg', glitterName=id+'.glitter.svg';
  for(const [name,mask] of [[uvName,uv],[glitterName,glitter]]) {
    const png=await sharp(Buffer.from(trace(mask,width,height))).png({palette:true,colours:2,compressionLevel:9}).toBuffer();
    // A standalone SVG container retains the exact lossless black/white bitmap.
    await writeFile(resolve(output,name),`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${png.toString('base64')}"/></svg>\n`);
  }
  const uvPixels=uv.reduce((a,b)=>a+b,0),glitterPixels=glitter.reduce((a,b)=>a+b,0);
  if(!uvPixels||(!job.noGlitter&&!glitterPixels))throw Error('Empty mask: '+job.key);
  registry[job.key]={uv:'assets/finish-masks/'+uvName,glitter:'assets/finish-masks/'+glitterName,width,height,sourceSHA256:createHash('sha256').update(original).digest('hex')};
  audit.push({id:job.key,name:job.name,source:basename(source),width,height,uvPixels,glitterPixels});
}
await writeFile(resolve(root,'src/collectible-mask-files.js'),'// Independent black/white masks; SVG containers hold lossless PNG bitmaps.\nexport const COLLECTIBLE_MASK_FILES = '+JSON.stringify(registry,null,2)+';\n');
await writeFile(resolve(output,'audit.json'),JSON.stringify({method:'source-pixel-connected-components',sharedRegionTemplates:false,assets:audit},null,2)+'\n');
console.log(`Generated ${audit.length} independent UV/glitter pairs (${audit.length*2} black/white mask files).`);

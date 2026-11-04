import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceFinishMask,createWhiteOutlineMask} from '../../src/source-finish-mask.js';

test('flat opaque plate backing does not become a powder mask',()=>{
  const pixels=new Uint8ClampedArray(80*30*4).fill(255);
  const mask=createSourceFinishMask(pixels,80,30);
  assert.ok(mask.powder.every(value=>value===0));
  assert.ok(mask.uv.every(value=>value===0));
});

test('only narrow neutral-white outlines reflect, excluding gold, silver and broad white fill',()=>{
  const width=40,height=30,pixels=new Uint8ClampedArray(width*height*4);
  function fill(x0,y0,x1,y1,color) {
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)pixels.set(color,(y*width+x)*4);
  }
  fill(0,0,width,height,[25,30,45,255]);
  fill(5,5,35,25,[255,255,255,255]);
  fill(7,7,33,23,[240,170,35,255]);
  const white=createWhiteOutlineMask(pixels,width,height);
  assert.equal(white[6*width+20],255);
  assert.equal(white[15*width+20],0);
  fill(5,5,35,25,[195,198,205,255]);
  assert.ok(createWhiteOutlineMask(pixels,width,height).every(value=>value===0));
  fill(0,0,width,height,[255,255,255,255]);
  assert.ok(createWhiteOutlineMask(pixels,width,height).every(value=>value===0));
});

test('white letter fills surrounded by the same dark outline do not become reflective strokes',()=>{
  const width=30,height=20,pixels=new Uint8ClampedArray(width*height*4);
  for(let p=0;p<width*height;p++)pixels.set([30,25,10,255],p*4);
  for(let y=4;y<16;y++)for(let x=12;x<16;x++)pixels.set([255,255,255,255],(y*width+x)*4);
  assert.ok(createWhiteOutlineMask(pixels,width,height).every(value=>value===0));
});

test('each source creates its own bounded white contours without modifying artwork',()=>{
  const width=100,height=40;
  function source(offset) {
    const pixels=new Uint8ClampedArray(width*height*4);
    for(let p=0;p<width*height;p++)pixels[p*4+3]=255;
    for(let y=8;y<32;y++)for(let x=offset;x<offset+4;x++) {
      const i=(y*width+x)*4;
      pixels[i]=245;pixels[i+1]=210;pixels[i+2]=120;
    }
    return pixels;
  }
  const pixels=source(20),before=pixels.slice();
  const first=createSourceFinishMask(pixels,width,height);
  const second=createSourceFinishMask(source(60),width,height);
  assert.deepEqual(pixels,before);
  assert.notDeepEqual(first.powder,second.powder);
  assert.ok(first.powder.some(Boolean));
  assert.equal(first.powder[20*width+50],0);
  assert.ok(first.powder.filter(Boolean).length<=width*height*0.14);
  assert.ok(first.powder.every(value=>value===0||value===255));
});

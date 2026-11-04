import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceFinishMask} from '../../src/source-finish-mask.js';

test('flat opaque plate backing does not become a glitter mask',()=>{
  const pixels=new Uint8ClampedArray(80*30*4).fill(255);
  const mask=createSourceFinishMask(pixels,80,30);
  assert.ok(mask.glitter.every(value=>value===0));
  assert.ok(mask.uv.every(value=>value===0));
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
  assert.notDeepEqual(first.glitter,second.glitter);
  assert.ok(first.glitter.some(Boolean));
  assert.equal(first.glitter[20*width+50],0);
  assert.ok(first.glitter.filter(Boolean).length<=width*height*0.14);
  assert.ok(first.glitter.every(value=>value===0||value===255));
});

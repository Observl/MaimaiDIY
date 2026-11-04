import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlateLetteringMask} from '../../src/plate-lettering-mask.js';

test('lettering mask follows the authored strokes and leaves the source unchanged',()=>{
  const width=90,height=36,pixels=new Uint8ClampedArray(width*height*4);
  const fill=(x0,y0,x1,y1)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)pixels[(y*width+x)*4]=255;};
  fill(4,3,9,32);fill(4,3,24,8);fill(4,27,24,32);
  fill(55,6,60,30);fill(55,6,76,11);fill(55,16,71,21);fill(55,25,76,30);
  const original=pixels.slice(),mask=createPlateLetteringMask(pixels,width,height,{x:0,y:0,width,height});
  assert.deepEqual(pixels,original);
  assert.ok(mask[18*width+57]>0);
  assert.equal(mask[18*width+7],0);
  assert.equal(mask[18*width+40],0);
});

test('empty masks do not create a shared rectangular lettering region',()=>{
  const mask=createPlateLetteringMask(new Uint8ClampedArray(80*30*4),80,30,{x:0,y:0,width:80,height:30});
  assert.ok(mask.every(value=>value===0));
});

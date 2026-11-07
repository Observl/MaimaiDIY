import test from 'node:test';
import assert from 'node:assert/strict';
import {powderCap,powderLevelWeights} from '../../src/powder-microrelief.js';

test('powder grains have continuous height and opposite gradients on their two sides',()=>{
  const center=powderCap(0,0),left=powderCap(-0.2,0),right=powderCap(0.2,0);
  assert.equal(center.height,0.26);assert.equal(Math.abs(center.dx),0);assert.equal(Math.abs(center.dy),0);
  assert.equal(left.height,right.height);assert.equal(left.dx,-right.dx);assert.ok(left.dx>0);
  assert.deepEqual(powderCap(0.48,0),{height:0,dx:0,dy:0});
});

test('powder gradients agree with the cap derivative and remain bounded',()=>{
  const step=0.00001;
  for(let x=-0.6;x<0.6;x+=0.037)for(let y=-0.6;y<0.6;y+=0.043) {
    const p=powderCap(x,y);
    const dx=(powderCap(x+step,y).height-powderCap(x-step,y).height)/(2*step);
    const dy=(powderCap(x,y+step).height-powderCap(x,y-step).height)/(2*step);
    assert.ok(Math.abs(p.dx-dx)<1e-5&&Math.abs(p.dy-dy)<1e-5);
    assert.ok(p.height>=0&&p.height<=0.26&&Math.hypot(p.dx,p.dy)<0.85);
  }
});

test('level weights blend signals without changing coverage through random-seed mixing',()=>{
  for(let footprint=0;footprint<=20;footprint+=0.01) {
    const weights=powderLevelWeights(footprint);
    assert.ok(weights.every(w=>w>=0&&w<=1));
    assert.ok(Math.abs(weights.reduce((sum,w)=>sum+w,0)-1)<1e-12);
  }
  assert.deepEqual(powderLevelWeights(0),[1,0,0]);
  assert.deepEqual(powderLevelWeights(20),[0,0,1]);
});

test('changing light direction reverses microrelief contrast instead of uniformly brightening it',()=>{
  const sample=x=>{const cap=powderCap(x,0);const length=Math.hypot(cap.dx,1);return [-cap.dx/length,1/length];};
  const left=sample(-0.2),right=sample(0.2);
  const lighting=(n,direction)=>n[0]*direction*0.6+n[1]*0.8;
  assert.ok(lighting(left,-1)>lighting(right,-1));
  assert.ok(lighting(left,1)<lighting(right,1));
});

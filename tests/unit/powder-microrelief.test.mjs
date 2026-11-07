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

test('parallax follows view direction, vanishes head-on and stays shallow at grazing angles',async()=>{
  const {powderParallaxOffset}=await import('../../src/powder-microrelief.js');
  assert.deepEqual(powderParallaxOffset([0,0,1],0.39),[0,0]);
  const right=powderParallaxOffset([0.4,0.1,0.9],0.2),left=powderParallaxOffset([-0.4,-0.1,0.9],0.2);
  assert.ok(right[0]>0&&right[1]>0);
  assert.ok(Math.abs(right[0]+left[0])<1e-12&&Math.abs(right[1]+left[1])<1e-12);
  for(const z of [0,0.01,0.2,0.8,1])assert.ok(Math.hypot(...powderParallaxOffset([1,1,z],0.39))<=0.18+1e-12);
});

test('surface gradient and lighting use the same rotated coordinate frame',async()=>{
  const {toPowderFrame,fromPowderGradient}=await import('../../src/powder-microrelief.js');
  const gradient=[0.2,-0.5],direction=[0.7,0.3];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
  assert.ok(Math.abs(dot(fromPowderGradient(gradient),direction)-dot(gradient,toPowderFrame(direction)))<1e-12);
});

test('grain self-shadow is bounded, directional and absent for overhead light',async()=>{
  const {powderSelfShadow}=await import('../../src/powder-microrelief.js');
  assert.equal(powderSelfShadow([-0.25,0],[0,0,1]),0);
  const shadow=powderSelfShadow([-0.25,0],[1,0,0.15]);
  assert.ok(shadow>0&&shadow<=0.55);
  assert.ok(powderSelfShadow([-0.25,0],[-1,0,0.15])<shadow);
  assert.equal(powderSelfShadow([0.25,0],[-1,0,0.15]),shadow);
});

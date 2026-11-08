import test from 'node:test';
import assert from 'node:assert/strict';
import {glitterEntry,glitterLighting} from '../../src/glitter-lighting.js';
import {facetNormal,facetResponse} from '../../src/granular-reflection.js';

const normalize=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
const grains=Array.from({length:1024},(_,i)=>facetNormal((i*0.61803398875)%1,(i*0.754877666)%1,1.6));
const view=normalize([0.28,0.13,0.95]);
const source=(normal,z)=>{
  const x=Math.sqrt(1-z*z),eta=1/1.49;
  const light=z>0?[x*eta,0,Math.sqrt(1-x*x*eta*eta)]:[x,0,z];
  return facetResponse(normal,view,light,0.85);
};

test('entry envelope is bounded, smooth, and absent for back-side sources',()=>{
  for(let i=-100;i<=100;i++)assert.ok(glitterEntry(i/100)>=0&&glitterEntry(i/100)<=1);
  assert.equal(glitterEntry(-0.001),0);assert.equal(glitterEntry(0),0);assert.equal(glitterEntry(0.35),1);
  assert.ok(glitterEntry(0.0001)<0.000001);
});

test('fully entered lights preserve prior glitter response and source independence',()=>{
  for(const a of [0,0.01,0.2,1.62])for(const b of [0,0.02,0.5,1.62]) {
    assert.ok(Math.abs(glitterLighting(a,b)-(1-Math.exp(-(a*0.78+b*0.22)*5)))<1e-12);
    assert.equal(glitterLighting(a,b,0,0),0);
    assert.equal(glitterLighting(a,b,1,0),glitterLighting(a,0));
    assert.equal(glitterLighting(a,b,0,1),glitterLighting(0,b));
  }
});

test('refracted glitter converges continuously at both source horizons',()=>{
  for(const sun of [false,true])for(const epsilon of [0.01,0.001,0.0001]) {
    let peak=0;
    for(const normal of grains) {
      const response=source(normal,epsilon);
      const next=sun?glitterLighting(0,response,0,glitterEntry(epsilon)):glitterLighting(response,0,glitterEntry(epsilon),0);
      peak=Math.max(peak,next);
    }
    assert.ok(peak<25*epsilon*epsilon,`${sun?'sun':'window'} epsilon=${epsilon}, peak=${peak}`);
  }
});

test('fine angle sweeps retain varied glints without population jumps',()=>{
  for(const sun of [false,true]) {
    let previous=grains.map(()=>0),peak=0,active=0;
    for(let degrees=-2;degrees<=80;degrees+=0.25) {
      const z=Math.sin(degrees*Math.PI/180);
      const next=grains.map(n=>sun?glitterLighting(0,source(n,z),0,glitterEntry(z)):glitterLighting(source(n,z),0,glitterEntry(z),0));
      peak=Math.max(peak,...next.map((x,i)=>Math.abs(x-previous[i])));
      active=Math.max(active,next.filter(x=>x>0.3).length);previous=next;
    }
    assert.ok(peak<0.025,`peak quarter-degree step ${peak}`);
    assert.ok(active>30&&active<grains.length*0.8,`${active} active glints`);
  }
});

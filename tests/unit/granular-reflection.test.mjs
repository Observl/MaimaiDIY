import test from 'node:test';
import assert from 'node:assert/strict';
import {facetNormal,facetResponse} from '../../src/granular-reflection.js';

const normalize=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
const direction=degrees=>{const a=degrees*Math.PI/180;return [Math.sin(a),0,Math.cos(a)];};
const grains=Array.from({length:4096},(_,i)=>facetNormal((i*0.61803398875)%1,(i*0.754877666)%1));
const bright=(view,light)=>new Set(grains.flatMap((n,i)=>facetResponse(n,view,light,0.85)>0.3?[i]:[]));

test('grain orientations are deterministic, varied and normalized',()=>{
  assert.deepEqual(facetNormal(0.21,0.75),facetNormal(0.21,0.75));
  assert.notDeepEqual(facetNormal(0.21,0.75),facetNormal(0.22,0.75));
  for(const normal of grains)assert.ok(Math.abs(Math.hypot(...normal)-1)<1e-12&&normal[2]>0);
});

test('independent grains continue reflecting across a broad front-facing view range',()=>{
  const light=normalize([-0.6,0.2,0.75]);
  for(const angle of [-70,-50,-25,0,25,50,70]) {
    const active=bright(direction(angle),light);
    assert.ok(active.size>140&&active.size<450,`${angle}: ${active.size} bright grains`);
  }
});

test('moving the eye or light changes which grains reflect without reseeding them',()=>{
  const light=normalize([-0.6,0.2,0.75]);
  const first=bright(direction(-25),light),second=bright(direction(25),light);
  const overlap=[...first].filter(i=>second.has(i)).length;
  assert.ok(overlap/(first.size+second.size-overlap)<0.15);
  const movedLight=bright(direction(-25),normalize([0.5,0.3,0.8]));
  assert.ok([...first].filter(i=>movedLight.has(i)).length/first.size<0.25);
  assert.deepEqual(first,bright(direction(-25),light));
});

test('front-facing reflection is bounded and back-side lighting cannot make glowing grains',()=>{
  for(const normal of grains) {
    assert.equal(facetResponse(normal,[0,0,1],[0,0,-1]),0);
    assert.equal(facetResponse(normal,[0,0,-1],[0,0,1]),0);
    const response=facetResponse(normal,[0,0,1],[0,0,1]);
    assert.ok(response>=0&&response<=1.62);
  }
});

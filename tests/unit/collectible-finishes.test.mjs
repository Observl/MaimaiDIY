import test from 'node:test';
import assert from 'node:assert/strict';
import {collectibleFinish} from '../../src/collectible-finishes.js';
import {COLLECTIBLE_PLATES} from '../../src/collectible-catalog.js';
const state=(slot,file,extra={})=>({visible:{[slot]:true},files:{[slot]:file},...extra});
test('rating has no powder at any value while white varnish remains available',()=>{
  for(const ratingValue of [0,10000,13999,14000,14500,16411]){
    const profile=collectibleFinish(state('ratingFrame','/materials/ratings/UI_CMN_DXRating_S_11.png',{ratingValue}),'ratingFrame');
    assert.equal(profile.powder,0);assert.equal(profile.uv,1);
  }
});
test('only the four special plate families receive plate powder and white varnish',()=>{
  for(const kind of ['shogun','kiwami','maimai','god']){
    const id=Object.keys(COLLECTIBLE_PLATES).find(id=>COLLECTIBLE_PLATES[id].kind===kind);
    assert.ok(collectibleFinish(state('nameplate','/cos/materials/nameplates/'+id),'nameplate').powder>0);
  }
  assert.equal(collectibleFinish(state('nameplate','/cos/materials/nameplates/UI_Plate_000000.png'),'nameplate'),null);
  assert.equal(collectibleFinish(state('nameplate','/materials/nameplates/UI_Plate_999999.png',{labels:{nameplate:'神'}}),'nameplate'),null);
});
test('all title colors have no powder and preserve white varnish',()=>{
  for(const color of ['Normal','Bronze','Gold','Silver','Rainbow']){
    const profile=collectibleFinish(state('titleBase','unused',{titleColor:color}),'titleBase');
    assert.equal(profile.powder,0);assert.equal(profile.uv,1);
  }
});
test('beginner rank and A/B battles have no powder while other ranks retain it',()=>{
  for(let level=0;level<=23;level++){
    const profile=collectibleFinish(state('rank','/cos/materials/ranks/'+String(level).padStart(2,'0')+'.png'),'rank');
    assert.equal(profile.powder>0,level!==0);
  }
  for(let level=0;level<=25;level++){
    const profile=collectibleFinish(state('friendBattle','/cos/materials/friend-battles/'+String(level).padStart(2,'0')+'.png'),'friendBattle');
    assert.equal(profile.powder>0,level>=10);assert.equal(profile.uv,0.9);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAssetUrl} from '../../src/asset-paths.js';
import {COS,DEFAULT_PRESET,slots} from '../../src/config.js';
import {createDefaultState,sanitizeImportedState} from '../../src/model.js';

test('all built-in assets and loose legacy defaults resolve to the configured COS bucket',()=>{
  for(const url of [...Object.values(slots).map(slot=>slot.asset),...Object.values(DEFAULT_PRESET.files)])assert.ok(url.startsWith(COS.baseUrl+'/materials/'),url);
  for(const file of ['avatar','background','default-background','nameplate','nameBase','playerName','rank','friendBattle','titleBase','titleText','ratingFrame','ratingDigits']) {
    const value=resolveAssetUrl(`assets/${file}.png`);
    assert.ok(value.startsWith(COS.baseUrl+'/materials/'),value);
    assert.ok(!value.includes('/assets/'),value);
  }
  assert.equal(resolveAssetUrl('assets/ranks/18.png?v=3'),`${COS.baseUrl}/materials/ranks/18.png?v=3`);
});

test('legacy personal templates migrate to COS while uploaded avatars remain local data',()=>{
  const next=sanitizeImportedState({...createDefaultState(),files:{nameplate:'assets/nameplates/UI_Plate_006150.png',rank:'assets/rank.png',nameBase:'assets/nameBase.png',avatar:'data:image/png;base64,YQ=='}});
  assert.equal(next.files.rank,`${COS.baseUrl}/materials/ranks/18.png`);
  assert.equal(next.files.nameBase,`${COS.baseUrl}/materials/name-bases/default.png`);
  assert.equal(next.files.avatar,'data:image/png;base64,YQ==');
  assert.ok(next.files.nameplate.startsWith(COS.baseUrl));
});

test('legacy and COS addresses share a single image request',async()=>{
  const oldImage=globalThis.Image;let count=0;
  globalThis.Image=class {
    naturalWidth=128;naturalHeight=128;
    constructor(){count++;}
    set src(value){assert.equal(value,`${COS.baseUrl}/materials/ranks/18.png`);queueMicrotask(()=>this.onload());}
  };
  try {
    const {loadImage}=await import('../../src/assets.js?cloud-test');
    const first=loadImage('assets/ranks/18.png'),second=loadImage(`${COS.baseUrl}/materials/ranks/18.png`);
    assert.equal(first,second);await first;assert.equal(count,1);
  }finally{globalThis.Image=oldImage;}
});

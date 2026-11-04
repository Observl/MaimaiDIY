import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPOSITION_ORDER,slots } from '../../src/config.js';
test('composition order puts player identity behind badges and friend battle outermost',()=>{
  assert.deepEqual(COMPOSITION_ORDER,[
    'background','nameplate','nameBase','playerName',
    'avatar','titleBase','titleText','rank','ratingFrame','ratingDigits','friendBattle',
  ]);
  assert.equal(new Set(COMPOSITION_ORDER).size,Object.keys(slots).length);
  assert.deepEqual(Object.keys(slots).sort((a,b)=>slots[a].z-slots[b].z),COMPOSITION_ORDER);
});

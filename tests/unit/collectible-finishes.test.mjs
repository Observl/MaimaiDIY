import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../../src/model.js';
import { collectibleFinish } from '../../src/collectible-finishes.js';

test('all rank assets receive glitter with tier-dependent finish colors', () => {
  const state=createDefaultState();
  const types=new Set();
  for(let n=0;n<24;n++) {
    state.files.rank=`assets/ranks/${String(n).padStart(2,'0')}.png`;
    const finish=collectibleFinish(state,'rank');
    assert.ok(finish.glitter>0);
    if(finish) types.add(JSON.stringify([finish.glitter,finish.tint,finish.rainbow]));
  }
  assert.ok(types.size>=3);
  state.visible.rank=false;
  assert.equal(collectibleFinish(state,'rank'),null);
});
test('gold and silver title rails have UV but no glitter', () => {
  const state=createDefaultState();
  for(const color of ['Gold','Silver']) {
    state.titleColor=color;
    assert.equal(collectibleFinish(state,'titleBase').shape,'title-board');
    assert.equal(collectibleFinish(state,'titleBase').glitter,0);
    assert.equal(collectibleFinish(state,'titleText'),null);
  }
  state.titleColor='Normal'; assert.equal(collectibleFinish(state,'titleBase').uv,1);
  assert.ok(collectibleFinish(state,'ratingFrame').glitter>0);
  assert.ok(collectibleFinish(state,'playerName').glitter>0);
});
test('all nameplates receive glitter while special plates retain their profiles', () => {
  const state=createDefaultState();
  for(const id of ['006149','006150','006151','006152','559104']) {
    state.files.nameplate=`assets/nameplates/UI_Plate_${id}.png`;
    assert.ok(collectibleFinish(state,'nameplate').glitter>0);
  }
  state.labels.nameplate='舞神'; state.files.nameplate='assets/nameplates/UI_Plate_555201.png';
  assert.equal(collectibleFinish(state,'nameplate').shape,'plate-print');
  assert.ok(collectibleFinish(state,'nameplate').glitter>0);
  assert.equal(collectibleFinish(state,'background'),null);
});
test('every friend-battle badge receives glitter including lower ranks', () => {
  const state=createDefaultState();
  for(let n=0;n<=25;n++) {
    state.files.friendBattle=`assets/friend-battles/${String(n).padStart(2,'0')}.png`;
    const finish=collectibleFinish(state,'friendBattle');
    assert.ok(finish.glitter>0);
    if(n===25) assert.equal(finish.rainbow,1);
  }
});

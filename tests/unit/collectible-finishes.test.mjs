import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../../src/model.js';
import { collectibleFinish } from '../../src/collectible-finishes.js';

test('only actual true-rank assets receive tiered finishes', () => {
  const state=createDefaultState();
  const types=new Set();
  for(let n=0;n<24;n++) {
    state.files.rank=`assets/ranks/${String(n).padStart(2,'0')}.png`;
    const finish=collectibleFinish(state,'rank');
    assert.equal(Boolean(finish),n>=12);
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
    assert.equal(collectibleFinish(state,'titleBase').shape,'title-rails');
    assert.equal(collectibleFinish(state,'titleBase').glitter,0);
    assert.equal(collectibleFinish(state,'titleText').shape,'title-lettering');
    assert.equal(collectibleFinish(state,'titleText').glitter,0);
  }
  state.titleColor='Normal'; assert.equal(collectibleFinish(state,'titleBase'),null);
  assert.equal(collectibleFinish(state,'playerName'),null);
});
test('special plates are selected by registered asset ID, never the label', () => {
  const state=createDefaultState();
  for(const id of ['006149','006150','006151','006152','559104']) {
    state.files.nameplate=`assets/nameplates/UI_Plate_${id}.png`;
    assert.ok(collectibleFinish(state,'nameplate').glitter>0);
  }
  state.labels.nameplate='舞神'; state.files.nameplate='assets/nameplates/UI_Plate_555201.png';
  assert.equal(collectibleFinish(state,'nameplate'),null);
  assert.equal(collectibleFinish(state,'background'),null);
});
test('friend-battle effects start at S and become different at SS, SSS and LEGEND', () => {
  const state=createDefaultState();
  for(let n=0;n<=25;n++) {
    state.files.friendBattle=`assets/friend-battles/${String(n).padStart(2,'0')}.png`;
    const finish=collectibleFinish(state,'friendBattle');
    assert.equal(Boolean(finish),n>=10);
    if(n===25) assert.equal(finish.rainbow,1);
  }
});

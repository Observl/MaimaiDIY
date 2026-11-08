import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../../src/model.js';
import {
  CURRENT_DESIGN_KEY,
  LEGACY_CURRENT_DESIGN_KEY,
  regionDesignKey,
  readRegionDesign,
  readCurrentDesign,
  saveCurrentDesign,
} from '../../src/current-design.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}
test('latest unsaved edits and uploaded avatar survive the order-page round trip', () => {
  const storage = memoryStorage();
  const state = createDefaultState();
  state.playerName = '最新搭配';
  state.files.avatar = 'data:image/png;base64,YQ==';
  assert.equal(saveCurrentDesign(state, storage), true);
  assert.equal(readCurrentDesign(storage).playerName, '最新搭配');
  assert.equal(readCurrentDesign(storage).files.avatar, state.files.avatar);
  state.playerName = '继续修改';
  saveCurrentDesign(state, storage);
  assert.equal(readCurrentDesign(storage).playerName, '继续修改');
});
test('missing, corrupt, invalid and blocked storage do not invent a design', () => {
  const storage = memoryStorage();
  assert.equal(readCurrentDesign(storage), null);
  storage.setItem(CURRENT_DESIGN_KEY, '{');
  assert.equal(readCurrentDesign(storage), null);
  storage.setItem(
    CURRENT_DESIGN_KEY,
    JSON.stringify({ version: 1, state: { files: { avatar: 'https://foreign.invalid/x.png' } } })
  );
  assert.equal(readCurrentDesign(storage), null);
  const blocked = {
    getItem() {
      throw Error('blocked');
    },
    setItem() {
      throw Error('full');
    },
  };
  assert.equal(readCurrentDesign(blocked), null);
  assert.equal(saveCurrentDesign(createDefaultState(), blocked), false);
});

test('regional drafts survive alternating saves and latest points to last saved region', () => {
  const storage = memoryStorage();
  const cn = { ...createDefaultState('cn'), playerName: 'CN编辑' };
  const jp = { ...createDefaultState('jp'), playerName: 'JP編集' };
  assert.equal(saveCurrentDesign(cn, storage), true);
  assert.equal(saveCurrentDesign(jp, storage), true);
  assert.equal(readRegionDesign('cn', storage).playerName, 'CN编辑');
  assert.equal(readRegionDesign('jp', storage).playerName, 'JP編集');
  assert.equal(readCurrentDesign(storage).region, 'jp');
  cn.playerName = 'CN继续';
  assert.equal(saveCurrentDesign(cn, storage), true);
  assert.equal(readRegionDesign('jp', storage).playerName, 'JP編集');
  assert.equal(readCurrentDesign(storage).region, 'cn');
});
test('regional reads reject corrupt, foreign, unsupported and invalid drafts', () => {
  const storage = memoryStorage();
  assert.equal(readRegionDesign('jp', storage), null);
  assert.equal(readRegionDesign('../cn', storage), null);
  for (const value of [
    '{',
    JSON.stringify({ version: 2, state: createDefaultState('jp') }),
    JSON.stringify({ version: 1, state: createDefaultState('cn') }),
    JSON.stringify({
      version: 1,
      state: { region: 'jp', song: { id: '', difficulty: 8, achievement: 100 } },
    }),
  ]) {
    storage.setItem(regionDesignKey('jp'), value);
    assert.equal(readRegionDesign('jp', storage), null);
  }
  assert.equal(
    readRegionDesign('cn', {
      getItem() {
        throw Error('denied');
      },
    }),
    null
  );
});
test('legacy fallback is region-safe and remains unchanged after regional saves', () => {
  const storage = memoryStorage();
  const old = JSON.stringify({ version: 1, state: { playerName: '旧版草稿' } });
  storage.setItem(LEGACY_CURRENT_DESIGN_KEY, old);
  assert.equal(readRegionDesign('cn', storage).playerName, '旧版草稿');
  assert.equal(readRegionDesign('jp', storage), null);
  saveCurrentDesign(createDefaultState('cn'), storage);
  saveCurrentDesign(createDefaultState('jp'), storage);
  assert.equal(storage.getItem(LEGACY_CURRENT_DESIGN_KEY), old);
});
test('JP defaults describe their actual default assets without changing CN labels', () => {
  const jp = createDefaultState('jp');
  assert.equal(jp.labels.background, '日服默认背景');
  assert.equal(jp.labels.avatar, '日服默认头像');
  assert.equal(jp.labels.nameplate, '日服默认姓名框');
  assert.notEqual(createDefaultState().labels.background, jp.labels.background);
});

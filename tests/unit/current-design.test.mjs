import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../../src/model.js';
import { CURRENT_DESIGN_KEY, readCurrentDesign, saveCurrentDesign } from '../../src/current-design.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
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
  storage.setItem(CURRENT_DESIGN_KEY, JSON.stringify({ version: 1, state: { files: { avatar: 'https://foreign.invalid/x.png' } } }));
  assert.equal(readCurrentDesign(storage), null);
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } };
  assert.equal(readCurrentDesign(blocked), null);
  assert.equal(saveCurrentDesign(createDefaultState(), blocked), false);
});

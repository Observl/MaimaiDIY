import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerRegionCategory, registerRegionCatalog, getRegionCatalog,
  getRegionCatalogItem, sanitizeRegionFields,
} from '../../src/region-profile.js';

test('category registration supports lookup without claiming a complete catalog', () => {
  const jp = { region: 'jp', category: 'charas', items: [{ id: '000101', name: 'JP' }] };
  assert.equal(registerRegionCategory(jp), jp);
  assert.equal(getRegionCatalog('jp'), undefined);
  assert.equal(getRegionCatalogItem('jp', 'charas', '000101').name, 'JP');
  assert.equal(getRegionCatalogItem('jp', 'songs', '1:dx'), undefined);
  registerRegionCategory({ region: 'cn', category: 'charas', items: [{ id: '000101', name: 'CN' }] });
  assert.equal(getRegionCatalogItem('cn', 'charas', '000101').name, 'CN');
  assert.equal(getRegionCatalogItem('jp', 'charas', '000101').name, 'JP');
});

test('loaded category membership is enforced without treating unloaded categories as empty', () => {
  const base = { region: 'jp', companions: [{ id: '000101', level: 1 }] };
  assert.equal(sanitizeRegionFields(base).companions.length, 1);
  assert.throws(() => sanitizeRegionFields({ ...base, companions: [{ id: '999999', level: 1 }] }), /所选地区/);
  const song = { id: '1:dx', difficulty: 3, achievement: '100.0000' };
  assert.equal(sanitizeRegionFields({ ...base, song }).song.id, '1:dx');
  registerRegionCategory({ region: 'jp', category: 'songs', items: [{ id: '1:dx', charts: [{ difficulty: 3 }] }] });
  assert.throws(() => sanitizeRegionFields({ ...base, song: { ...song, difficulty: 4 } }), /所选地区/);
});

test('invalid category registrations do not replace valid lookup maps', () => {
  for (const data of [
    { region: 'jp', category: 'missing', items: [] },
    { region: 'jp', category: 'charas', items: [{ id: 'x', region: 'cn' }] },
    { region: 'jp', category: 'charas', items: [{ id: 'x' }, { id: 'x' }] },
  ]) assert.throws(() => registerRegionCategory(data));
  assert.equal(getRegionCatalogItem('jp', 'charas', '000101').name, 'JP');
});

test('complete catalog registration still requires all categories and governs full validation', () => {
  assert.throws(() => registerRegionCatalog({ region: 'jp', charas: [] }), /目录无效/);
  const full = { region: 'jp', frames: [], plates: [], icons: [], charas: [], songs: [] };
  registerRegionCatalog(full);
  assert.equal(getRegionCatalog('jp'), full);
  assert.equal(getRegionCatalogItem('jp', 'charas', '000101'), undefined);
  assert.throws(() => sanitizeRegionFields({ region: 'jp', companions: [{ id: '000101', level: 1 }] }), /所选地区/);
});

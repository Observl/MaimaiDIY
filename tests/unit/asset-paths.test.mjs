import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAssetUrl} from '../../src/asset-paths.js';
import {COS,DEFAULT_PRESET,slots} from '../../src/config.js';
import {createDefaultState,sanitizeImportedState,isAllowedAsset} from '../../src/model.js';
import { assetUrl, normalizeManifestGroups } from '../../src/assets.js';
import { saveCurrentDesign, readCurrentDesign } from '../../src/current-design.js';
import {
  JP_ASSET_ROOT,
  LEGACY_JP_ASSET_ROOT,
  JP_RATING_ROOT,
  LEGACY_JP_RATING_ROOT,
  JP_RATING_BANDS,
  SALT_COVER_ROOT,
  LEGACY_SALT_COVER_ROOT,
} from '../../src/region-profile.js';

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

test('only exact source pins and original filenames map into the regional COS release', () => {
  for (const [category, type] of [['frames', 'Frame'], ['plates', 'Plate'], ['icons', 'Icon'], ['charas', 'Chara']]) {
    const file = `${category}/UI_${type}_000001.png`;
    assert.equal(resolveAssetUrl(LEGACY_JP_ASSET_ROOT + file), JP_ASSET_ROOT + file);
  }
  assert.equal(resolveAssetUrl(LEGACY_SALT_COVER_ROOT + '000008.png'), SALT_COVER_ROOT + '000008.png');
  for (const band of JP_RATING_BANDS)
    assert.equal(resolveAssetUrl(LEGACY_JP_RATING_ROOT + band.asset), JP_RATING_ROOT + band.asset);
  for (const path of [
    LEGACY_JP_ASSET_ROOT + 'icons/UI_Frame_000001.png',
    LEGACY_JP_ASSET_ROOT + 'icons/UI_Icon_000001.png?download=1',
    LEGACY_JP_ASSET_ROOT + 'icons/UI_Icon_000001.png#x',
    LEGACY_JP_ASSET_ROOT + 'icons/UI_Icon_000001.png\n',
    LEGACY_JP_ASSET_ROOT + 'icons/../icons/UI_Icon_000001.png',
    LEGACY_JP_ASSET_ROOT + 'icons/UI_Icon_%30%30%30%30%30%31.png',
    LEGACY_JP_ASSET_ROOT.replace('0ebcd319585af286bce5c31cc416fcf245e28428', 'main') + 'icons/UI_Icon_000001.png',
    LEGACY_JP_ASSET_ROOT.replace('raw.githubusercontent.com', 'evil.invalid') + 'icons/UI_Icon_000001.png',
    LEGACY_JP_ASSET_ROOT.replace('https:', 'http:') + 'icons/UI_Icon_000001.png',
    LEGACY_SALT_COVER_ROOT + '8.png',
    LEGACY_SALT_COVER_ROOT + '000008.webp',
    LEGACY_SALT_COVER_ROOT + '000008.png?x=1',
    LEGACY_JP_RATING_ROOT + 'kiwami.webp',
    LEGACY_JP_RATING_ROOT + 'circleplus/white.webp',
    LEGACY_JP_RATING_ROOT + 'circleplus/kiwami.webp#x',
    LEGACY_JP_RATING_ROOT.replace('a3a5027940519b6ff52831185177d58b71c404d2', 'main') + 'white.webp',
  ]) assert.equal(resolveAssetUrl(path), path, path);
});

test('ordinary original CN COS assets and default state remain unchanged', () => {
  const original = createDefaultState('cn');
  for (const path of Object.values(original.files)) assert.equal(resolveAssetUrl(path), path);
  assert.deepEqual(sanitizeImportedState(JSON.parse(JSON.stringify(original))), original);
  assert.equal(original.files.background, DEFAULT_PRESET.files.background);
  assert.equal(original.files.rank, DEFAULT_PRESET.files.rank);
  assert.equal(original.files.friendBattle, DEFAULT_PRESET.files.friendBattle);
  assert.equal(original.files.nameplate, DEFAULT_PRESET.files.nameplate);
  assert.equal(original.files.avatar, DEFAULT_PRESET.files.avatar);
});

test('real legacy CN plate with encoded spaces and parentheses survives picker, save and import', () => {
  // Existing COS manifest entry; keep the source spelling, not a renamed object.
  const item = {
    id: 'nameplates/UI_Plate_450001 (2)',
    name: 'UI_Plate_450001 (2)',
    file: 'nameplates/UI_Plate_450001 (2).png',
    source: 'nameplates/UI_Plate_450001%20%282%29.png',
    gameId: 450001,
    group: '未收录',
  };
  const manifest = normalizeManifestGroups({ categories: [{ id: 'nameplates', items: [item] }] });
  const url = assetUrl(manifest.categories[0].items[0]);
  assert.equal(url, `${COS.baseUrl}/materials/nameplates/UI_Plate_450001%20%282%29.png`);
  const fallbackUrl = assetUrl({ ...item, source: undefined });
  assert.equal(fallbackUrl, `${COS.baseUrl}/materials/nameplates/UI_Plate_450001%20(2).png`);
  for (const current of [url, fallbackUrl]) {
    assert.equal(isAllowedAsset(current, 'nameplate', 'cn'), true);
    assert.equal(isAllowedAsset(current, 'nameplate', 'jp'), false);
    assert.equal(resolveAssetUrl(current), current);
    const state = createDefaultState('cn');
    state.files.nameplate = current;
    assert.equal(sanitizeImportedState(JSON.parse(JSON.stringify(state))).files.nameplate, current);
    const data = new Map();
    const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    assert.equal(saveCurrentDesign(state, storage), true);
    assert.equal(readCurrentDesign(storage).files.nameplate, current);
  }
  for (const prefix of ['assets/', 'materials/']) {
    const relative = prefix + item.source;
    assert.equal(isAllowedAsset(relative, 'nameplate', 'cn'), true);
    assert.equal(sanitizeImportedState({ files: { nameplate: relative } }).files.nameplate, url);
  }
});

test('legacy encoded filename support rejects ambiguous and unsafe encodings', () => {
  for (const filename of [
    'UI_Plate_450001%2Fother.png',
    'UI_Plate_450001%2fother.png',
    'UI_Plate_450001%5Cother.png',
    '%2e%2e%2fUI_Plate_450001.png',
    '%252e%252e%252fUI_Plate_450001.png',
    'UI_Plate_450001%2520%25282%2529.png',
    'UI_Plate_450001%00.png',
    'UI_Plate_450001%09.png',
    'UI_Plate_450001%0a.png',
    'UI_Plate_450001%0D.png',
    'UI_Plate_450001%7F.png',
    'UI_Plate_450001%3Fquery.png',
    'UI_Plate_450001%23hash.png',
    'UI_Plate_450001%26query.png',
    'UI_Plate_450001%3Bquery.png',
    'UI_Plate_450001%2epng',
    'UI_Plate_%34%35%30%30%30%31.png',
    'UI_Plate_450001%20%282).png',
    'UI_Plate_450001%20(2%29.png',
    'UI_Plate_450001 (2).png',
    'UI_Plate_450001%20%282%29.png?x=1',
    'UI_Plate_450001%20%282%29.png#x',
    'UI_Plate_450001%.png',
    'UI_Plate_450001%GG.png',
    'UI_Plate_450001%C0%AF.png',
    'UI_Plate_450001%E2%80%AE.png',
  ]) {
    const url = `${COS.baseUrl}/materials/nameplates/${filename}`;
    assert.equal(isAllowedAsset(url, 'nameplate', 'cn'), false, url);
    assert.throws(() => sanitizeImportedState({ files: { nameplate: url } }), url);
  }
  for (const [url, slot] of [
    [`${COS.baseUrl}/materials/nameplates%2FUI_Plate_450001.png`, 'nameplate'],
    [`${COS.baseUrl}/materials/%6eameplates/UI_Plate_450001.png`, 'nameplate'],
    [`${JP_ASSET_ROOT}plates/UI_Plate_450001%20%282%29.png`, 'nameplate'],
    [`${JP_ASSET_ROOT}plates/UI_Plate_%30%30%30%30%30%31.png`, 'nameplate'],
    [`${JP_RATING_ROOT}%77hite.webp`, 'ratingFrame'],
  ]) {
    for (const region of ['cn', 'jp'])
      assert.equal(isAllowedAsset(url, slot, region), false, url);
  }
});

test('legacy raw JP and new COS addresses share a single image request', async () => {
  const oldImage = globalThis.Image;
  let count = 0;
  const path = 'icons/UI_Icon_000001.png';
  globalThis.Image = class {
    naturalWidth = 128;
    naturalHeight = 128;
    constructor() { count++; }
    set src(value) {
      assert.equal(value, JP_ASSET_ROOT + path);
      queueMicrotask(() => this.onload());
    }
  };
  try {
    const { loadImage } = await import('../../src/assets.js?regional-cloud-test');
    const old = loadImage(LEGACY_JP_ASSET_ROOT + path);
    const current = loadImage(JP_ASSET_ROOT + path);
    assert.equal(old, current);
    await old;
    assert.equal(count, 1);
  } finally {
    globalThis.Image = oldImage;
  }
});

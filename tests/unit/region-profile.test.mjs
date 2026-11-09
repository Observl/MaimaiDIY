import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState, sanitizeImportedState, isAllowedAsset } from '../../src/model.js';
import {
  sanitizeRegionFields,
  templateStorageKey,
  JP_ASSET_ROOT,
  LEGACY_JP_ASSET_ROOT,
  LEGACY_JP_RATING_ROOT,
  JP_RATING_ROOT,
  REGION_ASSET_ROOT,
  registerRegionCatalog,
  getRegionCatalogItem,
} from '../../src/region-profile.js';
import { readStoredTemplates, initializeTemplates } from '../../src/templates.js';
import { TEMPLATE_STORAGE_KEY, COS } from '../../src/config.js';
import {
  CURRENT_DESIGN_KEY,
  LEGACY_CURRENT_DESIGN_KEY,
  saveCurrentDesign,
  readCurrentDesign,
} from '../../src/current-design.js';
const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
};
const catalog = {
  region: 'jp',
  frames: [],
  plates: [],
  icons: [],
  charas: [{ id: '000001' }],
  songs: [{ id: '8:sd', charts: [{ difficulty: 0 }, { difficulty: 3 }] }],
};

test('original defaults remain CN collection and legacy import never inherits JP region', () => {
  const old = createDefaultState();
  assert.equal(old.region, 'cn');
  assert.equal(old.screenMode, 'collection');
  assert.deepEqual(old.companions, []);
  const imported = sanitizeImportedState({ playerName: 'OLD' }, createDefaultState('jp'));
  assert.equal(imported.region, 'cn');
  assert.equal(imported.files.background, old.files.background);
  assert.equal(old.ratingValue, 16411);
});
test('region fields roundtrip explicitly with strict ranges and catalog membership', () => {
  const state = {
    ...createDefaultState('jp'),
    screenMode: 'achievement',
    companions: [{ id: '000001', level: 25 }],
    song: { id: '8:sd', difficulty: 3, achievement: '100.1234' },
  };
  const next = sanitizeImportedState(JSON.parse(JSON.stringify(state)), undefined, catalog);
  assert.deepEqual(next, state);
  for (const patch of [
    { region: 'xx' },
    { screenMode: 'foo' },
    { companions: Array(6).fill({ id: '000001', level: 1 }) },
    { companions: [{ id: '000001', level: '1' }] },
    { companions: [{ id: 'nope', level: 1 }] },
    { song: { id: '8:sd', difficulty: 4, achievement: 100 } },
    { song: { id: 'other', difficulty: 0, achievement: 100 } },
    { song: { id: '8:sd', difficulty: 0, achievement: 101.1 } },
    { song: { id: '8:sd', difficulty: 0, achievement: true } },
  ])
    assert.throws(() => sanitizeRegionFields({ ...state, ...patch }, catalog));
  assert.throws(() => sanitizeRegionFields(state, { ...catalog, region: 'cn' }));
});
test('JP asset allowlist pins host, commit, category, filename and slot', () => {
  const path = `${JP_ASSET_ROOT}icons/UI_Icon_000000.png`;
  assert.equal(isAllowedAsset(path, 'avatar'), true);
  for (const bad of [
    path + '?x=1',
    path + '#x',
    path.replace('https:', 'http:'),
    path.replace(new URL(path).host, 'evil.invalid'),
    path.replace('/releases/20261108/', '/releases/20261109/'),
    path.replace('000000', '../000000'),
  ])
    assert.equal(isAllowedAsset(bad, 'avatar'), false, bad);
  assert.equal(isAllowedAsset(path, 'background'), false);
  assert.throws(() => sanitizeImportedState({ region: 'cn', files: { avatar: path } }));
  assert.throws(() => sanitizeImportedState({ ...createDefaultState(), region: 'jp' }));
});

test('legacy raw JP draft and template assets migrate without changing stored originals', () => {
  const old = createDefaultState('jp');
  old.files.background = `${LEGACY_JP_ASSET_ROOT}frames/UI_Frame_000001.png`;
  old.files.nameplate = `${LEGACY_JP_ASSET_ROOT}plates/UI_Plate_000001.png`;
  old.files.avatar = `${LEGACY_JP_ASSET_ROOT}icons/UI_Icon_000001.png`;
  old.files.ratingFrame = `${LEGACY_JP_RATING_ROOT}circleplus/kiwami.webp`;
  old.files.rank = createDefaultState().files.rank;
  old.files.friendBattle = createDefaultState().files.friendBattle;
  old.playerName = 'JP旧稿';
  const payload = JSON.stringify({ version: 1, state: old });
  const templates = JSON.stringify([{ id: 'jp-old', name: 'Old JP', state: old }]);
  const storage = memory();
  storage.setItem(CURRENT_DESIGN_KEY, payload);
  storage.setItem(templateStorageKey('jp'), templates);
  for (const clean of [readCurrentDesign(storage), sanitizeImportedState(readStoredTemplates(storage, 'jp')[0].state)]) {
    assert.equal(clean.playerName, old.playerName);
    assert.equal(clean.files.background, `${JP_ASSET_ROOT}frames/UI_Frame_000001.png`);
    assert.equal(clean.files.nameplate, `${JP_ASSET_ROOT}plates/UI_Plate_000001.png`);
    assert.equal(clean.files.avatar, `${JP_ASSET_ROOT}icons/UI_Icon_000001.png`);
    assert.equal(clean.files.ratingFrame, `${JP_RATING_ROOT}circleplus/kiwami.webp`);
    assert.equal(clean.files.rank, '');
    assert.equal(clean.files.friendBattle, createDefaultState().files.friendBattle);
  }
  assert.equal(storage.getItem(CURRENT_DESIGN_KEY), payload);
  assert.equal(storage.getItem(templateStorageKey('jp')), templates);
});

test('release fencing rejects foreign region, category, slots and URL normalization tricks', () => {
  const avatar = `${JP_ASSET_ROOT}icons/UI_Icon_000000.png`;
  for (const bad of [
    avatar.replace('https://', 'https://user@'),
    avatar.replace('.com/', '.com.evil.invalid/'),
    avatar.replace('/materials/', ':443/materials/'),
    avatar.replace('/jp/', '/cn/'),
    avatar.replace('/icons/', '/frames/'),
    avatar.replace('.png', '.webp'),
    avatar.replace('UI_Icon_', 'UI_Chara_'),
    avatar.replace('000000', '%30%30%30%30%30%30'),
    avatar.replace('/icons/', '/icons/../icons/'),
    avatar.replace('/icons/', '/icons/./'),
    avatar.replace('/icons/', '/icons\\'),
    avatar + '\n',
    `${REGION_ASSET_ROOT}shared/saltmeta/covers/000000.png`,
    `${REGION_ASSET_ROOT}unknown/random.png`,
    `${REGION_ASSET_ROOT}ui/maidraw/dxRating/cn/white.webp`,
    `${COS.baseUrl}/materials/regions/future/arbitrary.png`,
    'materials/regions/future/arbitrary.png',
    'assets/regions/future/arbitrary.png',
    'docs/screenshots/anything.png',
    `${COS.baseUrl}/materials/avatars/a.png?x=1`,
    `${COS.baseUrl}/materials/avatars/a.png#x`,
    `${COS.baseUrl}/materials/avatars/%61.png`,
  ]) {
    assert.equal(isAllowedAsset(bad, 'avatar'), false, bad);
    assert.throws(() => sanitizeImportedState({ region: 'jp', files: { avatar: bad } }), bad);
  }
  for (const root of [JP_ASSET_ROOT, LEGACY_JP_ASSET_ROOT]) {
    const path = `${root}icons/UI_Icon_000000.png`;
    assert.equal(isAllowedAsset(path, 'avatar', 'jp'), true);
    assert.equal(isAllowedAsset(path, 'avatar', 'cn'), false);
    for (const slot of ['background', 'nameplate', 'titleBase', 'nameBase', 'rank', 'friendBattle'])
      assert.equal(isAllowedAsset(path, slot, 'jp'), false, slot);
  }
  const oldPin = `${LEGACY_JP_ASSET_ROOT}icons/UI_Icon_000000.png`;
  assert.equal(isAllowedAsset(oldPin.replace('0ebcd319585af286bce5c31cc416fcf245e28428', 'main'), 'avatar'), false);
  const relative = avatar.slice(`${COS.baseUrl}/`.length);
  assert.equal(isAllowedAsset(relative, 'avatar', 'jp'), true);
  assert.equal(isAllowedAsset(relative, 'avatar', 'cn'), false);
});

test('JP accepts original neutral layers but CN art never becomes JP collection or badges', () => {
  const cn = createDefaultState();
  for (const slot of ['background', 'avatar', 'nameplate', 'rank', 'ratingFrame'])
    assert.equal(isAllowedAsset(cn.files[slot], slot, 'jp'), false, slot);
  assert.equal(isAllowedAsset(cn.files.friendBattle, 'friendBattle', 'jp'), true);
  for (const slot of ['titleBase', 'titleText', 'nameBase', 'playerName', 'ratingDigits'])
    assert.equal(isAllowedAsset(cn.files[slot], slot, 'jp'), true, slot);
  for (const slot of ['titleBase', 'titleText', 'nameBase', 'playerName']) {
    assert.equal(isAllowedAsset(cn.files.rank, slot, 'jp'), false, slot);
    assert.throws(() => sanitizeImportedState({ region: 'jp', files: { [slot]: cn.files.friendBattle } }));
  }
  for (const slot of ['rank', 'friendBattle']) {
    for (const bad of [cn.files[slot] + '?x=1', cn.files.avatar, `${REGION_ASSET_ROOT}jp/ranks/18.png`])
      assert.throws(() => sanitizeImportedState({ region: 'jp', files: { [slot]: bad } }), bad);
  }
  assert.deepEqual(sanitizeImportedState(cn), cn);
});

test('regional item lookup uses isolated category maps and supports synthetic v1 catalogs', () => {
  assert.equal(getRegionCatalogItem('cn', 'charas', 'missing'), undefined);
  const cn = { region: 'cn', frames: [], plates: [], icons: [], charas: [{ id: 1 }], songs: [] };
  const jp = { ...catalog, charas: [{ id: '1' }], icons: [{ id: '1' }] };
  try {
    registerRegionCatalog(cn);
    registerRegionCatalog(jp);
    assert.equal(getRegionCatalogItem('cn', 'charas', '1'), cn.charas[0]);
    assert.equal(getRegionCatalogItem('jp', 'charas', 1), jp.charas[0]);
    assert.equal(getRegionCatalogItem('jp', 'icons', 1), jp.icons[0]);
    assert.equal(getRegionCatalogItem('cn', 'icons', 1), undefined);
    assert.equal(getRegionCatalogItem('jp', 'unknown', 1), undefined);
    assert.throws(() => sanitizeRegionFields({ region: 'jp', companions: [{ id: '000001', level: 1 }] }));
    jp.charas.find = jp.charas.some = () => { throw new Error('linear lookup'); };
    jp.songs.find = () => { throw new Error('linear lookup'); };
    assert.equal(sanitizeRegionFields({ region: 'jp', companions: [{ id: 1, level: 1 }], song: { id: '8:sd', difficulty: 3, achievement: 100 } }).companions[0].id, 1);
  } finally {
    registerRegionCatalog({ ...cn, charas: [] });
    registerRegionCatalog(catalog);
  }
});
test('regional template reads isolate keys and preserve legacy templates byte-for-byte', () => {
  const storage = memory();
  const legacy = JSON.stringify([{ id: 'old', name: 'Old', state: { playerName: 'OLD' } }]);
  storage.setItem(TEMPLATE_STORAGE_KEY, legacy);
  storage.setItem(
    templateStorageKey('jp', 'collection'),
    JSON.stringify([{ id: 'new', name: 'JP', state: createDefaultState('jp') }])
  );
  assert.equal(readStoredTemplates(storage, 'cn', 'collection')[0].id, 'legacy:old');
  assert.equal(readStoredTemplates(storage, 'jp', 'collection')[0].name, 'JP');
  assert.deepEqual(readStoredTemplates(storage, 'cn', 'companions'), []);
  assert.equal(storage.getItem(TEMPLATE_STORAGE_KEY), legacy);
});
test('legacy template load and same-name save use a new scoped entry; deletion never changes old key', async () => {
  const storage = memory();
  const state = createDefaultState();
  const legacy = JSON.stringify([{ id: 'old', name: 'Old', state: { playerName: 'OLD' } }]);
  storage.setItem(TEMPLATE_STORAGE_KEY, legacy);
  const elements = new Map();
  const element = () => ({
    value: '',
    textContent: '',
    handlers: {},
    addEventListener(n, f) {
      this.handlers[n] = f;
    },
    replaceChildren() {},
    add() {},
    focus() {},
  });
  for (const id of ['list', 'name', 'status', 'save', 'load', 'delete', 'export', 'import'])
    elements.set('#template-' + id, element());
  const previous = {
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    Option: globalThis.Option,
  };
  globalThis.document = { querySelector: (id) => elements.get(id) };
  globalThis.localStorage = storage;
  globalThis.Option = class {
    constructor(text, value) {
      this.text = text;
      this.value = value;
    }
  };
  try {
    initializeTemplates({
      state,
      snapshotState: () => structuredClone(state),
      recordHistory() {},
      syncControlsFromState() {},
      async render() {},
    });
    elements.get('#template-list').value = 'legacy:old';
    await elements.get('#template-load').handlers.click();
    assert.equal(state.playerName, 'OLD');
    elements.get('#template-delete').handlers.click();
    assert.equal(storage.getItem(TEMPLATE_STORAGE_KEY), legacy);
    elements.get('#template-save').handlers.click();
    assert.equal(JSON.parse(storage.getItem(templateStorageKey()))[0].name, 'Old');
    assert.equal(storage.getItem(TEMPLATE_STORAGE_KEY), legacy);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
test('new draft writes never overwrite old design; old draft stays loadable', () => {
  const storage = memory();
  const old = JSON.stringify({ version: 1, state: { playerName: 'OLD' } });
  storage.setItem(LEGACY_CURRENT_DESIGN_KEY, old);
  assert.equal(readCurrentDesign(storage).playerName, 'OLD');
  saveCurrentDesign(createDefaultState('jp'), storage);
  assert.equal(readCurrentDesign(storage).region, 'jp');
  assert.ok(storage.getItem(CURRENT_DESIGN_KEY));
  assert.equal(storage.getItem(LEGACY_CURRENT_DESIGN_KEY), old);
});
test('catalog registration rejects foreign and duplicate entries', () => {
  assert.throws(() =>
    registerRegionCatalog({ ...catalog, charas: [{ id: '000001', region: 'cn' }] })
  );
  assert.throws(() =>
    registerRegionCatalog({ ...catalog, charas: [{ id: '000001' }, { id: '000001' }] })
  );
});

test('JP unavailable badges are empty and forced hidden while CN behavior stays intact', () => {
  const cn = createDefaultState();
  const jp = createDefaultState('jp');
  for (const slot of ['rank', 'friendBattle']) {
    assert.notEqual(cn.files[slot], '');
    assert.equal(cn.visible[slot], true);
    assert.equal(jp.files[slot], '');
    assert.equal(jp.visible[slot], false);
    assert.match(jp.labels[slot], /日服.*素材待补充/);
    assert.throws(() => sanitizeImportedState({ files: { [slot]: '' } }));
  }
  const edited = structuredClone(jp);
  edited.visible.rank = edited.visible.friendBattle = true;
  edited.labels.rank = 'CN badge';
  const clean = sanitizeImportedState(edited);
  assert.equal(clean.visible.rank, false);
  assert.equal(clean.visible.friendBattle, false);
  assert.equal(clean.labels.rank, '日服段位素材待补充');
  assert.deepEqual(sanitizeImportedState(cn), cn);
});
test('old JP drafts strip CN ranks and retain shared battle badges and preserve identity, party, song and background', () => {
  const jp = createDefaultState('jp');
  const cn = createDefaultState();
  jp.playerName = 'JP編集';
  jp.companions = [{ id: '000001', level: 25 }];
  jp.song = { id: '8:sd', difficulty: 3, achievement: '100.1234' };
  for (const slot of ['rank', 'friendBattle']) {
    jp.files[slot] = cn.files[slot];
    jp.visible[slot] = true;
    jp.labels[slot] = cn.labels[slot];
  }
  const storage = memory();
  storage.setItem(CURRENT_DESIGN_KEY, JSON.stringify({ version: 1, state: jp }));
  const clean = readCurrentDesign(storage);
  assert.ok(clean);
  assert.equal(clean.playerName, jp.playerName);
  assert.deepEqual(clean.companions, jp.companions);
  assert.deepEqual(clean.song, jp.song);
  assert.equal(clean.files.background, jp.files.background);
  assert.equal(clean.ratingValue, jp.ratingValue);
  assert.equal(clean.files.rank, '');
  assert.equal(clean.files.friendBattle, cn.files.friendBattle);
  assert.equal(saveCurrentDesign(jp, storage), true);
  const saved = JSON.parse(storage.getItem(CURRENT_DESIGN_KEY)).state;
  assert.equal(saved.files.rank, '');
  assert.equal(saved.visible.friendBattle, true);
});

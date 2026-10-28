const CANVAS = { width: 1080, height: 452 };
const DISPLAY_FONT = '"SEGA Maru Gothic DB"';
const RENDER_SCALE = 4;
const OUTPUT = { width: 2160, height: 904 };
const DEFAULT_BACKGROUND = 'assets/default-background.png';
const COS = {
  baseUrl: 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com',
  manifestUrl: 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com/materials/manifest.json',
  fallbackManifestUrl: 'materials/manifest.json',
  titleManifestUrl: 'materials/titles.json',
  badgeManifestUrl: 'materials/badges.json',
  cacheKey: 'maimai-diy-manifest-v2',
  pageSize: 24,
  timeout: 12000,
  retries: 2
};

const RATING_BANDS = [
  { min: 0, asset: 'UI_CMN_DXRating_S_01.png', label: '白' },
  { min: 1000, asset: 'UI_CMN_DXRating_S_02.png', label: '蓝' },
  { min: 2000, asset: 'UI_CMN_DXRating_S_03.png', label: '绿' },
  { min: 4000, asset: 'UI_CMN_DXRating_S_04.png', label: '橙' },
  { min: 7000, asset: 'UI_CMN_DXRating_S_05.png', label: '红' },
  { min: 10000, asset: 'UI_CMN_DXRating_S_06.png', label: '紫' },
  { min: 12000, asset: 'UI_CMN_DXRating_S_07.png', label: '铜' },
  { min: 13000, asset: 'UI_CMN_DXRating_S_08.png', label: '银' },
  { min: 14000, asset: 'UI_CMN_DXRating_S_09.png', label: '金' },
  { min: 14500, asset: 'UI_CMN_DXRating_S_10.png', label: '白金' },
  { min: 15000, asset: 'UI_CMN_DXRating_S_11.png', label: '虹' }
];

const slots = {
  background: { asset: 'assets/background.png', x: 0, y: 0, width: 1080, height: 452, z: 0 },
  nameplate: { asset: 'assets/nameplate.png', x: 32, y: 26, width: 717, height: 116, z: 20 },
  ratingFrame: { asset: 'assets/ratingFrame.png', x: 138, y: 30, width: 173, height: 36, z: 21 },
  ratingDigits: { asset: 'assets/ratingDigits.png', x: 227, y: 42, width: 69, height: 14, z: 22 },
  titleBase: { asset: 'assets/titles/UI_CMN_Shougou_Normal.png', x: 141, y: 111, width: 268, height: 25, z: 23 },
  titleText: { asset: 'assets/titleText.png', x: 247, y: 115, width: 51, height: 12, z: 24 },
  rank: { asset: 'assets/rank.png', x: 326, y: 69, width: 80, height: 35, z: 90 },
  friendBattle: { asset: 'assets/friendBattle.png', x: 312, y: 7, width: 108, height: 67, z: 100 },
  nameBase: { asset: 'assets/nameBase.png', x: 142, y: 67, width: 267, height: 40, z: 27 },
  playerName: { asset: 'assets/playerName.png', x: 150.93611859870788, y: 78.05231089799081, width: 174.57249, height: 18, z: 28 },
  avatar: { asset: 'assets/avatar.png', x: 37, y: 33, width: 100, height: 99, z: 30 }
};

const controls = [
  { id: 'background', label: '背景板', short: '景', slotIds: ['background'], target: 'background', category: 'backgrounds', canHide: false, hasUpload: false },
  { id: 'nameplate', label: '名牌', short: '牌', slotIds: ['nameplate'], target: 'nameplate', category: 'nameplates', canHide: false, hasUpload: false },
  { id: 'avatar', label: '头像', short: '像', slotIds: ['avatar'], target: 'avatar', category: 'avatars', canHide: false, hasUpload: true },
  { id: 'rating', label: 'Rating', short: 'R', slotIds: ['ratingFrame', 'ratingDigits'], target: 'ratingFrame', category: 'ratings', canHide: true, hasLibrary: false, hasUpload: false },
  { id: 'title', label: '称号', short: '称', slotIds: ['titleBase', 'titleText'], target: 'titleBase', category: 'titles', canHide: false, hasUpload: false },
  { id: 'playerName', label: '名称', short: '名', slotIds: ['nameBase', 'playerName'], target: 'nameBase', category: 'name-bases', canHide: false, hasLibrary: false, hasUpload: false },
  { id: 'rank', label: '段位', short: '段', slotIds: ['rank'], target: 'rank', category: 'ranks', canHide: true, hasUpload: false },
  { id: 'friendBattle', label: '友人对战', short: '战', slotIds: ['friendBattle'], target: 'friendBattle', category: 'friend-battles', canHide: true, hasUpload: false }
];

const canvas = document.querySelector('#preview');
const previewCtx = canvas.getContext('2d');
const renderCanvas = document.createElement('canvas');
renderCanvas.width = CANVAS.width * RENDER_SCALE;
renderCanvas.height = CANVAS.height * RENDER_SCALE;
const ctx = renderCanvas.getContext('2d');
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
previewCtx.imageSmoothingEnabled = true;
previewCtx.imageSmoothingQuality = 'high';
const loading = document.querySelector('#loading');
const assetStatus = document.querySelector('#asset-status');
const picker = document.querySelector('#asset-picker');
const pickerTitle = document.querySelector('#picker-title');
const pickerMeta = document.querySelector('#picker-meta');
const pickerGrid = document.querySelector('#picker-grid');
const pickerMessage = document.querySelector('#picker-message');
const pickerMore = document.querySelector('#picker-more');
const pickerSearch = document.querySelector('#picker-search');
const pickerFilter = document.querySelector('#picker-filter');
const TEMPLATE_STORAGE_KEY = 'maimai-diy-templates-v1';
const TEMPLATE_FILE_FORMAT = 'MaimaiDIY-template';
const TEMPLATE_FILE_VERSION = 1;
const TEMPLATE_FILE_MAX_BYTES = 10 * 1024 * 1024;
const HISTORY_LIMIT = 5;
const DEFAULT_PRESET = {
  ratingValue: 16393,
  playerName: 'Observ.L',
  titleName: 'チエルカ／エソテリカ',
  titleColor: 'Gold',
  files: {
    background: DEFAULT_BACKGROUND,
    nameplate: `${COS.baseUrl}/materials/nameplates/UI_Plate_006150.png`,
    avatar: `${COS.baseUrl}/materials/avatars/UI_Icon_559504.png`,
    titleBase: 'assets/titles/UI_CMN_Shougou_Gold.png',
    rank: 'assets/ranks/18.png',
    friendBattle: 'assets/friend-battles/21.png'
  },
  labels: {
    background: '7sRefちほー おまけ',
    nameplate: '舞将',
    avatar: 'KALEIDXSCOPE -旧き世界-',
    title: 'チエルカ／エソテリカ',
    rank: '真七段',
    friendBattle: 'SSS4'
  }
};
const state = { files: {}, visible: {}, labels: {}, ratingValue: 16393, playerName: 'Observ.L', titleName: DEFAULT_PRESET.titleName, titleColor: 'Gold' };
let manifest;
let titleManifest;
let badgeManifest;
let renderVersion = 0;
const imageCache = new Map();
let pickerState = { control: null, category: null, items: [], shown: 0 };
const history = { past: [], future: [], transaction: null };
const largePreview = document.querySelector('#large-preview');
canvas.tabIndex = 0;
canvas.setAttribute('role', 'button');
canvas.setAttribute('aria-label', '打开横屏大屏预览');
function openLargePreview() {
  const enlarged = largePreview.querySelector('canvas');
  const enlargedContext = enlarged.getContext('2d');
  enlargedContext.imageSmoothingQuality = 'high';
  enlargedContext.drawImage(renderCanvas, 0, 0, enlarged.width, enlarged.height);
  largePreview.showModal();
}
canvas.addEventListener('click', openLargePreview);
canvas.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openLargePreview(); }
});
largePreview.addEventListener('click', () => largePreview.close());
const undoButton = document.querySelector('#undo');
const redoButton = document.querySelector('#redo');

const TITLE_COLOR_NAMES = {
  Normal: '普通', Bronze: '铜', Silver: '银', Gold: '金', Rainbow: '彩虹'
};

function snapshotState() {
  return JSON.parse(JSON.stringify(state));
}

function updateHistoryButtons() {
  undoButton.disabled = history.past.length === 0;
  redoButton.disabled = history.future.length === 0;
  undoButton.title = history.past.length ? `撤回（剩余 ${history.past.length} 步）` : '没有可撤回的操作';
  redoButton.title = history.future.length ? `重做（剩余 ${history.future.length} 步）` : '没有可重做的操作';
}

function recordHistory(transaction = null) {
  if (transaction && history.transaction === transaction) return;
  history.past.push(snapshotState());
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future.length = 0;
  history.transaction = transaction;
  updateHistoryButtons();
}

function endHistoryTransaction(transaction) {
  if (history.transaction === transaction) history.transaction = null;
}

async function restoreHistoryState(snapshot) {
  Object.assign(state, JSON.parse(JSON.stringify(snapshot)));
  applyRatingBand();
  syncControlsFromState();
  await render();
}

async function undo() {
  if (!history.past.length) return;
  history.transaction = null;
  history.future.push(snapshotState());
  if (history.future.length > HISTORY_LIMIT) history.future.shift();
  await restoreHistoryState(history.past.pop());
  updateHistoryButtons();
}

async function redo() {
  if (!history.future.length) return;
  history.transaction = null;
  history.past.push(snapshotState());
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  await restoreHistoryState(history.future.pop());
  updateHistoryButtons();
}

function resetState() {
  if (state.files.avatar?.startsWith('blob:')) URL.revokeObjectURL(state.files.avatar);
  Object.entries(slots).forEach(([id, slot]) => {
    state.files[id] = slot.asset;
    state.visible[id] = true;
  });
  Object.assign(state.files, DEFAULT_PRESET.files);
  state.ratingValue = DEFAULT_PRESET.ratingValue;
  state.playerName = DEFAULT_PRESET.playerName;
  state.titleName = DEFAULT_PRESET.titleName;
  state.titleColor = DEFAULT_PRESET.titleColor;
  state.labels = { ...DEFAULT_PRESET.labels };
  applyRatingBand();
}

function ratingBand(value) {
  return [...RATING_BANDS].reverse().find((band) => value >= band.min) || RATING_BANDS[0];
}

function applyRatingBand() {
  const band = ratingBand(state.ratingValue);
  state.files.ratingFrame = `${COS.baseUrl}/materials/ratings/${band.asset}`;
  return band;
}

function textWidth(text, spacing) {
  return [...text].reduce((width, char, index) => (
    width + ctx.measureText(char).width + (index ? spacing : 0)
  ), 0);
}

function drawSpacedText(text, x, y, spacing, maxWidth, align = 'left', stroke = false) {
  const chars = [...text];
  const naturalWidth = textWidth(text, spacing);
  const scale = maxWidth && naturalWidth > maxWidth ? maxWidth / naturalWidth : 1;
  const visualWidth = naturalWidth * scale;
  let cursor = align === 'right' ? x - visualWidth : align === 'center' ? x - visualWidth / 2 : x;
  ctx.save();
  ctx.translate(cursor, y);
  ctx.scale(scale, 1);
  chars.forEach((char, index) => {
    if (stroke) ctx.strokeText(char, 0, 0);
    ctx.fillText(char, 0, 0);
    cursor = ctx.measureText(char).width + (index < chars.length - 1 ? spacing : 0);
    ctx.translate(cursor, 0);
  });
  ctx.restore();
}

function drawRatingValue() {
  const digits = String(state.ratingValue).slice(-5);
  const cellCenters = [230.5, 246, 261, 276, 291];
  const startCell = 5 - digits.length;
  ctx.save();
  ctx.font = `700 15px ${DISPLAY_FONT}, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fbc802';
  ctx.fillStyle = '#fbc802';
  [...digits].forEach((digit, index) => {
    const x = cellCenters[startCell + index];
    const y = 49;
    ctx.strokeText(digit, x, y);
    ctx.fillText(digit, x, y);
  });
  ctx.restore();
}

function drawPlayerName() {
  const slot = slots.playerName;
  ctx.save();
  ctx.font = `400 16px ${DISPLAY_FONT}, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111318';
  const availableWidth = slots.rank.x - slot.x - 4;
  const spacing = (availableWidth - ctx.measureText('あ').width * 8) / 7;
  drawSpacedText(state.playerName || '', slot.x, 87, spacing, availableWidth);
  ctx.restore();
}

function drawTitleText() {
  const slot = slots.titleBase;
  ctx.save();
  ctx.font = `600 13.33333px ${DISPLAY_FONT}, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const normal = state.titleColor === 'Normal';
  // Canvas strokes are centered on the glyph edge. Drawing twice the desired
  // outer width and then filling the glyph leaves a true outside-only outline.
  ctx.lineWidth = normal ? 2 : 2.4;
  ctx.strokeStyle = normal ? 'rgba(35, 39, 52, .92)' : 'rgba(42, 31, 5, .9)';
  ctx.fillStyle = '#ffffff';
  drawSpacedText(state.titleName, 272.2223658521258, 126.44731107159686, .2666666, slot.width - 20, 'center', true);
  ctx.restore();
}

function drawTitleBase(image, slot) {
  // The source has transparent rows 0–4 and 30–35. Cropping only those rows
  // thickens the frame vertically without changing its destination bounds.
  ctx.drawImage(image, 0, 5, image.naturalWidth, 25, slot.x, slot.y, slot.width, slot.height);
}

function titleAsset(color) {
  const supported = ['Normal', 'Silver', 'Gold', 'Rainbow'];
  const fileColor = supported.includes(color) ? color : 'Gold';
  return `assets/titles/UI_CMN_Shougou_${fileColor}.png`;
}

function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const request = new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      image.src = '';
      reject(new Error(`素材加载超时：${src}`));
    }, COS.timeout);
    if (/^https?:\/\//.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = (error) => {
      window.clearTimeout(timer);
      reject(error);
    };
    image.src = src;
  });
  imageCache.set(src, request);
  request.catch(() => imageCache.delete(src));
  return request;
}

function inspectLocalImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight, objectUrl });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('无法读取图片'));
    };
    image.src = objectUrl;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('无法读取图片'));
    reader.readAsDataURL(file);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, forceFresh = false) {
  let lastError;
  for (let attempt = 0; attempt <= COS.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COS.timeout);
    try {
      const requestUrl = forceFresh ? `${url}${url.includes('?') ? '&' : '?'}refresh=${Date.now()}` : url;
      const response = await fetch(requestUrl, { signal: controller.signal, cache: forceFresh ? 'reload' : 'default' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < COS.retries) await wait(350 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function validateManifest(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.categories)) {
    throw new Error('素材清单格式不兼容');
  }
  return data;
}

async function loadManifest() {
  const sources = [COS.fallbackManifestUrl, COS.manifestUrl];
  for (const url of sources) {
    try {
      const data = validateManifest(await fetchJson(url, true));
      normalizeManifestGroups(data);
      try { localStorage.setItem(COS.cacheKey, JSON.stringify(data)); }
      catch (error) { console.warn('素材索引缓存写入失败', error); }
      return data;
    } catch (error) {
      console.warn(`无法读取素材清单：${url}`, error);
    }
  }
  const cached = localStorage.getItem(COS.cacheKey);
  if (cached) return validateManifest(JSON.parse(cached));
  throw new Error('素材库暂时不可用');
}

function normalizeManifestGroups(data) {
  const regionNames = {
    'イベント': '活动', 'オリジナル': '原创', '天界': '天界',
    '月面': '月面', '裏 月面': '里 月面', 'はじまりの': '启程',
    'メトロポリス': '大都会', '宇宙すてーしょん': '宇宙空间站', 'BLACKROSE': '黑蔷薇',
    'BLACK ROSE': '黑蔷薇', 'しゅわしゅわ': '咻哇咻哇'
  };
  data.categories.forEach((category) => {
    const seenAssets = new Set();
    category.items = category.items.filter(item => {
      const key = item.gameId != null ? `game:${item.gameId}` : `file:${item.source || item.file}`;
      if (seenAssets.has(key)) return false;
      seenAssets.add(key);
      return true;
    });
    category.count = category.items.length;
    category.items.forEach(item => {
      const region = /^(.*)ちほー(\d*)(.*)$/.exec(item.genre || '');
      if (region && regionNames[region[1]]) {
        item.group = `${regionNames[region[1]]}区域${region[2]}${region[3]}`;
      }
    });
    const genreGroups = new Map();
    category.items.forEach((item) => {
      if (item.genre && item.group && !/^2026\s*·\s*/.test(item.group)) genreGroups.set(item.genre, item.group);
    });
    category.items.forEach((item) => {
      if (!/^2026\s*·\s*/.test(item.group || '')) return;
      item.group = genreGroups.get(item.genre) || item.group.replace(/^2026\s*·\s*/, '');
    });
  });
  return data;
}

function assetUrl(item, refresh = false) {
  const suffix = refresh ? `${item.file.includes('?') ? '&' : '?'}selected=${Date.now()}` : '';
  if (item.local) return `${item.file}${suffix}`;
  const path = item.source || item.file.split('/').map(encodeURIComponent).join('/');
  return `${COS.baseUrl}/materials/${path}${suffix}`;
}

async function loadTitleManifest() {
  titleManifest ||= await fetchJson(COS.titleManifestUrl);
  return titleManifest;
}

async function loadBadgeManifest() {
  badgeManifest ||= validateManifest(await fetchJson(COS.badgeManifestUrl));
  const ranks = badgeManifest.categories.find((category) => category.id === 'ranks');
  if (ranks) ranks.items = ranks.items.filter((item) => item.id !== 'ranks/11' && item.name !== '真段位');
  return badgeManifest;
}

function setAssetStatus(mode, text) {
  assetStatus.className = `status ${mode}`;
  assetStatus.innerHTML = `<i></i> ${text}`;
}

function showPickerMessage(text) {
  pickerMessage.textContent = text;
  pickerMessage.hidden = false;
}

function appendPickerItems() {
  const { control, items } = pickerState;
  const next = items.slice(pickerState.shown, pickerState.shown + COS.pageSize);
  next.forEach((item) => {
    const button = document.createElement('button');
    button.className = 'asset-item';
    button.type = 'button';
    const image = control.id === 'title' ? document.createElement('i') : document.createElement('img');
    if (control.id === 'title') {
      image.className = `title-swatch title-${String(item.color).toLowerCase()}`;
      image.textContent = item.name;
    } else {
      image.loading = 'lazy';
      image.decoding = 'async';
      image.fetchPriority = 'low';
      image.alt = item.name;
      image.src = assetUrl(item);
    }
    const name = document.createElement('span');
    name.textContent = item.name;
    const group = document.createElement('small');
    group.textContent = item.group || TITLE_COLOR_NAMES[item.color] || '未分类';
    button.title = [item.name, item.description, item.id].filter(Boolean).join('\n');
    button.append(image, name, group);
    button.addEventListener('click', async () => {
      recordHistory();
      if (control.id === 'title') {
        state.titleName = item.name;
        state.titleColor = item.color || 'Normal';
        state.files.titleBase = titleAsset(state.titleColor);
      } else {
        state.files[control.target] = assetUrl(item, true);
      }
      state.labels[control.id] = item.name;
      state.visible[control.target] = true;
      document.querySelector(`[data-control="${control.id}"] .control-file`).textContent = item.name;
      picker.close();
      await render();
    });
    pickerGrid.appendChild(button);
  });
  pickerState.shown += next.length;
  pickerMore.hidden = pickerState.shown >= items.length;
}

function itemGroup(item) {
  return item.group || TITLE_COLOR_NAMES[item.color] || '未分类';
}

function materialNumericId(item) {
  const gameId = Number(item.gameId);
  if (item.gameId != null && Number.isFinite(gameId)) return gameId;
  const matches = String(item.id || item.file || '').match(/\d+/g);
  return matches ? Number(matches[matches.length - 1]) : Number.MAX_SAFE_INTEGER;
}

function compareMaterialGroups(a, b) {
  if (pickerState.category?.id === 'friend-battles') {
    const order = ['B', 'A', 'S', 'SS', 'SSS', 'LEGEND'];
    const rank = value => {
      const index = order.indexOf(value.replace(/级$/, '').toUpperCase());
      return index < 0 ? order.length : index;
    };
    const difference = rank(a) - rank(b);
    if (difference) return difference;
  }
  return a.localeCompare(b, 'zh-CN', { numeric: true });
}

function comparePickerItems(a, b, selectedGroup) {
  const byGroup = selectedGroup ? 0 : compareMaterialGroups(itemGroup(a), itemGroup(b));
  return byGroup || materialNumericId(a) - materialNumericId(b)
    || String(a.id || a.file || '').localeCompare(String(b.id || b.file || ''), 'zh-CN', { numeric: true });
}

function applyPickerFilters() {
  if (!pickerState.category) return;
  const query = pickerSearch.value.trim().toLocaleLowerCase('zh-CN');
  const group = pickerFilter.value;
  pickerState.items = pickerState.category.items.filter((item) => {
    if (group && itemGroup(item) !== group) return false;
    if (!query) return true;
    const searchable = [item.name, item.id, item.description, item.genre, itemGroup(item), item.gameId]
      .filter((value) => value !== undefined && value !== null)
      .join(' ')
      .toLocaleLowerCase('zh-CN');
    return searchable.includes(query);
  }).sort((a, b) => comparePickerItems(a, b, group));
  pickerState.shown = 0;
  pickerGrid.replaceChildren();
  pickerMessage.hidden = pickerState.items.length > 0;
  if (!pickerState.items.length) showPickerMessage('没有符合当前搜索和分类条件的素材。');
  pickerMeta.textContent = `找到 ${pickerState.items.length} / ${pickerState.category.items.length} 个素材`;
  appendPickerItems();
}

function preparePickerFilters(category) {
  pickerSearch.value = '';
  pickerFilter.replaceChildren(new Option('全部分类', ''));
  const groups = [...new Set(category.items.map(itemGroup))]
    .sort(compareMaterialGroups);
  groups.forEach((group) => pickerFilter.add(new Option(`${group}（${category.items.filter((item) => itemGroup(item) === group).length}）`, group)));
}

async function openPicker(control) {
  pickerTitle.textContent = `选择${control.label}`;
  pickerMeta.textContent = '正在读取云端素材…';
  pickerGrid.replaceChildren();
  pickerSearch.value = '';
  pickerFilter.replaceChildren(new Option('全部分类', ''));
  pickerMore.hidden = true;
  pickerMessage.hidden = true;
  picker.showModal();
  try {
    manifest ||= await loadManifest();
    let category;
    if (control.id === 'title') {
      category = { id: 'titles', label: '称号', items: (await loadTitleManifest()).items };
    } else if (['rank', 'friendBattle'].includes(control.id)) {
      category = (await loadBadgeManifest()).categories.find((item) => item.id === control.category);
    } else {
      category = manifest.categories.find((item) => item.id === control.category);
    }
    if (!category || !category.items?.length) {
      pickerMeta.textContent = '当前分类暂无云端素材';
      showPickerMessage('可继续使用默认素材，或通过“本地上传”替换。');
      return;
    }
    pickerState = { control, category, items: category.items, shown: 0 };
    preparePickerFilters(category);
    applyPickerFilters();
  } catch (error) {
    pickerMeta.textContent = '连接失败';
    showPickerMessage('素材库暂时不可用，请稍后重试；默认素材和本地上传不受影响。');
  }
}

function nameCharacterCount(value) {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(value)].length;
  }
  return [...value].length;
}

async function render() {
  if (nameCharacterCount(state.playerName || '') > 8) {
    alert('名称最多允许八个字符，请修改后再试。');
    return;
  }
  const version = ++renderVersion;
  loading.hidden = false;
  const ordered = Object.entries(slots)
    .filter(([id]) => !['rank', 'friendBattle'].includes(id))
    .sort((a, b) => a[1].z - b[1].z);
  ordered.push(['rank', slots.rank]);
  ordered.push(['friendBattle', slots.friendBattle]);
  const drawable = [];
  try {
    const prepared = ordered.map(async ([id, slot]) => {
      if (!state.visible[id]) return null;
      if (['ratingDigits', 'playerName'].includes(id) || (id === 'titleText' && state.titleName)) {
        return { id, slot };
      }
      try {
        return { id, slot, image: await loadImage(state.files[id]) };
      } catch (error) {
        console.warn(`素材加载失败：${state.files[id]}`, error);
        if (id === 'background' && state.files[id] !== DEFAULT_BACKGROUND) {
          return { id, slot, image: await loadImage(DEFAULT_BACKGROUND) };
        }
        return null;
      }
    });
    drawable.push(...(await Promise.all(prepared)).filter(Boolean));
    if (version !== renderVersion) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    for (const { id, slot, image } of drawable) {
      if (id === 'ratingDigits') { drawRatingValue(); continue; }
      if (id === 'playerName') { drawPlayerName(); continue; }
      if (id === 'titleText' && state.titleName) { drawTitleText(); continue; }
      if (id === 'titleBase' && state.titleColor === 'Bronze') {
        ctx.save();
        ctx.filter = 'sepia(1) saturate(1.25) brightness(.78)';
        drawTitleBase(image, slot);
        ctx.restore();
      } else if (id === 'titleBase') {
        drawTitleBase(image, slot);
      } else {
        ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
      }
    }
    previewCtx.clearRect(0, 0, CANVAS.width, CANVAS.height);
    previewCtx.drawImage(renderCanvas, 0, 0, CANVAS.width, CANVAS.height);
    controls.forEach(control => {
      const icon = document.querySelector(`[data-control="${control.id}"] .control-icon`);
      if (!icon) return;
      const image = document.createElement('img');
      image.alt = '';
      image.src = state.files[control.target] || slots[control.target].asset;
      icon.replaceChildren(image);
    });
  } finally {
    if (version === renderVersion) loading.hidden = true;
  }
}

function buildControls() {
  const root = document.querySelector('#controls');
  const template = document.querySelector('#control-template');
  controls.forEach((control) => {
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector('.control-row');
    const icon = fragment.querySelector('.control-icon');
    const label = fragment.querySelector('.control-label');
    const fileLabel = fragment.querySelector('.control-file');
    const switchWrap = fragment.querySelector('.switch-wrap');
    const checkbox = fragment.querySelector('.visibility');
    const input = fragment.querySelector('.file-input');
    const libraryButton = fragment.querySelector('.library-button');
    const ratingEditor = fragment.querySelector('.rating-editor');
    const ratingInput = fragment.querySelector('.rating-input');
    const nameEditor = fragment.querySelector('.name-editor');
    const nameInput = fragment.querySelector('.name-input');
    const uploadButton = fragment.querySelector('.upload-button');
    icon.textContent = '';
    label.textContent = control.label;
    row.dataset.control = control.id;
    if (!control.canHide) switchWrap.hidden = true;
    if (control.hasLibrary === false) libraryButton.hidden = true;
    if (control.hasUpload === false) uploadButton.hidden = true;
    if (control.id === 'rating') {
      ratingEditor.hidden = false;
      ratingInput.addEventListener('input', () => {
        recordHistory('rating');
        const parsed = Number.parseInt(ratingInput.value, 10);
        state.ratingValue = Number.isFinite(parsed) ? Math.min(99999, Math.max(0, parsed)) : 0;
        const band = applyRatingBand();
        fileLabel.textContent = `${band.label}框 · ${state.ratingValue}`;
        render();
      });
      ratingInput.addEventListener('blur', () => endHistoryTransaction('rating'));
    }
    if (control.id === 'playerName') {
      nameEditor.hidden = false;
      nameInput.addEventListener('input', () => {
        const valid = nameCharacterCount(nameInput.value) <= 8;
        nameInput.setCustomValidity(valid ? '' : '名称最多允许八个字符');
        nameInput.setAttribute('aria-invalid', String(!valid));
        if (!valid) return;
        recordHistory('playerName');
        state.playerName = nameInput.value;
        fileLabel.textContent = nameInput.value || '未输入名称';
        render();
      });
      nameInput.addEventListener('blur', () => {
        endHistoryTransaction('playerName');
        if (nameCharacterCount(nameInput.value) > 8) {
          alert('名称最多允许八个字符，超出部分不会渲染。请修改名称。');
        }
      });
    }
    if (control.id === 'avatar') {
      fileLabel.textContent = '默认素材 · 上传限 1:1，最大 720 × 720';
      input.setAttribute('aria-label', '上传头像，要求 1:1，最大 720 × 720 像素');
    }
    libraryButton.addEventListener('click', () => openPicker(control));

    checkbox.addEventListener('change', () => {
      recordHistory();
      control.slotIds.forEach((slotId) => { state.visible[slotId] = checkbox.checked; });
      render();
    });

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      input.value = '';
      if (control.id !== 'avatar') return;
      try {
        const { width, height, objectUrl } = await inspectLocalImage(file);
        if (width > 720 || height > 720 || width !== height) {
          URL.revokeObjectURL(objectUrl);
          fileLabel.textContent = `不符合要求：${width} × ${height}`;
          alert('头像必须为 1:1 正方形，且宽、高均不得超过 720 像素。');
          return;
        }
        if (state.files.avatar?.startsWith('blob:')) URL.revokeObjectURL(state.files.avatar);
        recordHistory();
        state.files.avatar = await fileToDataUrl(file);
        URL.revokeObjectURL(objectUrl);
        state.visible.avatar = true;
        state.labels.avatar = `${file.name} · ${width} × ${height}`;
        fileLabel.textContent = `${file.name} · ${width} × ${height}`;
        await render();
      } catch (error) {
        fileLabel.textContent = '图片读取失败';
        alert('无法读取该头像图片，请选择 PNG、JPEG 或 WebP 文件。');
      }
    });
    root.appendChild(fragment);
  });
}

function readTemplates() {
  try {
    const value = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}

function refreshTemplateList(selectedId = '') {
  const list = document.querySelector('#template-list');
  const templates = readTemplates();
  list.replaceChildren();
  if (!templates.length) list.add(new Option('暂无模板', ''));
  templates.forEach((template) => list.add(new Option(template.name, template.id)));
  if (selectedId) list.value = selectedId;
}

function syncControlsFromState() {
  document.querySelector('[data-control="rating"] .rating-input').value = String(state.ratingValue);
  document.querySelector('[data-control="playerName"] .name-input').value = state.playerName;
  controls.forEach((control) => {
    const row = document.querySelector(`[data-control="${control.id}"]`);
    const visible = control.slotIds.every((slotId) => state.visible[slotId] !== false);
    row.querySelector('.visibility').checked = visible;
    const fallback = control.id === 'avatar' ? '默认素材 · 上传限 1:1，最大 720 × 720' : '默认素材';
    row.querySelector('.control-file').textContent = state.labels[control.id] || fallback;
  });
  const band = ratingBand(state.ratingValue);
  document.querySelector('[data-control="rating"] .control-file').textContent = `${band.label}框 · ${state.ratingValue}`;
  document.querySelector('[data-control="playerName"] .control-file').textContent = state.playerName || '未输入名称';
}

function saveTemplate() {
  const nameInput = document.querySelector('#template-name');
  const status = document.querySelector('#template-status');
  const name = nameInput.value.trim();
  if (!name) {
    status.textContent = '请先输入模板名称。';
    nameInput.focus();
    return;
  }
  const templates = readTemplates();
  const existing = templates.find((item) => item.name === name);
  const template = {
    id: existing?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    savedAt: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(state))
  };
  const next = existing ? templates.map((item) => item.id === existing.id ? template : item) : [...templates, template];
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
    refreshTemplateList(template.id);
    status.textContent = existing ? `已更新“${name}”。` : `已保存“${name}”。`;
  } catch (error) {
    status.textContent = '保存失败：浏览器本地空间不足，请换用体积更小的头像。';
  }
}

function safeTemplateName(value) {
  const name = String(value || '').trim().slice(0, 30);
  return name || 'MaimaiDIY 模板';
}

function isAllowedAsset(value, slotId) {
  if (typeof value !== 'string' || value.length > TEMPLATE_FILE_MAX_BYTES) return false;
  if (/^(?:assets|materials)\//.test(value)) return true;
  if (value.startsWith(`${COS.baseUrl}/materials/`)) return true;
  return slotId === 'avatar' && /^data:image\/(?:png|jpeg|webp);base64,/i.test(value);
}

function sanitizeImportedState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('模板状态无效');
  const next = snapshotState();
  if (value.files && typeof value.files === 'object') {
    Object.keys(slots).forEach((slotId) => {
      if (isAllowedAsset(value.files[slotId], slotId)) next.files[slotId] = value.files[slotId];
    });
  }
  if (value.visible && typeof value.visible === 'object') {
    Object.keys(slots).forEach((slotId) => {
      if (typeof value.visible[slotId] === 'boolean') next.visible[slotId] = value.visible[slotId];
    });
  }
  ['nameplate', 'avatar', 'titleBase', 'titleText', 'nameBase', 'playerName'].forEach((slotId) => {
    next.visible[slotId] = true;
  });
  if (value.labels && typeof value.labels === 'object') {
    controls.forEach((control) => {
      if (typeof value.labels[control.id] === 'string') next.labels[control.id] = value.labels[control.id].slice(0, 120);
    });
  }
  const rating = Number(value.ratingValue);
  if (Number.isFinite(rating)) next.ratingValue = Math.max(0, Math.min(99999, Math.round(rating)));
  if (typeof value.playerName === 'string') {
    if (nameCharacterCount(value.playerName) > 8) throw new Error('模板名称字段中的玩家名称超过八个字符');
    next.playerName = value.playerName;
  }
  if (typeof value.titleName === 'string') next.titleName = value.titleName.slice(0, 100);
  if (Object.hasOwn(TITLE_COLOR_NAMES, value.titleColor)) next.titleColor = value.titleColor;
  return next;
}

function selectedTemplateName() {
  const selectedId = document.querySelector('#template-list').value;
  return readTemplates().find((item) => item.id === selectedId)?.name;
}

function exportTemplateFile() {
  const name = safeTemplateName(document.querySelector('#template-name').value || selectedTemplateName());
  const payload = {
    format: TEMPLATE_FILE_FORMAT,
    version: TEMPLATE_FILE_VERSION,
    name,
    exportedAt: new Date().toISOString(),
    state: snapshotState()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const safeName = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim();
  const url = URL.createObjectURL(blob);
  link.download = `${safeName || 'MaimaiDIY-template'}.maimai.json`;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  document.querySelector('#template-status').textContent = `已导出“${name}”。`;
}

async function importTemplateFile(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  const status = document.querySelector('#template-status');
  input.value = '';
  if (!file) return;
  if (file.size > TEMPLATE_FILE_MAX_BYTES) {
    status.textContent = '导入失败：JSON 文件不能超过 10 MB。';
    return;
  }
  try {
    const payload = JSON.parse(await file.text());
    if (payload.format !== TEMPLATE_FILE_FORMAT || payload.version !== TEMPLATE_FILE_VERSION) {
      throw new Error('不是受支持的 MaimaiDIY 模板文件');
    }
    const name = safeTemplateName(payload.name);
    const importedState = sanitizeImportedState(payload.state);
    recordHistory();
    Object.assign(state, importedState);
    applyRatingBand();
    syncControlsFromState();
    const templates = readTemplates();
    const existing = templates.find((item) => item.name === name);
    const template = {
      id: existing?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      savedAt: new Date().toISOString(),
      state: snapshotState()
    };
    const next = existing ? templates.map((item) => item.id === existing.id ? template : item) : [...templates, template];
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
    refreshTemplateList(template.id);
    document.querySelector('#template-name').value = name;
    status.textContent = existing ? `已导入并更新“${name}”。` : `已导入并保存“${name}”。`;
    await render();
  } catch (error) {
    status.textContent = `导入失败：${error.message || '文件内容无效'}`;
  }
}

async function loadTemplate() {
  const id = document.querySelector('#template-list').value;
  const template = readTemplates().find((item) => item.id === id);
  if (!template) return;
  recordHistory();
  Object.assign(state, JSON.parse(JSON.stringify(template.state)));
  applyRatingBand();
  syncControlsFromState();
  document.querySelector('#template-name').value = template.name;
  document.querySelector('#template-status').textContent = `已载入“${template.name}”。`;
  await render();
}

function deleteTemplate() {
  const list = document.querySelector('#template-list');
  const template = readTemplates().find((item) => item.id === list.value);
  if (!template) return;
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(readTemplates().filter((item) => item.id !== template.id)));
  refreshTemplateList();
  document.querySelector('#template-status').textContent = `已删除“${template.name}”。`;
}

document.querySelector('#reset').addEventListener('click', () => {
  recordHistory();
  resetState();
  Object.assign(state.files, {
    background: `${COS.baseUrl}/materials/backgrounds/UI_Frame_000001.png`,
    nameplate: `${COS.baseUrl}/materials/nameplates/UI_Plate_000001.png`,
    avatar: `${COS.baseUrl}/materials/avatars/UI_Icon_000001.png`,
    titleBase: titleAsset('Normal'),
    rank: 'assets/ranks/00.png',
    friendBattle: 'assets/friend-battles/00.png'
  });
  state.titleName = '新人出道';
  state.titleColor = 'Normal';
  state.ratingValue = 0;
  state.playerName = 'GUEST';
  applyRatingBand();
  Object.assign(state.labels, { background: 'デフォルト', nameplate: 'デフォルト', avatar: 'デフォルト', title: '新人出道', rank: '初学者', friendBattle: 'B5' });
  syncControlsFromState();
  render();
});

undoButton.addEventListener('click', undo);
redoButton.addEventListener('click', redo);

document.querySelector('#template-save').addEventListener('click', saveTemplate);
document.querySelector('#template-load').addEventListener('click', loadTemplate);
document.querySelector('#template-delete').addEventListener('click', deleteTemplate);
document.querySelector('#template-export').addEventListener('click', exportTemplateFile);
document.querySelector('#template-import').addEventListener('change', importTemplateFile);

document.querySelector('#export').addEventListener('click', () => {
  try {
    const link = document.createElement('a');
    link.download = `maimai-diy-${OUTPUT.width}x${OUTPUT.height}-${Date.now()}.png`;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = OUTPUT.width;
    outputCanvas.height = OUTPUT.height;
    const outputContext = outputCanvas.getContext('2d');
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(renderCanvas, 0, 0, OUTPUT.width, OUTPUT.height);
    link.href = outputCanvas.toDataURL('image/png');
    link.click();
  } catch (error) {
    alert('云端素材的跨域设置尚未生效，暂时无法导出。请稍后重试。');
  }
});

document.querySelector('#picker-close').addEventListener('click', () => picker.close());
pickerMore.addEventListener('click', appendPickerItems);
pickerSearch.addEventListener('input', applyPickerFilters);
pickerFilter.addEventListener('change', applyPickerFilters);
picker.addEventListener('click', (event) => {
  if (event.target === picker) picker.close();
});

async function initialize() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((registration) => registration.update()).catch((error) => {
      console.warn('素材缓存初始化失败', error);
    });
  }
  resetState();
  buildControls();
  syncControlsFromState();
  refreshTemplateList();
  loading.hidden = false;
  try {
    const data = await loadManifest();
    manifest = data;
    setAssetStatus('is-online', `云端素材已连接 · ${data.summary?.items ?? 0} 项`);
  } catch (error) {
    setAssetStatus('is-offline', '素材索引暂时不可用 · 云端图片仍可加载');
  }
  await document.fonts.load(`18px ${DISPLAY_FONT}`).catch(error => console.warn('字体加载失败', error));
  await Promise.allSettled(Object.values(state.files).map(loadImage));
  await render();
}

initialize();

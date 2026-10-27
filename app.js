const CANVAS = { width: 1080, height: 452 };
const DISPLAY_FONT = '"Morisawa UD Shin Go"';
const RENDER_SCALE = 2;
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
  titleBase: { asset: 'assets/titleBase.png', x: 141, y: 111, width: 268, height: 25, z: 23 },
  titleText: { asset: 'assets/titleText.png', x: 247, y: 115, width: 51, height: 12, z: 24 },
  rank: { asset: 'assets/rank.png', x: 326, y: 69, width: 80, height: 35, z: 90 },
  friendBattle: { asset: 'assets/friendBattle.png', x: 312, y: 7, width: 108, height: 67, z: 100 },
  nameBase: { asset: 'assets/nameBase.png', x: 142, y: 67, width: 267, height: 40, z: 27 },
  playerName: { asset: 'assets/playerName.png', x: 152, y: 78, width: 102, height: 18, z: 28 },
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
const state = { files: {}, visible: {}, ratingValue: 15000, playerName: 'maimai', titleName: null, titleColor: 'Normal' };
let manifest;
let titleManifest;
let badgeManifest;
let renderVersion = 0;
const imageCache = new Map();
let pickerState = { control: null, category: null, items: [], shown: 0 };

const TITLE_COLOR_NAMES = {
  Normal: '普通', Bronze: '铜', Silver: '银', Gold: '金', Rainbow: '彩虹'
};

function resetState() {
  if (state.files.avatar?.startsWith('blob:')) URL.revokeObjectURL(state.files.avatar);
  Object.entries(slots).forEach(([id, slot]) => {
    state.files[id] = slot.asset;
    state.visible[id] = true;
  });
  state.ratingValue = 15000;
  state.playerName = 'maimai';
  state.titleName = null;
  state.titleColor = 'Normal';
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
  const slot = slots.ratingDigits;
  ctx.save();
  ctx.font = `700 18px ${DISPLAY_FONT}, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#5f4700';
  ctx.fillStyle = '#ffe234';
  drawSpacedText(String(state.ratingValue), slot.x + slot.width, slot.y + slot.height / 2 + 1, .45, slot.width, 'right', true);
  ctx.restore();
}

function drawPlayerName() {
  const slot = slots.playerName;
  ctx.save();
  ctx.font = `600 19px ${DISPLAY_FONT}, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111318';
  drawSpacedText(state.playerName || '', slot.x, slot.y + slot.height / 2, 1.15, slots.nameBase.width - 20);
  ctx.restore();
}

function drawTitleText() {
  const slot = slots.titleBase;
  ctx.save();
  ctx.font = `700 14px ${DISPLAY_FONT}, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#302400';
  ctx.fillStyle = '#ffffff';
  drawSpacedText(state.titleName, slot.x + slot.width / 2, slot.y + slot.height / 2, .8, slot.width - 18, 'center', true);
  ctx.restore();
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
    if (/^https?:\/\//.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 0; attempt <= COS.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COS.timeout);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
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
      const data = validateManifest(await fetchJson(url));
      localStorage.setItem(COS.cacheKey, JSON.stringify(data));
      return data;
    } catch (error) {
      console.warn(`无法读取素材清单：${url}`, error);
    }
  }
  const cached = localStorage.getItem(COS.cacheKey);
  if (cached) return validateManifest(JSON.parse(cached));
  throw new Error('素材库暂时不可用');
}

function assetUrl(item) {
  if (item.local) return item.file;
  const path = item.source || item.file.split('/').map(encodeURIComponent).join('/');
  return `${COS.baseUrl}/materials/${path}`;
}

async function loadTitleManifest() {
  titleManifest ||= await fetchJson(COS.titleManifestUrl);
  return titleManifest;
}

async function loadBadgeManifest() {
  badgeManifest ||= validateManifest(await fetchJson(COS.badgeManifestUrl));
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
      if (control.id === 'title') {
        state.titleName = item.name;
        state.titleColor = item.color || 'Normal';
        state.files.titleBase = titleAsset(state.titleColor);
      } else {
        state.files[control.target] = assetUrl(item);
      }
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
  });
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
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
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

async function render() {
  const version = ++renderVersion;
  loading.hidden = false;
  const ordered = Object.entries(slots)
    .filter(([id]) => !['rank', 'friendBattle'].includes(id))
    .sort((a, b) => a[1].z - b[1].z);
  ordered.push(['rank', slots.rank]);
  ordered.push(['friendBattle', slots.friendBattle]);
  const drawable = [];
  try {
    for (const [id, slot] of ordered) {
      if (!state.visible[id]) continue;
      if (['ratingDigits', 'playerName'].includes(id) || (id === 'titleText' && state.titleName)) {
        drawable.push({ id, slot });
        continue;
      }
      try {
        drawable.push({ id, slot, image: await loadImage(state.files[id]) });
      } catch (error) {
        console.warn(`素材加载失败：${state.files[id]}`, error);
      }
    }
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
        ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
        ctx.restore();
      } else {
        ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
      }
    }
    previewCtx.clearRect(0, 0, CANVAS.width, CANVAS.height);
    previewCtx.drawImage(renderCanvas, 0, 0, CANVAS.width, CANVAS.height);
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
    icon.textContent = control.short;
    label.textContent = control.label;
    row.dataset.control = control.id;
    if (!control.canHide) switchWrap.hidden = true;
    if (control.hasLibrary === false) libraryButton.hidden = true;
    if (control.hasUpload === false) uploadButton.hidden = true;
    if (control.id === 'rating') {
      ratingEditor.hidden = false;
      ratingInput.addEventListener('input', () => {
        const parsed = Number.parseInt(ratingInput.value, 10);
        state.ratingValue = Number.isFinite(parsed) ? Math.min(99999, Math.max(0, parsed)) : 0;
        const band = applyRatingBand();
        fileLabel.textContent = `${band.label}框 · ${state.ratingValue}`;
        render();
      });
    }
    if (control.id === 'playerName') {
      nameEditor.hidden = false;
      nameInput.addEventListener('input', () => {
        state.playerName = nameInput.value;
        fileLabel.textContent = nameInput.value || '未输入名称';
        render();
      });
    }
    if (control.id === 'avatar') {
      fileLabel.textContent = '默认素材 · 上传限 1:1，最大 720 × 720';
      input.setAttribute('aria-label', '上传头像，要求 1:1，最大 720 × 720 像素');
    }
    libraryButton.addEventListener('click', () => openPicker(control));

    checkbox.addEventListener('change', () => {
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
        state.files.avatar = objectUrl;
        state.visible.avatar = true;
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

document.querySelector('#reset').addEventListener('click', () => {
  resetState();
  document.querySelectorAll('.visibility').forEach((input) => { input.checked = true; });
  document.querySelectorAll('.control-file').forEach((item) => { item.textContent = '默认素材'; });
  document.querySelector('[data-control="avatar"] .control-file').textContent = '默认素材 · 上传限 1:1，最大 720 × 720';
  document.querySelector('.rating-input').value = '15000';
  document.querySelector('.name-input').value = 'maimai';
  render();
});

document.querySelector('#export').addEventListener('click', () => {
  try {
    const link = document.createElement('a');
    link.download = `maimai-diy-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
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
  resetState();
  buildControls();
  loading.hidden = false;
  try {
    const [data] = await Promise.all([
      loadManifest(),
      document.fonts.load(`18px ${DISPLAY_FONT}`)
    ]);
    manifest = data;
    setAssetStatus('is-online', `云端素材已连接 · ${data.summary?.items ?? 0} 项`);
  } catch (error) {
    setAssetStatus('is-offline', '本地素材模式');
  }
  await Promise.allSettled(Object.values(state.files).map(loadImage));
  await render();
}

initialize();


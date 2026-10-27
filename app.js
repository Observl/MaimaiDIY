const CANVAS = { width: 1080, height: 452 };
const COS = {
  baseUrl: 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com',
  manifestUrl: 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com/materials/manifest.json',
  fallbackManifestUrl: 'materials/manifest.json',
  titleManifestUrl: 'materials/titles.json',
  cacheKey: 'maimai-diy-manifest-v1',
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
  { id: 'background', label: '背景板', short: '景', slotIds: ['background'], target: 'background', category: 'backgrounds', canHide: false },
  { id: 'nameplate', label: '名牌', short: '牌', slotIds: ['nameplate'], target: 'nameplate', category: 'nameplates', canHide: false },
  { id: 'avatar', label: '头像', short: '像', slotIds: ['avatar'], target: 'avatar', category: 'avatars', canHide: false },
  { id: 'rating', label: 'Rating', short: 'R', slotIds: ['ratingFrame', 'ratingDigits'], target: 'ratingFrame', category: 'ratings', canHide: true, hasLibrary: false, hasUpload: false },
  { id: 'title', label: '称号', short: '称', slotIds: ['titleBase', 'titleText'], target: 'titleBase', category: 'titles', canHide: false },
  { id: 'playerName', label: '名称', short: '名', slotIds: ['nameBase', 'playerName'], target: 'nameBase', category: 'name-bases', canHide: false, hasLibrary: false, hasUpload: false },
  { id: 'rank', label: '段位', short: '段', slotIds: ['rank'], target: 'rank', category: 'ranks', canHide: true },
  { id: 'friendBattle', label: '友人对战', short: '战', slotIds: ['friendBattle'], target: 'friendBattle', category: 'friend-battles', canHide: true }
];

const canvas = document.querySelector('#preview');
const ctx = canvas.getContext('2d');
const loading = document.querySelector('#loading');
const assetStatus = document.querySelector('#asset-status');
const picker = document.querySelector('#asset-picker');
const pickerTitle = document.querySelector('#picker-title');
const pickerMeta = document.querySelector('#picker-meta');
const pickerGrid = document.querySelector('#picker-grid');
const pickerMessage = document.querySelector('#picker-message');
const pickerMore = document.querySelector('#picker-more');
const state = { files: {}, visible: {}, ratingValue: 15000, playerName: 'maimai', titleName: null, titleColor: 'Normal' };
let manifest;
let titleManifest;
let pickerState = { control: null, category: null, shown: 0 };

function resetState() {
  Object.entries(slots).forEach(([id, slot]) => {
    state.files[id] = slot.asset;
    state.visible[id] = true;
  });
  state.ratingValue = 15000;
  state.playerName = 'maimai';
  state.titleName = null;
  state.titleColor = 'Normal';
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

function drawRatingValue() {
  const slot = slots.ratingDigits;
  ctx.save();
  ctx.font = '900 18px Arial Narrow, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#5f4700';
  ctx.fillStyle = '#ffe234';
  ctx.strokeText(String(state.ratingValue), slot.x + slot.width, slot.y + slot.height / 2 + 1);
  ctx.fillText(String(state.ratingValue), slot.x + slot.width, slot.y + slot.height / 2 + 1);
  ctx.restore();
}

function drawPlayerName() {
  const slot = slots.playerName;
  ctx.save();
  ctx.font = '600 19px "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111318';
  ctx.fillText(state.playerName || '', slot.x, slot.y + slot.height / 2, slots.nameBase.width - 18);
  ctx.restore();
}

function drawTitleText() {
  const slot = slots.titleBase;
  ctx.save();
  ctx.font = '700 14px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#302400';
  ctx.fillStyle = '#ffffff';
  ctx.strokeText(state.titleName, slot.x + slot.width / 2, slot.y + slot.height / 2, slot.width - 18);
  ctx.fillText(state.titleName, slot.x + slot.width / 2, slot.y + slot.height / 2, slot.width - 18);
  ctx.restore();
}

function titleAsset(color) {
  const supported = ['Normal', 'Silver', 'Gold', 'Rainbow'];
  const fileColor = supported.includes(color) ? color : 'Gold';
  return `assets/titles/UI_CMN_Shougou_${fileColor}.png`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
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

function setAssetStatus(mode, text) {
  assetStatus.className = `status ${mode}`;
  assetStatus.innerHTML = `<i></i> ${text}`;
}

function showPickerMessage(text) {
  pickerMessage.textContent = text;
  pickerMessage.hidden = false;
}

function appendPickerItems() {
  const { category, control } = pickerState;
  const next = category.items.slice(pickerState.shown, pickerState.shown + COS.pageSize);
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
    button.append(image, name);
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
  pickerMore.hidden = pickerState.shown >= category.items.length;
}

async function openPicker(control) {
  pickerTitle.textContent = `选择${control.label}`;
  pickerMeta.textContent = '正在读取云端素材…';
  pickerGrid.replaceChildren();
  pickerMore.hidden = true;
  pickerMessage.hidden = true;
  picker.showModal();
  try {
    manifest ||= await loadManifest();
    const category = control.id === 'title'
      ? { id: 'titles', label: '称号', items: (await loadTitleManifest()).items }
      : manifest.categories.find((item) => item.id === control.category);
    if (!category || !category.items?.length) {
      pickerMeta.textContent = '当前分类暂无云端素材';
      showPickerMessage('可继续使用默认素材，或通过“本地上传”替换。');
      return;
    }
    pickerState = { control, category, shown: 0 };
    pickerMeta.textContent = `共 ${category.items.length} 个素材`;
    appendPickerItems();
  } catch (error) {
    pickerMeta.textContent = '连接失败';
    showPickerMessage('素材库暂时不可用，请稍后重试；默认素材和本地上传不受影响。');
  }
}

async function render() {
  loading.hidden = false;
  ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);
  const ordered = Object.entries(slots)
    .filter(([id]) => !['rank', 'friendBattle'].includes(id))
    .sort((a, b) => a[1].z - b[1].z);
  ordered.push(['rank', slots.rank]);
  ordered.push(['friendBattle', slots.friendBattle]);
  try {
    for (const [id, slot] of ordered) {
      if (!state.visible[id]) continue;
      if (id === 'ratingDigits') {
        drawRatingValue();
        continue;
      }
      if (id === 'playerName') {
        drawPlayerName();
        continue;
      }
      if (id === 'titleText' && state.titleName) {
        drawTitleText();
        continue;
      }
      const image = await loadImage(state.files[id]);
      if (id === 'titleBase' && state.titleColor === 'Bronze') {
        ctx.save();
        ctx.filter = 'sepia(1) saturate(1.25) brightness(.78)';
        ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
        ctx.restore();
      } else {
        ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
      }
    }
  } finally {
    loading.hidden = true;
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
    libraryButton.addEventListener('click', () => openPicker(control));

    checkbox.addEventListener('change', () => {
      control.slotIds.forEach((slotId) => { state.visible[slotId] = checkbox.checked; });
      render();
    });

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const objectUrl = URL.createObjectURL(file);
      control.slotIds.forEach((slotId, index) => {
        if (index === 0) state.files[slotId] = objectUrl;
        else state.visible[slotId] = false;
      });
      fileLabel.textContent = file.name;
      render();
    });
    root.appendChild(fragment);
  });
}

document.querySelector('#reset').addEventListener('click', () => {
  resetState();
  document.querySelectorAll('.visibility').forEach((input) => { input.checked = true; });
  document.querySelectorAll('.control-file').forEach((item) => { item.textContent = '默认素材'; });
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
picker.addEventListener('click', (event) => {
  if (event.target === picker) picker.close();
});

resetState();
buildControls();
render();
loadManifest()
  .then((data) => {
    manifest = data;
    setAssetStatus('is-online', `云端素材已连接 · ${data.summary?.items ?? 0} 项`);
  })
  .catch(() => setAssetStatus('is-offline', '本地素材模式'));


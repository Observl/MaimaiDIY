const CANVAS = { width: 1080, height: 452 };
const COS = {
  baseUrl: 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com',
  manifestUrl: 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com/materials/manifest.json',
  fallbackManifestUrl: 'materials/manifest.json',
  cacheKey: 'maimai-diy-manifest-v1',
  pageSize: 24,
  timeout: 12000,
  retries: 2
};

const slots = {
  background: { asset: 'assets/background.png', x: 0, y: 0, width: 1080, height: 452, z: 0 },
  nameplate: { asset: 'assets/nameplate.png', x: 32, y: 26, width: 717, height: 116, z: 20 },
  ratingFrame: { asset: 'assets/ratingFrame.png', x: 138, y: 30, width: 173, height: 36, z: 21 },
  ratingDigits: { asset: 'assets/ratingDigits.png', x: 227, y: 42, width: 69, height: 14, z: 22 },
  titleBase: { asset: 'assets/titleBase.png', x: 141, y: 111, width: 268, height: 25, z: 23 },
  titleText: { asset: 'assets/titleText.png', x: 247, y: 115, width: 51, height: 12, z: 24 },
  rank: { asset: 'assets/rank.png', x: 326, y: 69, width: 80, height: 35, z: 25 },
  friendBattle: { asset: 'assets/friendBattle.png', x: 312, y: 7, width: 108, height: 67, z: 26 },
  nameBase: { asset: 'assets/nameBase.png', x: 142, y: 67, width: 267, height: 40, z: 27 },
  playerName: { asset: 'assets/playerName.png', x: 152, y: 78, width: 102, height: 18, z: 28 },
  avatar: { asset: 'assets/avatar.png', x: 37, y: 33, width: 100, height: 99, z: 30 }
};

const controls = [
  { id: 'background', label: '背景板', short: '景', slotIds: ['background'], target: 'background', category: 'backgrounds', canHide: false },
  { id: 'nameplate', label: '名牌', short: '牌', slotIds: ['nameplate'], target: 'nameplate', category: 'nameplates', canHide: false },
  { id: 'avatar', label: '头像', short: '像', slotIds: ['avatar'], target: 'avatar', category: 'avatars', canHide: false },
  { id: 'rating', label: 'Rating', short: 'R', slotIds: ['ratingFrame', 'ratingDigits'], target: 'ratingFrame', category: 'ratings', canHide: true },
  { id: 'title', label: '称号', short: '称', slotIds: ['titleBase', 'titleText'], target: 'titleBase', category: 'titles', canHide: false },
  { id: 'playerName', label: '名称', short: '名', slotIds: ['nameBase', 'playerName'], target: 'nameBase', category: 'name-bases', canHide: false },
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
const state = { files: {}, visible: {} };
let manifest;
let pickerState = { control: null, category: null, shown: 0 };

function resetState() {
  Object.entries(slots).forEach(([id, slot]) => {
    state.files[id] = slot.asset;
    state.visible[id] = true;
  });
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
  const sources = [COS.manifestUrl, COS.fallbackManifestUrl];
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
  const path = item.source || item.file.split('/').map(encodeURIComponent).join('/');
  return `${COS.baseUrl}/materials/${path}`;
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
    const image = document.createElement('img');
    image.loading = 'lazy';
    image.alt = item.name;
    image.src = assetUrl(item);
    const name = document.createElement('span');
    name.textContent = item.name;
    button.append(image, name);
    button.addEventListener('click', async () => {
      state.files[control.target] = assetUrl(item);
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
    const category = manifest.categories.find((item) => item.id === control.category);
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
  const ordered = Object.entries(slots).sort((a, b) => a[1].z - b[1].z);
  try {
    for (const [id, slot] of ordered) {
      if (!state.visible[id]) continue;
      const image = await loadImage(state.files[id]);
      ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
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
    icon.textContent = control.short;
    label.textContent = control.label;
    row.dataset.control = control.id;
    if (!control.canHide) switchWrap.hidden = true;
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


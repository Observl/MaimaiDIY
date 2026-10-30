import { OUTPUT, COS, DISPLAY_FONT, slots, controls, HISTORY_LIMIT } from './src/config.js';
import {
  createDefaultState,
  ratingBand,
  titleAsset,
  nameCharacterCount,
  applyRatingBand as updateRatingBand,
} from './src/model.js';
import { loadManifest } from './src/assets.js';
import { createRenderer } from './src/renderer.js';
import { initializePicker } from './src/picker.js';
import { initializeTemplates } from './src/templates.js';
import { initializeRecommendations } from './author-recommendations.js';
const canvas = document.querySelector('#preview');
const renderer = createRenderer(canvas);
const renderCanvas = renderer.renderCanvas;
const applyRatingBand = () => updateRatingBand(state);
const loading = document.querySelector('#loading');
const assetStatus = document.querySelector('#asset-status');
const state = createDefaultState();
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
canvas.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openLargePreview();
  }
});
largePreview.addEventListener('click', () => largePreview.close());
const undoButton = document.querySelector('#undo');
const redoButton = document.querySelector('#redo');

function snapshotState() {
  return JSON.parse(JSON.stringify(state));
}

function updateHistoryButtons() {
  undoButton.disabled = history.past.length === 0;
  redoButton.disabled = history.future.length === 0;
  undoButton.title = history.past.length
    ? `撤回（剩余 ${history.past.length} 步）`
    : '没有可撤回的操作';
  redoButton.title = history.future.length
    ? `重做（剩余 ${history.future.length} 步）`
    : '没有可重做的操作';
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
  Object.assign(state, createDefaultState());
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

function setAssetStatus(mode, text) {
  assetStatus.className = `status ${mode}`;
  assetStatus.replaceChildren(document.createElement('i'), document.createTextNode(` ${text}`));
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
    if (!control.canHide) switchWrap.remove();
    if (control.hasLibrary === false) libraryButton.remove();
    if (!control.hasUpload) uploadButton.remove();
    if (control.id !== 'rating') ratingEditor.remove();
    if (control.id !== 'playerName') nameEditor.remove();
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
      ratingInput.addEventListener('blur', () => {
        ratingInput.value = String(state.ratingValue);
        endHistoryTransaction('rating');
      });
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
    libraryButton.addEventListener('click', () => materialPicker.open(control));

    checkbox.addEventListener('change', () => {
      recordHistory();
      control.slotIds.forEach((slotId) => {
        state.visible[slotId] = checkbox.checked;
      });
      render();
    });

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      input.value = '';
      if (control.id !== 'avatar') return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        alert('请选择 PNG、JPEG 或 WebP 格式的头像。');
        return;
      }
      try {
        const { width, height, objectUrl } = await inspectLocalImage(file);
        let dataUrl;
        try {
          if (width > 720 || height > 720 || width !== height)
            throw new Error('头像必须为 1:1 正方形，且宽、高均不得超过 720 像素。');
          dataUrl = await fileToDataUrl(file);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
        recordHistory();
        state.files.avatar = dataUrl;
        state.visible.avatar = true;
        state.labels.avatar = `${file.name} · ${width} × ${height}`;
        fileLabel.textContent = `${file.name} · ${width} × ${height}`;
        await render();
      } catch (error) {
        fileLabel.textContent = '图片读取失败';
        alert(error.message || '无法读取该头像图片，请选择 PNG、JPEG 或 WebP 文件。');
      }
    });
    const panel = ['avatar', 'rating', 'playerName'].includes(control.id)
      ? root.querySelector('#input-controls')
      : root.querySelector('#material-controls');
    panel.appendChild(fragment);
  });
}

function syncControlsFromState() {
  document.querySelector('[data-control="rating"] .rating-input').value = String(state.ratingValue);
  const nameInput = document.querySelector('[data-control="playerName"] .name-input');
  nameInput.value = state.playerName;
  nameInput.setCustomValidity('');
  nameInput.removeAttribute('aria-invalid');
  controls.forEach((control) => {
    const row = document.querySelector(`[data-control="${control.id}"]`);
    const visible = control.slotIds.every((slotId) => state.visible[slotId] !== false);
    const visibility = row.querySelector('.visibility');
    if (visibility) visibility.checked = visible;
    const fallback = control.id === 'avatar' ? '默认素材 · 上传限 1:1，最大 720 × 720' : '默认素材';
    row.querySelector('.control-file').textContent = state.labels[control.id] || fallback;
  });
  const band = ratingBand(state.ratingValue);
  document.querySelector('[data-control="rating"] .control-file').textContent =
    `${band.label}框 · ${state.ratingValue}`;
  document.querySelector('[data-control="playerName"] .control-file').textContent =
    state.playerName || '未输入名称';
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
    friendBattle: 'assets/friend-battles/00.png',
  });
  state.titleName = '新人出道';
  state.titleColor = 'Normal';
  state.ratingValue = 0;
  state.playerName = 'GUEST';
  applyRatingBand();
  Object.assign(state.labels, {
    background: 'デフォルト',
    nameplate: 'デフォルト',
    avatar: 'デフォルト',
    title: '新人出道',
    rank: '初学者',
    friendBattle: 'B5',
  });
  syncControlsFromState();
  render();
});

undoButton.addEventListener('click', undo);
redoButton.addEventListener('click', redo);

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

async function initialize() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => registration.update())
      .catch((error) => {
        console.warn('素材缓存初始化失败', error);
      });
  }
  resetState();
  buildControls();
  syncControlsFromState();
  templates.refresh();
  loading.hidden = false;
  try {
    const data = await loadManifest();
    setAssetStatus('is-online', `云端素材已连接 · ${data.summary?.items ?? 0} 项`);
  } catch (error) {
    setAssetStatus('is-offline', '素材索引暂时不可用 · 云端图片仍可加载');
  }
  await document.fonts
    .load(`18px ${DISPLAY_FONT}`)
    .catch((error) => console.warn('字体加载失败', error));
  await render();
}

let pendingRender = 0;
async function render(options) {
  const version = ++pendingRender;
  loading.hidden = false;
  try {
    const rendered = await renderer.render(state, options);
    if (rendered) updateControlIcons();
    return rendered;
  } finally {
    if (version === pendingRender) loading.hidden = true;
  }
}
function updateControlIcons() {
  for (const control of controls) {
    const icon = document.querySelector(`[data-control="${control.id}"] .control-icon`);
    const src = state.files[control.target] || slots[control.target].asset;
    if (icon.firstElementChild?.getAttribute('src') === src) continue;
    const image = new Image();
    image.alt = '';
    image.crossOrigin = 'anonymous';
    image.src = src;
    icon.replaceChildren(image);
  }
}

const materialPicker = initializePicker({
  state,
  recordHistory,
  render,
  onSelection: syncControlsFromState,
});
const templates = initializeTemplates({
  state,
  snapshotState,
  recordHistory,
  applyRatingBand,
  syncControlsFromState,
  render,
});
initializeRecommendations({
  state,
  snapshotState,
  recordHistory,
  render,
  renderCanvas,
  syncControlsFromState,
});
initialize();

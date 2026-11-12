import { CANVAS, COMPOSITION_ORDER, OUTPUT, COS, DISPLAY_FONT, slots, controls, HISTORY_LIMIT } from './src/config.js';
import {
  createDefaultState,
  ratingBand,
  titleAsset,
  nameCharacterCount,
  applyRatingBand as updateRatingBand,
} from './src/model.js';
import { loadImage } from './src/assets.js';
import { resolveAssetUrl } from './src/asset-paths.js';
import { createRenderer, failedPreviewAssetLabel } from './src/renderer.js';
import { initializeImageExport } from './src/image-export.js';
import { initializePicker } from './src/picker.js';
import { indexedMaterialCategory } from './src/material-index.js';
import { initializeTemplates } from './src/templates.js';
import { initializeRecommendations } from './author-recommendations.js';
import { loadRegionCatalog } from './src/region-catalog.js';
import { initializeRegionControls } from './src/region-controls.js';
import { songJacketBounds } from './src/regional-display.js';
import { readCurrentDesign, saveCurrentDesign, readRegionDesign } from './src/current-design.js';
const canvas = document.querySelector('#preview');
const renderer = createRenderer(canvas);
const renderCanvas = renderer.renderCanvas;
const applyRatingBand = () => updateRatingBand(state);
const loading = document.querySelector('#loading');
const state = createDefaultState();
let regionControls;
const historyByRegion = {
  cn: { past: [], future: [], transaction: null },
  jp: { past: [], future: [], transaction: null },
};
const largePreview = document.querySelector('#large-preview');
const previewMode = document.querySelector('#preview-mode');
const previewRefresh = document.querySelector('#preview-refresh');
const previewRefreshStatus = document.querySelector('#preview-refresh-status');
const regionalDisplayError = document.querySelector('#regional-display-error');
const regionalDisplayRetry = document.querySelector('#regional-display-retry');
regionalDisplayRetry.addEventListener('click', async () => {
  if (regionalDisplayRetry.getAttribute('aria-disabled') === 'true') return;
  const restoreFocus = document.activeElement === regionalDisplayRetry;
  regionalDisplayRetry.setAttribute('aria-disabled', 'true');
  try {
    if (await refreshPreview(regionalDisplayError)) {
      regionalDisplayError.textContent = '展示素材已重新载入，预览已更新。';
      if (restoreFocus && [document.body, regionalDisplayRetry].includes(document.activeElement)) canvas.focus();
    }
  } finally {
    regionalDisplayRetry.removeAttribute('aria-disabled');
  }
});
let previewRegionVersion = 0;
let previewWorkPending = false;
function setPreviewWorkPending(pending) {
  previewWorkPending = pending;
  for (const button of [previewRefresh, exportButton, exportRefresh]) {
    if (pending) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  }
  imageExporter.updateAvailability();
}
async function refreshPreview(status = previewRefreshStatus) {
  if (previewWorkPending) return false;
  const regionVersion = previewRegionVersion;
  setPreviewWorkPending(true);
  status.textContent = '正在重新获取素材…';
  try {
    const rendered = await render({ strict: true, refreshId: crypto.randomUUID() });
    if (regionVersion !== previewRegionVersion) return false;
    if (!rendered) {
      status.textContent = '预览已更新，请稍后重试刷新。';
      return false;
    }
    if (status === exportStatus || !exportRefresh.hidden) {
      exportStatus.textContent = '素材已刷新，可以重新导出高清 PNG。';
      exportRefresh.hidden = true;
    }
    previewRefreshStatus.textContent = status === previewRefreshStatus ? '预览已刷新。' : '';
    return true;
  } catch (error) {
    if (regionVersion === previewRegionVersion) {
      const asset = failedPreviewAssetLabel(error);
      status.textContent = `${asset ? '“' + asset + '”' : '素材'}暂时无法重新加载，已保留当前预览。请稍后重试。`;
    }
    return false;
  } finally {
    setPreviewWorkPending(false);
  }
}
previewRefresh.addEventListener('click', () => refreshPreview());
const previewHotspots = document.querySelector('#preview-hotspots');
const valueDialog = document.querySelector('#preview-value-dialog');
const valueInput = document.querySelector('#preview-value');
const previewSongChart = document.querySelector('#preview-song-chart');
const previewSongDifficulty = document.querySelector('#preview-song-difficulty');
const editorFields = { playerName: '.name-input', rating: '.rating-input' };
let activePreviewEditor;
canvas.tabIndex = 0;
canvas.setAttribute('role', 'button');
canvas.setAttribute('aria-label', '打开横屏大屏预览');
function openLargePreview() {
  if (!previewHotspots.hidden || largePreview.open) return;
  const enlarged = largePreview.querySelector('canvas');
  renderer.paintPreview(enlarged);
  largePreview.showModal();
}
canvas.addEventListener('click', openLargePreview);
canvas.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openLargePreview();
  }
});
document.querySelector('#large-preview-close').addEventListener('click', () => largePreview.close());
largePreview.addEventListener('click', event => {
  if (event.target === largePreview) largePreview.close();
});
largePreview.addEventListener('close', () => {
  if (previewHotspots.hidden) canvas.focus({ preventScroll: true });
});
previewMode.addEventListener('click', () => {
  const editing = previewHotspots.hidden;
  previewHotspots.hidden = !editing;
  previewMode.textContent = editing ? '更改素材' : '放大预览';
  previewMode.setAttribute('aria-pressed', String(editing));
  canvas.tabIndex = editing ? -1 : 0;
  canvas.toggleAttribute('inert', editing);
});

function openPreviewControl(control, trigger) {
  const selector = editorFields[control.id];
  if (!selector) {
    void materialPicker.open(control, trigger);
    return;
  }
  const field = document.querySelector(`[data-control="${control.id}"] ${selector}`);
  openPreviewValue(control, field);
}

function openPreviewValue(control, field) {
  activePreviewEditor = { control, field };
  previewSongChart.hidden = control.id !== 'song-achievement';
  if (!previewSongChart.hidden) {
    const difficulty = document.querySelector('#song-difficulty');
    previewSongDifficulty.replaceChildren(...[...difficulty.options].map(option =>
      new Option(`${option.text} · Lv ${option.dataset.level}`, option.value)));
    previewSongDifficulty.value = difficulty.value;
  }
  valueInput.setCustomValidity('');
  valueInput.type = field.type;
  valueInput.inputMode = field.inputMode;
  for (const attribute of ['min', 'max', 'step', 'maxlength']) {
    if (field.hasAttribute(attribute)) valueInput.setAttribute(attribute, field.getAttribute(attribute));
    else valueInput.removeAttribute(attribute);
  }
  valueInput.required = field.type === 'number';
  valueInput.value = field.value;
  document.querySelector('#preview-value-title').textContent = '更改' + control.label;
  document.querySelector('#preview-value-label').textContent = control.label;
  valueDialog.showModal();
  valueInput.select();
}

document.querySelector('#preview-value-close').addEventListener('click', () => valueDialog.close());
valueInput.addEventListener('input', () => valueInput.setCustomValidity(''));
valueDialog.querySelector('form').addEventListener('submit', event => {
  if (event.submitter?.value !== 'apply' || !activePreviewEditor) return;
  const { control, field } = activePreviewEditor;
  if (control.id === 'song-achievement') {
    regionControls.applySongSettings(Number(previewSongDifficulty.value), valueInput.valueAsNumber);
    return;
  }
  if (control.id === 'playerName' && nameCharacterCount(valueInput.value) > 8) {
    event.preventDefault();
    valueInput.setCustomValidity('名称最多允许八个字符');
    valueInput.reportValidity();
    return;
  }
  if (field.value === valueInput.value) return;
  field.value = valueInput.value;
  field.dispatchEvent(new window.Event('input', { bubbles: true }));
  endHistoryTransaction(control.id);
});

for (const control of controls) {
  const slot = slots[control.target];
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'preview-hotspot';
  button.dataset.previewControl = control.id;
  button.setAttribute('aria-label', '更改' + control.label);
  button.title = '更改' + control.label;
  Object.assign(button.style, {
    left: slot.x / CANVAS.width * 100 + '%',
    top: slot.y / CANVAS.height * 100 + '%',
    width: slot.width / CANVAS.width * 100 + '%',
    height: slot.height / CANVAS.height * 100 + '%',
    zIndex: String(COMPOSITION_ORDER.indexOf(control.target)),
  });
  button.addEventListener('click', () => openPreviewControl(control, button));
  previewHotspots.append(button);
}
const songHotspot = document.createElement('button');
songHotspot.type = 'button';
songHotspot.className = 'preview-hotspot';
songHotspot.style.zIndex = String(COMPOSITION_ORDER.length);
songHotspot.hidden = true;
songHotspot.setAttribute('aria-label', '更换歌曲并填写达成率');
songHotspot.title = '更换歌曲并填写达成率';
songHotspot.addEventListener('click', () => {
  regionControls.openSongPicker(songHotspot, () => {
    materialPicker.close();
    openPreviewValue({ id: 'song-achievement', label: '达成率' }, document.querySelector('#song-achievement'));
  });
});
previewHotspots.append(songHotspot);
valueDialog.addEventListener('close', () => {
  if (activePreviewEditor?.control.id === 'song-achievement' && !songHotspot.hidden && !previewHotspots.hidden)
    songHotspot.focus({ preventScroll: true });
  activePreviewEditor = undefined;
});
const undoButton = document.querySelector('#undo');
const redoButton = document.querySelector('#redo');

function snapshotState() {
  return JSON.parse(JSON.stringify(state));
}

function updateHistoryButtons() {
  const history = historyByRegion[state.region];
  undoButton.disabled = history.past.length === 0;
  redoButton.disabled = history.future.length === 0;
  undoButton.title = history.past.length
    ? `撤回（剩余 ${history.past.length} 步）`
    : '没有可撤回的操作';
  redoButton.title = history.future.length
    ? `重做（剩余 ${history.future.length} 步）`
    : '没有可重做的操作';
}

function recordHistory(transaction = null, region = state.region) {
  const history = historyByRegion[region];
  if (transaction && history.transaction === transaction) return;
  if (region !== state.region) historyByRegion[state.region].transaction = null;
  history.past.push(region === state.region
    ? snapshotState() : readRegionDesign(region) || createDefaultState(region));
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future.length = 0;
  history.transaction = transaction;
  updateHistoryButtons();
}

function endHistoryTransaction(transaction) {
  const history = historyByRegion[state.region];
  if (history.transaction === transaction) history.transaction = null;
}

async function restoreHistoryState(snapshot) {
  Object.assign(state, JSON.parse(JSON.stringify(snapshot)));
  applyRatingBand();
  syncControlsFromState();
  await render();
}

async function undo() {
  const history = historyByRegion[state.region];
  if (!history.past.length) return;
  history.transaction = null;
  history.future.push(snapshotState());
  if (history.future.length > HISTORY_LIMIT) history.future.shift();
  const snapshot = history.past.pop();
  updateHistoryButtons();
  await restoreHistoryState(snapshot);
}

async function redo() {
  const history = historyByRegion[state.region];
  if (!history.future.length) return;
  history.transaction = null;
  history.past.push(snapshotState());
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  const snapshot = history.future.pop();
  updateHistoryButtons();
  await restoreHistoryState(snapshot);
}

function resetState() {
  Object.assign(state, createDefaultState(state.region));
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
    libraryButton.addEventListener('click', () => materialPicker.open(control, libraryButton));


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
  updateHistoryButtons();
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
    if (visibility) visibility.disabled = state.region === 'jp' &&
      ['rank', 'friendBattle'].includes(control.id) && !state.files[control.target];
    const fallback = control.id === 'avatar' ? '默认素材 · 上传限 1:1，最大 720 × 720' : '默认素材';
    row.querySelector('.control-file').textContent = state.labels[control.id] || fallback;
  });
  const band = ratingBand(state.ratingValue, state.region);
  document.querySelector('[data-control="rating"] .control-file').textContent =
    `${band.label}框 · ${state.ratingValue}`;
  document.querySelector('[data-control="playerName"] .control-file').textContent =
    state.playerName || '未输入名称';
  regionControls?.sync();
  templates.refresh();
  document.querySelector('#author-recommendations').disabled = state.region === 'jp';
}

document.querySelector('#reset').addEventListener('click', () => {
  recordHistory();
  resetState();
  if (state.region === 'jp') {
    state.playerName = 'GUEST'; state.ratingValue = 0; applyRatingBand();
    syncControlsFromState(); render(); return;
  }
  Object.assign(state.files, {
    background: `${COS.baseUrl}/materials/backgrounds/UI_Frame_000001.png`,
    nameplate: `${COS.baseUrl}/materials/nameplates/UI_Plate_000001.png`,
    avatar: `${COS.baseUrl}/materials/avatars/UI_Icon_000001.png`,
    titleBase: titleAsset('Normal'),
    rank: COS.baseUrl+'/materials/ranks/00.png',
    friendBattle: COS.baseUrl+'/materials/friend-battles/00.png',
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

const exportButton = document.querySelector('#export');
const exportStatus = document.querySelector('#export-status');
const exportRefresh = document.querySelector('#export-refresh');
exportRefresh.addEventListener('click', async () => {
  if (previewWorkPending) return;
  const restoreFocus = document.activeElement === exportRefresh;
  if (await refreshPreview(exportStatus)) {
    if (restoreFocus && [document.body, exportRefresh].includes(document.activeElement)) exportButton.focus();
  }
});
const imageExporter = initializeImageExport({
  renderCanvas, width: OUTPUT.width, height: OUTPUT.height, isReady: () => loading.hidden && regionalDisplayRetry.hidden && !previewWorkPending,
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
  const savedDesign = readCurrentDesign();
  if (savedDesign) Object.assign(state, savedDesign);
  buildControls();
  syncControlsFromState();
  templates.refresh();
  for (const button of previewHotspots.querySelectorAll('[data-preview-control]')) {
    const control = controls.find(item => item.id === button.dataset.previewControl);
    button.hidden = state.visible[control.target] === false;
  }
  loading.hidden = false;
  await document.fonts
    .load(`18px ${DISPLAY_FONT}`)
    .catch((error) => console.warn('字体加载失败', error));
  await render();
}

let pendingRender = 0;
const iconLoads = new WeakMap();
async function render(options) {
  songHotspot.hidden = state.screenMode !== 'achievement';
  if (!songHotspot.hidden) {
    const [x, y, width, height] = songJacketBounds(state.region);
    Object.assign(songHotspot.style, {
      left: x / CANVAS.width * 100 + '%',
      top: y / CANVAS.height * 100 + '%',
      width: width / CANVAS.width * 100 + '%',
      height: height / CANVAS.height * 100 + '%',
    });
  }
  saveCurrentDesign(snapshotState());
  const version = ++pendingRender;
  loading.hidden = false;
  imageExporter.updateAvailability();
  try {
    const rendered = await renderer.render(state, {
      ...options,
      onRegionalDisplayError(error) {
        const asset = failedPreviewAssetLabel(error);
        regionalDisplayError.textContent = error
          ? `${asset || '展示'}素材暂时无法加载。已保留你的选择，可以重试。` : '';
        regionalDisplayRetry.hidden = !error;
      },
    });
    if (rendered) updateControlIcons(Boolean(options?.refreshId));
    return rendered;
  } finally {
    if (version === pendingRender) {
      loading.hidden = true;
      imageExporter.updateAvailability();
    }
  }
}
function updateControlIcons(refreshVisible = false) {
  for (const control of controls) {
    const icon = document.querySelector(`[data-control="${control.id}"] .control-icon`);
    if (!state.files[control.target]) {
      iconLoads.delete(icon);
      delete icon.dataset.assetSource;
      icon.replaceChildren();
      continue;
    }
    const src = resolveAssetUrl(state.files[control.target] || slots[control.target].asset);
    const sameSource = icon.dataset.assetSource === src;
    if (sameSource && !(refreshVisible && state.visible[control.target])) continue;
    icon.dataset.assetSource = src;
    if (!sameSource) icon.replaceChildren();
    const request = loadImage(src);
    iconLoads.set(icon, request);
    request.then(image => {
      if (iconLoads.get(icon) !== request) return;
      const thumbnail = image.cloneNode();
      thumbnail.alt = '';
      icon.replaceChildren(thumbnail);
    }).catch(() => {
      if (iconLoads.get(icon) === request) delete icon.dataset.assetSource;
    });
  }
}

const materialPicker = initializePicker({
  state,
  recordHistory,
  render,
  onSelection: syncControlsFromState,
  resolveCategory: indexedMaterialCategory,
  canOpen: () => !document.querySelector('#region-select').disabled,
});
const templates = initializeTemplates({
  getCatalog: loadRegionCatalog,
  state,
  snapshotState,
  recordHistory,
  applyRatingBand,
  syncControlsFromState,
  render,
});
document.querySelector('#region-toggle').hidden = false;
regionControls = initializeRegionControls({
  state, recordHistory, render: () => { templates.refresh(); return render(); }, picker: materialPicker,
  async changeRegion(region) {
    if (region === state.region) return;
    await loadRegionCatalog(region);
    previewRegionVersion++;
    previewRefreshStatus.textContent = '';
    exportStatus.textContent = '';
    exportRefresh.hidden = true;
    materialPicker.close();
    saveCurrentDesign(snapshotState());
    historyByRegion[state.region].transaction = null;
    Object.assign(state, readRegionDesign(region) || createDefaultState(region));
    syncControlsFromState();
    void render();
  },
});
if (location.hash === '#custom-order') location.replace('./custom-order.html');
initializeRecommendations({
  state,
  snapshotState,
  recordHistory,
  render,
  renderCanvas,
  syncControlsFromState,
});
void initialize();

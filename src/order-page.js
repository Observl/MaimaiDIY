import { applyRegionBackground } from './region-background.js';
import {DEFAULT_LIGHT_ANGLE} from './finish-settings.js';
import { DISPLAY_FONT } from './config.js';
import { CURRENT_DESIGN_KEY, LEGACY_CURRENT_DESIGN_KEY, readCurrentDesign } from './current-design.js';
import { createRenderer } from './renderer.js';
import { initializeCustomOrder } from './custom-order.js';
import { createCollectibleMasks } from './collectible-masks.js';
import { initializeLightDial } from './light-dial.js';

const status = document.querySelector('#design-status');
const preview = document.querySelector('#order-preview-shell');
const titleNotice = document.createElement('p');
titleNotice.className = 'field-help';
titleNotice.id = 'title-overflow-notice';
titleNotice.setAttribute('role', 'status');
titleNotice.hidden = true;
preview.after(titleNotice);
const renderer = createRenderer(document.querySelector('#preview'), {
  onTitleOverflow(overflow) {
    titleNotice.hidden = !overflow;
    titleNotice.textContent = overflow ? '此称号超出框宽，定制预览和成图均使用滚动前的第一帧。' : '';
  },
});
let state = null;
let version = 0;
let physicalPreview;
let previewLoading;
let loadedDesign;
let previewProduct='acrylic';
const viewport = document.querySelector('#acrylic-viewport');
const physicalStatus = document.querySelector('#acrylic-preview-status');
const stageMessage = document.querySelector('#acrylic-stage-message');
const stageControls = document.querySelector('#acrylic-stage-controls');
const retryPreview = document.querySelector('#acrylic-preview-retry');
const viewButtons = [...stageControls.querySelectorAll('.acrylic-view-tools button')];
const lightDial=initializeLightDial(document.querySelector('#acrylic-light-angle'),angle=>physicalPreview?.setLightAngle(angle));
lightDial.set(DEFAULT_LIGHT_ANGLE);
const details = { basic: '背面彩印 · 白墨', effect: '单层双面印刷 · 彩色细粉 · 白色描边 UV · 珠光' };
function syncPhysicalSelection() {
  const variant = document.querySelector('#acrylic-variant').value;
  const cardOnly = previewProduct==='card';
  const shikishi = previewProduct==='shikishi';
  const accessory = document.querySelector('#acrylic-accessory').value;
  document.querySelectorAll('[data-preview-variant]').forEach((button) => {
    button.setAttribute('aria-pressed', String(!cardOnly && button.dataset.previewVariant === variant));
  });
  document.querySelectorAll('[data-preview-product]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.previewProduct===previewProduct)));
  document.querySelector('.acrylic-variants').hidden=cardOnly||shikishi;
  document.querySelector('#acrylic-material-detail').textContent = cardOnly ? '镭射票 · 彩色镭射覆膜' : shikishi?'色纸 · 彩色细粉 · 白色描边 UV':details[variant];
  document.querySelector('#acrylic-product-spec').textContent = cardOnly
    ? '随角度变色 · 无镜面高光' : shikishi?'图案展示':'120 × 50 × 15 mm';
  physicalPreview?.setSelection({ variant:cardOnly?'effect':variant, cardOnly, shikishi, accessory });
}
function showPhysicalStatus(message, allowRetry = false) {
  viewport.hidden = true;
  stageControls.hidden = true;
  stageMessage.hidden = physicalStatus.hidden = false;
  physicalStatus.textContent = message;
  retryPreview.hidden = !allowRetry;
}

async function updatePhysicalPreview(request) {
  showPhysicalStatus('正在准备 3D 材质…');
  try {
    previewLoading ||= import('./acrylic-preview.js')
      .catch(error => { previewLoading = undefined; throw error; });
    const [{createAcrylicPreview}, finishMaps] = await Promise.all([
      previewLoading,
      createCollectibleMasks(state, undefined, {diagnostics:false}),
    ]);
    if (request !== version) return;
    viewport.hidden = false;
    const viewer = physicalPreview ||= createAcrylicPreview(viewport);
    syncPhysicalSelection();
    viewer.setDesign(renderer.renderCanvas, finishMaps);
    viewer.setLightAngle(lightDial.value);
    stageMessage.hidden = physicalStatus.hidden = true;
    stageControls.hidden = false;
    document.dispatchEvent(new window.CustomEvent('order-render-ready',{detail:{source:renderer.renderCanvas,finishMaps}}));
  } catch (error) {
    if (request !== version) return;
    loadedDesign = undefined;
    physicalPreview?.dispose();
    physicalPreview = undefined;
    console.warn('3D 预览不可用', error);
    showPhysicalStatus('3D 预览暂时不可用。你仍可查看上方的设计图并选择商品。', true);
  }
}
viewport.addEventListener('preview-unavailable', () => {
  showPhysicalStatus('3D 预览已暂停，可以重新加载。', true);
});
retryPreview.addEventListener('click', () => {
  if (!state) return;
  physicalPreview?.dispose();
  physicalPreview = undefined;
  viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.id === 'acrylic-view-reset')));
  void updatePhysicalPreview(++version);
});
const viewActions = {
  'acrylic-view-reset': 'reset',
  'acrylic-view-closeup': 'focusNameplate',
  'acrylic-view-detail': 'focusCollectibles',
};
for (const button of viewButtons) {
  button.addEventListener('click', () => {
    physicalPreview?.[viewActions[button.id]]();
    viewButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  });
}
document.querySelectorAll('[data-preview-product]').forEach(button=>button.addEventListener('click',()=>{
  previewProduct=button.dataset.previewProduct;
  syncPhysicalSelection();
}));
document.querySelectorAll('[data-preview-variant]').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('#acrylic-variant').value = button.dataset.previewVariant;
  document.querySelector('#acrylic-variant').dispatchEvent(new window.Event('change', { bubbles: true }));
}));
document.addEventListener('change', (event) => {
  if (event.target.closest('#custom-order')) syncPhysicalSelection();
});
document.addEventListener('order-selection',(event)=>{
  previewProduct=event.detail.product;
  syncPhysicalSelection();
});

initializeCustomOrder({
  snapshotState: () => {
    if (!state) throw new Error('请先返回编辑器完成上屏设计。');
    return structuredClone(state);
  },
  renderCanvas: renderer.renderCanvas,
});

async function refreshDesign() {
  const latest = readCurrentDesign();
  const designKey = JSON.stringify(latest);
  if (designKey === loadedDesign) return;
  loadedDesign = designKey;
  const request = ++version;
  state = null;
  status.hidden = false;
  preview.hidden = true;
  showPhysicalStatus('等待上屏设计');
  document.querySelector('#acrylic-export').disabled = true;
  applyRegionBackground(latest?.region || 'cn');
  if (!latest) {
    status.textContent = '还没有可用的上屏设计，请返回编辑器完成搭配后再来。';
    return;
  }
  status.textContent = '正在合成最新设计…';
  try {
    // The remote display font improves fidelity but must not gate the design.
    // Mobile Safari can reject a cross-origin font because of decoding, CORS or
    // an old cached response while the PNG artwork remains completely usable.
    await document.fonts.load(`18px ${DISPLAY_FONT}`).catch((error) => {
      console.warn('展示字体加载失败，使用系统字体继续合成', error);
    });
    const rendered = await renderer.render(latest, { strict: true });
    if (request !== version || !rendered) return;
    state = latest;
    document.dispatchEvent(new window.Event('order-design-ready'));
    preview.hidden = false;
    status.textContent = '已自动载入你最近编辑的上屏设计。';
    status.hidden = true;
    document.querySelector('#acrylic-export').disabled = false;
    updatePhysicalPreview(request);
  } catch (error) {
    if (request !== version) return;
    loadedDesign = undefined;
    console.warn('上屏设计合成失败', error);
    const slot = /素材未加载完成：([\w-]+)/.exec(error?.message || '')?.[1];
    const labels = {
      background: '背景板', nameplate: '姓名框', avatar: '头像', titleBase: '称号',
      rank: '段位', friendBattle: '友人对战', nameBase: '名称底板', ratingFrame: 'Rating 框',
    };
    status.textContent = slot
      ? `设计素材“${labels[slot] || slot}”加载失败，请检查网络后重试。`
      : `设计素材加载失败：${error?.message || '当前浏览器无法完成合成'}`;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'button secondary';
    retry.textContent = '重新加载';
    retry.addEventListener('click', refreshDesign);
    status.append(' ', retry);
  }
}
window.addEventListener('pageshow',event=>{if(event.persisted)refreshDesign();});
window.addEventListener('pagehide',event=>{
  if(event.persisted)return;
  version++;
  renderer.dispose();
  physicalPreview?.dispose();
});
// Start immediately; CSS font requests must not postpone initial design loading.
void refreshDesign();

window.addEventListener('storage', event => {
  if (event.key === null || event.key === CURRENT_DESIGN_KEY || event.key === LEGACY_CURRENT_DESIGN_KEY) refreshDesign();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshDesign();
});


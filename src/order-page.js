import { applyRegionBackground } from './region-background.js';
import {DEFAULT_LIGHT_ANGLE} from './finish-settings.js';
import { DISPLAY_FONT } from './config.js';
import { readCurrentDesign } from './current-design.js';
import { createRenderer } from './renderer.js';
import { initializeCustomOrder } from './custom-order.js';
import { createCollectibleMasks } from './collectible-masks.js';
import { initializeLightDial } from './light-dial.js';

const status = document.querySelector('#design-status');
const preview = document.querySelector('#order-preview-shell');
const renderer = createRenderer(document.querySelector('#preview'));
let state = null;
let version = 0;
let physicalPreview;
let previewLoading;
let previewProduct='acrylic';
const viewport = document.querySelector('#acrylic-viewport');
const physicalStatus = document.querySelector('#acrylic-preview-status');
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
  document.querySelector('.acrylic-preview-detail > span:last-child').textContent = cardOnly
    ? '随角度变色 · 无镜面高光' : shikishi?'图案展示':'120 × 50 × 15 mm · 材质示意';
  physicalPreview?.setSelection({ variant:cardOnly?'effect':variant, cardOnly, shikishi, accessory });
}
async function updatePhysicalPreview(request) {
  physicalStatus.hidden = false;
  physicalStatus.textContent = '正在准备 3D 材质…';
  try {
    const finishMaps = await createCollectibleMasks(structuredClone(state));
    if (request !== version) return;
    previewLoading ||= import('./acrylic-preview.js').then(({ createAcrylicPreview }) => createAcrylicPreview(viewport));
    const viewer = await previewLoading;
    if (request !== version) return;
    physicalPreview = viewer;
    viewer.setDesign(renderer.renderCanvas, finishMaps);
    document.dispatchEvent(new window.CustomEvent('order-render-ready',{detail:{source:renderer.renderCanvas,finishMaps}}));
    syncPhysicalSelection();
    viewer.setLightAngle(lightDial.value);
    viewport.hidden = false;
    physicalStatus.hidden = true;
  } catch (error) {
    console.warn('3D 预览不可用', error);
    physicalStatus.textContent = '当前设备无法显示 3D 预览，上方设计和商品选配仍可使用。';
  }
}
viewport.addEventListener('preview-unavailable', () => {
  physicalStatus.hidden = false;
  physicalStatus.textContent = '3D 画面已暂停，请刷新页面重试。';
});
document.querySelector('#acrylic-view-reset').addEventListener('click', () => physicalPreview?.reset());
document.querySelector('#acrylic-view-closeup').addEventListener('click', () => physicalPreview?.focusNameplate());
document.querySelector('#acrylic-view-detail').addEventListener('click', () => physicalPreview?.focusCollectibles());
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
  const request = ++version;
  state = null;
  status.hidden = false;
  preview.hidden = true;
  viewport.hidden = true;
  physicalStatus.hidden = false;
  physicalStatus.textContent = '等待上屏设计';
  document.querySelector('#acrylic-export').disabled = true;
  const latest = readCurrentDesign();
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
// Start immediately; CSS font requests must not postpone initial design loading.
void refreshDesign();
window.addEventListener('storage', refreshDesign);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshDesign();
});


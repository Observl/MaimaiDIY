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
const details = { basic: '背面彩印 · 白墨', light: '分层彩印 · 局部 UV · 全图闪粉', premium: '分层双面印刷 · 彩色 UV · 加密全图闪粉' };
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
  document.querySelector('#acrylic-material-detail').textContent = cardOnly ? '镭射票 · 彩色镭射覆膜' : shikishi?'色纸 · 金色包边 · 闪粉与局部 UV':details[variant];
  document.querySelector('.acrylic-preview-detail > span:last-child').textContent = cardOnly
    ? '随角度变色 · 无镜面高光' : shikishi?'图案展示':'120 × 50 × 15 mm · 材质示意';
  physicalPreview?.setSelection({ variant:cardOnly?'premium':variant, cardOnly, shikishi, accessory });
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
  if (!latest) {
    status.textContent = '还没有可用的上屏设计，请返回编辑器完成搭配后再来。';
    return;
  }
  status.textContent = '正在合成最新设计…';
  try {
    await document.fonts.load(`18px ${DISPLAY_FONT}`);
    const rendered = await renderer.render(latest, { strict: true });
    if (request !== version || !rendered) return;
    state = latest;
    preview.hidden = false;
    status.textContent = '已自动载入你最近编辑的上屏设计。';
    status.hidden = true;
    document.querySelector('#acrylic-export').disabled = false;
    updatePhysicalPreview(request);
  } catch {
    if (request !== version) return;
    status.textContent = '设计素材暂时加载失败，请检查网络后重试。';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'button secondary';
    retry.textContent = '重新加载';
    retry.addEventListener('click', refreshDesign);
    status.append(' ', retry);
  }
}
window.addEventListener('pageshow', refreshDesign);
window.addEventListener('storage', refreshDesign);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshDesign();
});

import { applyRegionBackground } from './region-background.js';
import { DISPLAY_FONT } from './config.js';
import { CURRENT_DESIGN_KEY, LEGACY_CURRENT_DESIGN_KEY, readCurrentDesign } from './current-design.js';
import { createRenderer } from './renderer.js';
import { initializeCustomOrder } from './custom-order.js';
import { initializeOrderPreview } from './order-preview.js';

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
let loadedDesign;
const physicalPreview = initializeOrderPreview({
  onFailure() { loadedDesign = undefined; },
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
  physicalPreview.reset();
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
    physicalPreview.show(latest, renderer.renderCanvas);
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
  physicalPreview.dispose();
});
// Start immediately; CSS font requests must not postpone initial design loading.
void refreshDesign();

window.addEventListener('storage', event => {
  if (event.key === null || event.key === CURRENT_DESIGN_KEY || event.key === LEGACY_CURRENT_DESIGN_KEY) refreshDesign();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshDesign();
});


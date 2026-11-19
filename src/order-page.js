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
const printExport = document.querySelector('#order-export-cmyk');
const printProfile = document.querySelector('#order-cmyk-profile');
const printStatus = document.querySelector('#order-export-status');
let exportingPrint = false;
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
  getFinishMaps: physicalPreview.getFinishMaps,
});

async function refreshDesign() {
  const latest = readCurrentDesign();
  const designKey = JSON.stringify(latest);
  if (designKey === loadedDesign) return;
  loadedDesign = designKey;
  const request = ++version;
  state = null;
  document.dispatchEvent(new window.Event('order-design-reset'));
  printExport.disabled = true;
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
    printExport.disabled = exportingPrint;
    preview.hidden = false;
    status.textContent = '已自动载入你最近编辑的上屏设计。';
    status.hidden = true;
    document.querySelector('#acrylic-export').disabled = false;
    physicalPreview.show(latest, renderer.renderCanvas);
    document.dispatchEvent(new window.Event('order-design-ready'));
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


printExport.addEventListener('click', () => {
  printStatus.textContent = '请选择厂家提供的 CMYK ICC 配置文件。';
  printProfile.value = '';
  printProfile.click();
});
printProfile.addEventListener('change', async () => {
  if (!printProfile.files.length || !state || exportingPrint) return;
  const profile = printProfile.files[0];
  const currentVersion = version;
  const design = state;
  exportingPrint = true;
  printExport.disabled = true;
  printStatus.textContent = '正在生成 CMYK 印刷文件…';
  try {
    const canvas = document.createElement('canvas');
    const printRenderer = createRenderer(canvas, { scale: 2 });
    const rendered = await printRenderer.render(design, { strict: true });
    if (!rendered || currentVersion !== version)
      throw new Error('设计已变化，请重新导出。');
    const { exportCmykTiff } = await import('./cmyk-export.js');
    canvas.width = 2400;
    canvas.height = 1000;
    canvas.getContext('2d').drawImage(printRenderer.renderCanvas, 0, 0, canvas.width, canvas.height);
    const blob = await exportCmykTiff(canvas, profile);
    printRenderer.dispose();
    if (currentVersion !== version) throw new Error('设计已变化，请重新导出。');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'maimai-diy-print-' + canvas.width + 'x' + canvas.height + '-' + Date.now() + '.tif';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    printStatus.textContent = '已生成 CMYK 印刷文件，请查看浏览器下载。';
  } catch (error) {
    printStatus.textContent = '印刷文件导出失败：' + error.message;
  } finally {
    exportingPrint = false;
    printExport.disabled = !state;
  }
});

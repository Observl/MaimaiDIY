import { DISPLAY_FONT } from './config.js';
import { readCurrentDesign } from './current-design.js';
import { createRenderer } from './renderer.js';
import { initializeCustomOrder } from './custom-order.js';

const status = document.querySelector('#design-status');
const preview = document.querySelector('#order-preview-shell');
const renderer = createRenderer(document.querySelector('#preview'));
let state = null;
let version = 0;

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

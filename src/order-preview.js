import { createCollectibleMasks } from './collectible-masks.js';
import { initializeLightDial } from './light-dial.js';

export function initializeOrderPreview({ onFailure }) {
  let artwork;
  let version = 0;
  let physicalPreview;
  let previewLoading;
  let previewProduct='acrylic';
  const viewport = document.querySelector('#acrylic-viewport');
  const physicalStatus = document.querySelector('#acrylic-preview-status');
  const stageMessage = document.querySelector('#acrylic-stage-message');
  const stageControls = document.querySelector('#acrylic-stage-controls');
  const retryPreview = document.querySelector('#acrylic-preview-retry');
  const viewButtons = [...stageControls.querySelectorAll('.acrylic-view-tools button')];
  const lightDial=initializeLightDial(document.querySelector('#acrylic-light-angle'),angle=>physicalPreview?.setLightAngle(angle));
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

  async function updatePhysicalPreview() {
    const currentArtwork = artwork;
    const request = ++version;
    showPhysicalStatus('正在准备 3D 材质…');
    try {
      previewLoading ||= import('./acrylic-preview.js')
        .catch(error => { previewLoading = undefined; throw error; });
      const [{createAcrylicPreview}, finishMaps] = await Promise.all([
        previewLoading,
        createCollectibleMasks(currentArtwork.state, undefined, {diagnostics:false}),
      ]);
      if (request !== version) return;
      viewport.hidden = false;
      const viewer = physicalPreview ||= createAcrylicPreview(viewport);
      syncPhysicalSelection();
      viewer.setDesign(currentArtwork.source, finishMaps);
      viewer.setLightAngle(lightDial.value);
      stageMessage.hidden = physicalStatus.hidden = true;
      stageControls.hidden = false;
      document.dispatchEvent(new window.CustomEvent('order-render-ready',{detail:{source:currentArtwork.source,finishMaps}}));
    } catch (error) {
      if (request !== version) return;
      onFailure();
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
    if (!artwork) return;
    physicalPreview?.dispose();
    physicalPreview = undefined;
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.id === 'acrylic-view-reset')));
    void updatePhysicalPreview();
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

  return {
    show(state, source) {
      artwork = { state, source };
      void updatePhysicalPreview();
    },
    reset() {
      version++;
      artwork = undefined;
      showPhysicalStatus('等待上屏设计');
    },
    dispose() {
      version++;
      physicalPreview?.dispose();
    },
  };
}

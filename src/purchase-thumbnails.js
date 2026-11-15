export function initializePurchaseThumbnails(section, { presets, selectionFor, imagesFor, defaultVariant }) {
  let renderer;
  let artwork;
  let renderVersion = 0;
  let sourceVersion = 0;
  let requested = !window.IntersectionObserver;

  async function renderThumbnails(activeRenderer, version) {
    for (const [id, preset] of Object.entries(presets)) {
      if (version !== renderVersion) return;
      const selection = selectionFor(id);
      const variant = selection?.variant || defaultVariant();
      const accessory = selection?.accessory ?? preset.accessory;
      for (const image of imagesFor(id)) {
        const product = image.dataset.previewItem;
        const source = activeRenderer.render({
          ...presets[product],
          variant,
          accessory: product === 'acrylic' ? accessory : 'none',
        });
        if (image.src !== source) image.src = source;
        image.hidden = false;
      }
      await new Promise(resolve => window.requestAnimationFrame(resolve));
    }
  }

  function refresh() {
    if (!renderer) return;
    void renderThumbnails(renderer, ++renderVersion)
      .catch(error => console.warn('商品图片渲染失败', error));
  }

  async function load({ source, finishMaps }) {
    const version = ++sourceVersion;
    try {
      const { createConfigurationImages } = await import('./configuration-images.js');
      if (version !== sourceVersion) return;
      renderVersion++;
      renderer?.dispose();
      renderer = undefined;
      renderer = createConfigurationImages(source, finishMaps);
      refresh();
    } catch (error) {
      console.warn('商品图片暂时不可用', error);
    }
  }

  const observer = requested ? null : new window.IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    requested = true;
    observer.disconnect();
    if (artwork) void load(artwork);
  }, { rootMargin: '320px' });
  observer?.observe(section);
  document.addEventListener('order-render-ready', event => {
    artwork = event.detail;
    if (requested) void load(artwork);
  });
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    sourceVersion++;
    renderVersion++;
    observer?.disconnect();
    renderer?.dispose();
  });
  return refresh;
}

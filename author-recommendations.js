const recommendationsDialog = document.querySelector('#recommendations-dialog');
const recommendationsGrid = document.querySelector('#recommendations-grid');
const recommendationsStatus = document.querySelector('#recommendations-status');
const isLocalAuthor = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const RECOMMENDATIONS_KEY = 'maimai-diy-author-recommendations-v1';
let publishedRecommendations;

function localRecommendations() {
  if (!isLocalAuthor) return [];
  try {
    const items = JSON.parse(localStorage.getItem(RECOMMENDATIONS_KEY) || '[]');
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

function defaultRecommendation() {
  const composition = snapshotState();
  composition.files = Object.fromEntries(Object.entries(slots).map(([id, slot]) => [id, slot.asset]));
  Object.assign(composition.files, DEFAULT_PRESET.files);
  composition.files.ratingFrame = `${COS.baseUrl}/materials/ratings/${ratingBand(DEFAULT_PRESET.ratingValue).asset}`;
  composition.visible = Object.fromEntries(Object.keys(slots).map(id => [id, true]));
  Object.assign(composition, { playerName: DEFAULT_PRESET.playerName, ratingValue: DEFAULT_PRESET.ratingValue, titleName: DEFAULT_PRESET.titleName, titleColor: DEFAULT_PRESET.titleColor, labels: { ...DEFAULT_PRESET.labels } });
  return { id: 'author-default', name: '作者默认搭配', preview: 'docs/screenshots/composition-v1.2.0.png?v=16411', state: composition };
}

async function getRecommendations() {
  if (!publishedRecommendations) {
    const response = await fetch('materials/recommendations.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('推荐列表暂时无法读取，请重试。');
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error('推荐配置格式无效。');
    publishedRecommendations = data.items;
  }
  return [defaultRecommendation(), ...publishedRecommendations, ...localRecommendations()];
}

async function applyRecommendation(item) {
  const next = sanitizeImportedState(item.state);
  // Copy only appearance fields, leaving all player information and visibility intact.
  recordHistory();
  ['background', 'nameplate', 'avatar', 'titleBase', 'titleText'].forEach(id => {
    state.files[id] = next.files[id];
  });
  ['background', 'nameplate', 'avatar', 'title'].forEach(id => { state.labels[id] = next.labels[id]; });
  state.titleName = next.titleName;
  state.titleColor = next.titleColor;
  state.files.titleBase = titleAsset(state.titleColor);
  syncControlsFromState();
  recommendationsDialog.close();
  await render();
}

async function displayRecommendations() {
  recommendationsGrid.replaceChildren();
  recommendationsStatus.textContent = '正在加载推荐…';
  try {
    const items = await getRecommendations();
    for (const item of items) {
      if (!item || typeof item.name !== 'string' || !item.state || typeof item.preview !== 'string') continue;
      if (!/^(?:docs\/screenshots\/|assets\/|data:image\/(?:png|jpeg|webp);base64,)/.test(item.preview)) continue;
      const card = document.createElement('article');
      card.className = 'recommendation-card';
      const image = document.createElement('img');
      image.src = item.preview;
      image.alt = `${item.name}完整搭配预览`;
      image.loading = 'lazy';
      const title = document.createElement('h3');
      title.textContent = item.name;
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'button primary';
      apply.textContent = '套用搭配';
      apply.addEventListener('click', async () => {
        try { await applyRecommendation(item); }
        catch (error) { recommendationsStatus.textContent = `无法套用：${error.message}`; }
      });
      card.append(image, title, apply);
      if (isLocalAuthor && localRecommendations().some(local => local.id === item.id)) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'button secondary';
        remove.textContent = '删除此本地推荐';
        remove.addEventListener('click', () => {
          try {
            localStorage.setItem(RECOMMENDATIONS_KEY, JSON.stringify(localRecommendations().filter(local => local.id !== item.id)));
            displayRecommendations();
          } catch { recommendationsStatus.textContent = '无法删除，请检查浏览器存储设置。'; }
        });
        card.append(remove);
      }
      recommendationsGrid.append(card);
    }
    recommendationsStatus.textContent = '';
  } catch (error) { recommendationsStatus.textContent = error.message; }
}

document.querySelector('#author-recommendations').addEventListener('click', () => {
  document.querySelector('#recommendations-admin').hidden = !isLocalAuthor;
  recommendationsDialog.showModal();
  displayRecommendations();
});
document.querySelector('#recommendations-close').addEventListener('click', () => recommendationsDialog.close());
recommendationsDialog.addEventListener('click', event => {
  if (event.target === recommendationsDialog) recommendationsDialog.close();
});
document.querySelector('#recommendation-save').addEventListener('click', async () => {
  if (!isLocalAuthor) return;
  const name = document.querySelector('#recommendation-name').value.trim();
  if (!name) { recommendationsStatus.textContent = '请先输入推荐名称。'; return; }
  try {
    await render();
    const preview = document.createElement('canvas');
    preview.width = 1080;
    preview.height = 452;
    preview.getContext('2d').drawImage(renderCanvas, 0, 0, 1080, 452);
    const items = localRecommendations();
    const existing = items.find(item => item.name === name);
    const item = { id: existing?.id || `author-${crypto.randomUUID()}`, name, preview: preview.toDataURL('image/webp', .9), state: snapshotState() };
    localStorage.setItem(RECOMMENDATIONS_KEY, JSON.stringify(existing ? items.map(old => old.id === existing.id ? item : old) : [...items, item]));
    await displayRecommendations();
  } catch { recommendationsStatus.textContent = '保存失败，请检查图片是否加载完成及浏览器剩余存储空间。'; }
});
document.querySelector('#recommendation-export').addEventListener('click', async () => {
  if (!isLocalAuthor) return;
  try {
    await getRecommendations();
    const data = { version: 1, items: [...publishedRecommendations, ...localRecommendations()] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'recommendations.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    recommendationsStatus.textContent = '已导出。将文件用于 materials/recommendations.json 后发布，所有访客即可看到。';
  } catch (error) { recommendationsStatus.textContent = error.message; }
});

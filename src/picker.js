import { COS, TITLE_COLOR_NAMES } from './config.js';
import { loadManifest, loadTitleManifest, loadBadgeManifest, loadImage, assetUrl } from './assets.js';
import { titleAsset } from './model.js';
export function initializePicker({
  state, recordHistory, render, onSelection, resolveCategory,
  filterCategory = (category) => category,
  canOpen = () => true,
}) {
  let manifest;
  const currentRegion = () => state.region || 'cn';
  const viewKey = (id, region) => `${region}:${id}`;
  let selectionVersion = 0;
  let activeView = false;
  let pickerState = { control: null, category: null, region: null, items: [], shown: 0, start: 0 };
  const picker = document.querySelector('#asset-picker');
  const pickerTitle = document.querySelector('#picker-title');
  const pickerMeta = document.querySelector('#picker-meta');
  const pickerGrid = document.querySelector('#picker-grid');
  const pickerMessage = document.querySelector('#picker-message');
  const pickerMore = document.querySelector('#picker-more');
  const pickerPrevious = document.querySelector('#picker-previous');
  const pickerViews = new Map();
  const PICKER_SELECTION_KEY = 'maimai-diy-picker-selection-v1';
  let pickerSelections = {};
  try {
    const saved = JSON.parse(localStorage.getItem(PICKER_SELECTION_KEY) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      pickerSelections = Object.fromEntries(
        Object.entries(saved).filter(([_key, value]) => typeof value === 'string')
      );
    }
  } catch {}
  const pickerSearch = document.querySelector('#picker-search');
  const pickerFilter = document.querySelector('#picker-filter');
  function showPickerMessage(text) {
    pickerMessage.textContent = text;
    pickerMessage.hidden = false;
  }

  function isCurrentView(view) {
    return canOpen() && activeView && picker.open && pickerState === view && currentRegion() === view.region;
  }

  function showPickerResultsMessage() {
    if (!pickerState.items.length) {
      showPickerMessage('没有符合当前搜索和分类条件的素材。');
    } else if (pickerState.category.visibilityMessage) {
      showPickerMessage(pickerState.category.visibilityMessage);
    } else {
      pickerMessage.hidden = true;
    }
  }

  function appendPickerItems(prepend = false) {
    if (!isCurrentView(pickerState)) return;
    const view = pickerState;
    const { control, items, region } = view;
    const start = prepend ? Math.max(0, pickerState.start - COS.pageSize) : pickerState.shown;
    const next = items.slice(start, prepend ? pickerState.start : start + COS.pageSize);
    const fragment = document.createDocumentFragment();
    const oldHeight = picker.scrollHeight;
    const oldScroll = picker.scrollTop;
    next.forEach((item) => {
      const button = document.createElement('button');
      button.className = 'asset-item';
      button.type = 'button';
      button.dataset.assetId = String(item.id || item.file || item.name);
      button.classList.toggle(
        'is-selected',
        button.dataset.assetId === pickerSelections[viewKey(control.id, region)]
      );
      const image =
        control.id === 'title' ? document.createElement('i') : document.createElement('img');
      if (control.id === 'title') {
        image.className = `title-swatch title-${String(item.color).toLowerCase()}`;
        image.textContent = item.name;
      } else {
        image.loading = 'lazy';
        image.decoding = 'async';
        image.fetchPriority = 'low';
        const dimensions = {
          backgrounds: [1080, 452],
          nameplates: [720, 116],
          avatars: [128, 128],
          ranks: [80, 35],
          'friend-battles': [108, 67],
        };
        const [width, height] = dimensions[control.category] || [128, 128];
        image.width = item.width || width;
        image.height = item.height || height;
        image.alt = item.name;
        image.crossOrigin = 'anonymous';
        image.src = assetUrl(item);
      }
      const name = document.createElement('span');
      name.textContent = item.name;
      const group = document.createElement('small');
      group.textContent = item.group || TITLE_COLOR_NAMES[item.color] || '未分类';
      button.title = [item.name, item.description, item.id].filter(Boolean).join('\n');
      button.append(image, name, group);
      button.addEventListener('click', async () => {
        if (!isCurrentView(view)) return;
        const version = ++selectionVersion;
        const selectedUrl = control.id === 'title'
          ? titleAsset(item.color || 'Normal')
          : assetUrl(item);
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        showPickerMessage('正在加载所选素材…');
        try {
          // Keep the current composition and history intact until the image is usable.
          await loadImage(selectedUrl);
        } catch {
          if (isCurrentView(view) && version === selectionVersion)
            showPickerMessage('这张素材暂时无法加载，已保留原搭配。可点击重试或选择其他素材。');
          return;
        } finally {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
        if (!isCurrentView(view) || version !== selectionVersion) return;
        pickerSelections[viewKey(control.id, region)] = button.dataset.assetId;
        try {
          localStorage.setItem(PICKER_SELECTION_KEY, JSON.stringify(pickerSelections));
        } catch {}
        pickerGrid
          .querySelectorAll('.is-selected')
          .forEach((node) => node.classList.remove('is-selected'));
        button.classList.add('is-selected');
        recordHistory();
        if (control.select) {
          control.select(item);
          closePicker();
          onSelection();
          await render();
          return;
        }
        if (control.id === 'title') {
          state.titleName = item.name;
          state.titleColor = item.color || 'Normal';
          state.files.titleBase = selectedUrl;
        } else {
          state.files[control.target] = selectedUrl;
        }
        state.labels[control.id] = item.name;
        state.visible[control.target] = true;
        document.querySelector(`[data-control="${control.id}"] .control-file`).textContent =
          item.name;
        closePicker();
        onSelection();
        await render();
      });
      fragment.appendChild(button);
    });
    if (prepend) {
      pickerGrid.prepend(fragment);
      pickerState.start = start;
      picker.scrollTop = oldScroll + picker.scrollHeight - oldHeight;
    } else {
      pickerGrid.append(fragment);
      pickerState.shown += next.length;
    }
    pickerPrevious.hidden = !pickerState.start;
    pickerMore.hidden = pickerState.shown >= items.length;
  }

  function itemGroup(item) {
    return item.group || TITLE_COLOR_NAMES[item.color] || '未分类';
  }

  function materialNumericId(item) {
    const gameId = Number(item.gameId);
    if (item.gameId != null && Number.isFinite(gameId)) return gameId;
    const matches = String(item.id || item.file || '').match(/\d+/g);
    return matches ? Number(matches[matches.length - 1]) : Number.MAX_SAFE_INTEGER;
  }

  function compareMaterialGroups(a, b) {
    if (pickerState.category?.id === 'friend-battles') {
      const order = ['B', 'A', 'S', 'SS', 'SSS', 'LEGEND'];
      const rank = (value) => {
        const index = order.indexOf(value.replace(/级$/, '').toUpperCase());
        return index < 0 ? order.length : index;
      };
      const difference = rank(a) - rank(b);
      if (difference) return difference;
    }
    return a.localeCompare(b, 'zh-CN', { numeric: true });
  }

  function comparePickerItems(a, b, selectedGroup) {
    const byGroup = selectedGroup ? 0 : compareMaterialGroups(itemGroup(a), itemGroup(b));
    return (
      byGroup ||
      materialNumericId(a) - materialNumericId(b) ||
      String(a.id || a.file || '').localeCompare(String(b.id || b.file || ''), 'zh-CN', {
        numeric: true,
      })
    );
  }

  function applyPickerFilters(locateSelection = false) {
    if (!pickerState.category || !isCurrentView(pickerState)) return;
    selectionVersion += 1;
    const query = pickerSearch.value.trim().toLocaleLowerCase('zh-CN');
    const group = pickerFilter.value;
    pickerState.items = pickerState.category.items
      .filter((item) => {
        if (group && itemGroup(item) !== group) return false;
        if (!query) return true;
        const searchable = [
          item.name,
          item.id,
          item.description,
          item.genre,
          itemGroup(item),
          item.gameId,
        ]
          .filter((value) => value !== undefined && value !== null)
          .join(' ')
          .toLocaleLowerCase('zh-CN');
        return searchable.includes(query);
      })
      .sort((a, b) => comparePickerItems(a, b, group));
    const index =
      locateSelection === true
        ? pickerState.items.findIndex(
            (item) =>
              String(item.id || item.file || item.name) === pickerSelections[viewKey(pickerState.control.id, pickerState.region)]
          )
        : -1;
    pickerState.start = index < 0 ? 0 : Math.floor(index / COS.pageSize) * COS.pageSize;
    pickerState.shown = pickerState.start;
    pickerGrid.replaceChildren();
    showPickerResultsMessage();
    pickerMeta.textContent = `找到 ${pickerState.items.length} / ${pickerState.category.items.length} 个素材`;
    appendPickerItems();
    picker.scrollTop = 0;
    if (index >= 0) scrollToSelection(pickerState);
  }

  function preparePickerFilters(category) {
    pickerSearch.value = '';
    pickerFilter.replaceChildren(new Option('全部分类', ''));
    // V2 categories already carry a validated group index. Legacy catalogs are
    // counted once, rather than rescanning the full library for every group.
    const counts = new Map();
    if (Array.isArray(category.groups)) {
      category.groups.forEach(({ label, count, ids }) =>
        counts.set(label, Number.isInteger(count) ? count : ids.length));
    } else {
      category.items.forEach((item) => {
        const group = itemGroup(item);
        counts.set(group, (counts.get(group) || 0) + 1);
      });
    }
    [...counts.keys()].sort(compareMaterialGroups).forEach((group) =>
      pickerFilter.add(new Option(`${group}（${counts.get(group)}）`, group))
    );
  }

  function cachePickerView() {
    if (!activeView) return;
    activeView = false;
    if (!pickerState.control || !pickerState.category) return;
    const scroll = picker.scrollTop;
    const nodes = document.createDocumentFragment();
    nodes.append(...pickerGrid.childNodes);
    pickerViews.set(viewKey(pickerState.control.id, pickerState.region), {
      state: pickerState,
      nodes,
      query: pickerSearch.value,
      group: pickerFilter.value,
      meta: pickerMeta.textContent,
      scroll,
    });
  }

  function closePicker() {
    selectionVersion += 1;
    // Native dialog close events are deferred. Save this view while it still
    // owns the grid, before a region change or a new picker can replace it.
    cachePickerView();
    picker.close();
  }

  function scrollToSelection(view) {
    requestAnimationFrame(() => {
      if (isCurrentView(view))
        pickerGrid.querySelector('.is-selected')?.scrollIntoView({ block: 'center' });
    });
  }

  async function openPicker(control) {
    if (!canOpen()) return;
    cachePickerView();
    const openedRegion = currentRegion();
    const sourceLabel = picker.querySelector('.eyebrow');
    if (sourceLabel) sourceLabel.textContent = openedRegion === 'jp' ? 'JP ASSETS' : 'CN ASSETS';
    selectionVersion += 1;
    const cachedView = pickerViews.get(viewKey(control.id, openedRegion));
    activeView = true;
    if (cachedView) {
      pickerState = cachedView.state;
      pickerTitle.textContent = `选择${control.label}`;
      preparePickerFilters(pickerState.category);
      pickerSearch.value = cachedView.query;
      pickerFilter.value = cachedView.group;
      pickerGrid.replaceChildren(cachedView.nodes);
      pickerMeta.textContent = cachedView.meta;
      showPickerResultsMessage();
      pickerMore.hidden = pickerState.shown >= pickerState.items.length;
      pickerPrevious.hidden = !pickerState.start;
      picker.showModal();
      picker.scrollTop = cachedView.scroll;
      scrollToSelection(pickerState);
      return;
    }
    pickerTitle.textContent = `选择${control.label}`;
    pickerState = { control, category: null, region: openedRegion, items: [], shown: 0, start: 0 };
    const requestState = pickerState;
    pickerMeta.textContent = '正在读取云端素材…';
    pickerGrid.replaceChildren();
    pickerSearch.value = '';
    pickerFilter.replaceChildren(new Option('全部分类', ''));
    pickerMore.hidden = true;
    pickerPrevious.hidden = true;
    pickerMessage.hidden = true;
    picker.showModal();
    try {
      let category = await resolveCategory?.(control, openedRegion);
      if (category) { /* The region catalog owns this category. */ }
      else if (control.id === 'title') {
        category = { id: 'titles', label: '称号', items: (await loadTitleManifest()).items };
      } else if (['rank', 'friendBattle'].includes(control.id)) {
        category = (await loadBadgeManifest()).categories.find(
          (item) => item.id === control.category
        );
      } else {
        manifest ||= await loadManifest();
        category = manifest.categories.find((item) => item.id === control.category);
      }
      if (!isCurrentView(requestState)) return;
      if (category) category = await filterCategory(category, openedRegion, control);
      if (!isCurrentView(requestState)) return;
      if (!category || !category.items?.length) {
        pickerMeta.textContent = '当前分类暂无云端素材';
        showPickerMessage(category?.unavailableMessage || category?.visibilityMessage || '可保留当前搭配；头像也可通过“本地上传”替换。');
        return;
      }
      Object.assign(requestState, { category, items: category.items });
      preparePickerFilters(category);
      applyPickerFilters(true);
    } catch (error) {
      if (!isCurrentView(requestState)) return;
      pickerMeta.textContent = '连接失败';
      showPickerMessage('此分类的素材库暂时不可用，请稍后重新打开重试。未缓存的云端图片也可能无法加载；本地上传头像仍可使用。');
    }
  }

  document.querySelector('#picker-close').addEventListener('click', closePicker);
  pickerMore.addEventListener('click', () => appendPickerItems());
  pickerPrevious.addEventListener('click', () => appendPickerItems(true));
  picker.addEventListener('close', () => {
    if (picker.open) return;
    selectionVersion += 1;
    cachePickerView();
  });
  pickerSearch.addEventListener('input', applyPickerFilters);
  pickerFilter.addEventListener('change', applyPickerFilters);
  picker.addEventListener('click', (event) => {
    if (event.target === picker) closePicker();
  });

  return { open: openPicker, close: closePicker };
}

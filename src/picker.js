import { COS, TITLE_COLOR_NAMES } from './config.js';
import { loadManifest, loadTitleManifest, loadBadgeManifest, assetUrl } from './assets.js';
import { titleAsset } from './model.js';
export function initializePicker({ state, recordHistory, render, onSelection }) {
  let manifest;
  let pickerState = { control: null, category: null, items: [], shown: 0, start: 0 };
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

  function appendPickerItems(prepend = false) {
    const { control, items } = pickerState;
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
        button.dataset.assetId === pickerSelections[control.id]
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
        pickerSelections[control.id] = button.dataset.assetId;
        try {
          localStorage.setItem(PICKER_SELECTION_KEY, JSON.stringify(pickerSelections));
        } catch {}
        pickerGrid
          .querySelectorAll('.is-selected')
          .forEach((node) => node.classList.remove('is-selected'));
        button.classList.add('is-selected');
        recordHistory();
        if (control.id === 'title') {
          state.titleName = item.name;
          state.titleColor = item.color || 'Normal';
          state.files.titleBase = titleAsset(state.titleColor);
        } else {
          state.files[control.target] = assetUrl(item);
        }
        state.labels[control.id] = item.name;
        state.visible[control.target] = true;
        document.querySelector(`[data-control="${control.id}"] .control-file`).textContent =
          item.name;
        picker.close();
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
    if (!pickerState.category) return;
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
              String(item.id || item.file || item.name) === pickerSelections[pickerState.control.id]
          )
        : -1;
    pickerState.start = index < 0 ? 0 : Math.floor(index / COS.pageSize) * COS.pageSize;
    pickerState.shown = pickerState.start;
    pickerGrid.replaceChildren();
    pickerMessage.hidden = pickerState.items.length > 0;
    if (!pickerState.items.length) showPickerMessage('没有符合当前搜索和分类条件的素材。');
    pickerMeta.textContent = `找到 ${pickerState.items.length} / ${pickerState.category.items.length} 个素材`;
    appendPickerItems();
    picker.scrollTop = 0;
    if (index >= 0)
      requestAnimationFrame(() =>
        pickerGrid.querySelector('.is-selected')?.scrollIntoView({ block: 'center' })
      );
  }

  function preparePickerFilters(category) {
    pickerSearch.value = '';
    pickerFilter.replaceChildren(new Option('全部分类', ''));
    const groups = [...new Set(category.items.map(itemGroup))].sort(compareMaterialGroups);
    groups.forEach((group) =>
      pickerFilter.add(
        new Option(
          `${group}（${category.items.filter((item) => itemGroup(item) === group).length}）`,
          group
        )
      )
    );
  }

  async function openPicker(control) {
    const cachedView = pickerViews.get(control.id);
    if (cachedView) {
      pickerState = cachedView.state;
      pickerTitle.textContent = `选择${control.label}`;
      preparePickerFilters(pickerState.category);
      pickerSearch.value = cachedView.query;
      pickerFilter.value = cachedView.group;
      pickerGrid.replaceChildren(cachedView.nodes);
      pickerMeta.textContent = cachedView.meta;
      pickerMessage.hidden = pickerState.items.length > 0;
      pickerMore.hidden = pickerState.shown >= pickerState.items.length;
      pickerPrevious.hidden = !pickerState.start;
      picker.showModal();
      picker.scrollTop = cachedView.scroll;
      requestAnimationFrame(() =>
        pickerGrid.querySelector('.is-selected')?.scrollIntoView({ block: 'center' })
      );
      return;
    }
    pickerTitle.textContent = `选择${control.label}`;
    pickerState = { control, category: null, items: [], shown: 0, start: 0 };
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
      manifest ||= await loadManifest();
      let category;
      if (control.id === 'title') {
        category = { id: 'titles', label: '称号', items: (await loadTitleManifest()).items };
      } else if (['rank', 'friendBattle'].includes(control.id)) {
        category = (await loadBadgeManifest()).categories.find(
          (item) => item.id === control.category
        );
      } else {
        category = manifest.categories.find((item) => item.id === control.category);
      }
      if (!picker.open || pickerState !== requestState) return;
      if (!category || !category.items?.length) {
        pickerMeta.textContent = '当前分类暂无云端素材';
        showPickerMessage('可继续使用默认素材，或通过“本地上传”替换。');
        return;
      }
      pickerState = { control, category, items: category.items, shown: 0 };
      preparePickerFilters(category);
      applyPickerFilters(true);
    } catch (error) {
      pickerMeta.textContent = '连接失败';
      showPickerMessage('素材库暂时不可用，请稍后重试；默认素材和本地上传不受影响。');
    }
  }

  document.querySelector('#picker-close').addEventListener('click', () => picker.close());
  pickerMore.addEventListener('click', () => appendPickerItems());
  pickerPrevious.addEventListener('click', () => appendPickerItems(true));
  picker.addEventListener('close', () => {
    if (picker.open || !pickerState.control || !pickerState.category) return;
    const scroll = picker.scrollTop;
    const nodes = document.createDocumentFragment();
    nodes.append(...pickerGrid.childNodes);
    pickerViews.set(pickerState.control.id, {
      state: pickerState,
      nodes,
      query: pickerSearch.value,
      group: pickerFilter.value,
      meta: pickerMeta.textContent,
      scroll,
    });
  });
  pickerSearch.addEventListener('input', applyPickerFilters);
  pickerFilter.addEventListener('change', applyPickerFilters);
  picker.addEventListener('click', (event) => {
    if (event.target === picker) picker.close();
  });

  return { open: openPicker };
}

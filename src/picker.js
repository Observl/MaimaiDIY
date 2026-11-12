import { COS, TITLE_COLOR_NAMES } from './config.js';
import { loadManifest, loadTitleManifest, loadBadgeManifest, loadImage, assetUrl } from './assets.js';
import { titleAsset } from './model.js';
import { resolveAssetUrl } from './asset-paths.js';

const normalizeSearch = text => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');

function itemGroup(item) {
  return item.group || TITLE_COLOR_NAMES[item.color] || '未分类';
}

function materialNumericId(item) {
  const gameId = Number(item.gameId);
  if (item.gameId != null && Number.isFinite(gameId)) return gameId;
  const matches = String(item.id || item.file || '').match(/\d+/g);
  return matches ? Number(matches[matches.length - 1]) : Number.MAX_SAFE_INTEGER;
}

function compareMaterialGroups(a, b, categoryId) {
  if (categoryId === 'friend-battles') {
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

function comparePickerItems(a, b, categoryId) {
  const byGroup = compareMaterialGroups(itemGroup(a), itemGroup(b), categoryId);
  return (
    byGroup ||
    materialNumericId(a) - materialNumericId(b) ||
    String(a.id || a.file || '').localeCompare(String(b.id || b.file || ''), 'zh-CN', {
      numeric: true,
    })
  );
}

export function sortedPickerItems(category) {
  return [...category.items].sort((a, b) => comparePickerItems(a, b, category.id));
}

export function initializePicker({
  state, recordHistory, render, onSelection, resolveCategory,
  filterCategory = (category) => category,
  canOpen = () => true,
}) {
  let manifest;
  const searchText = new WeakMap();
  const currentRegion = () => state.region || 'cn';
  const viewKey = (id, region) => `${region}:${id}`;
  let selectionVersion = 0;
  let activeView = false;
  let openingFocus;
  let pickerState = { control: null, category: null, region: null, items: [], shown: 0, start: 0 };
  const picker = document.querySelector('#asset-picker');
  const scroll = document.querySelector('#picker-scroll') || picker;
  const pickerTitle = document.querySelector('#picker-title');
  const pickerMeta = document.querySelector('#picker-meta');
  const pickerGrid = document.querySelector('#picker-grid');
  const pickerMessage = document.querySelector('#picker-message');
  const clearFilters = document.querySelector('#picker-clear');
  const clearSearch = document.querySelector('#picker-clear-search');
  const allGroups = document.querySelector('#picker-all-groups');
  const retryLoad = document.querySelector('#picker-retry');
  const pickerViews = new Map();
  const buttonItems = new WeakMap();
  const itemId = item => String(item.id || item.file || item.name);
  function isSelected(control, item) {
    if (control.selectedAssetId) return itemId(item) === control.selectedAssetId();
    if (control.id === 'title') return item.name === state.titleName && (item.color || 'Normal') === state.titleColor;
    return assetUrl(item) === resolveAssetUrl(state.files[control.target]);
  }
  function updateSelectedButton(button, control) {
    const selected = isSelected(control, buttonItems.get(button));
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  const pickerSearch = document.querySelector('#picker-search');
  const pickerFilter = document.querySelector('#picker-filter');
  function showPickerMessage(text, tone = '') {
    pickerMessage.textContent = text;
    pickerMessage.hidden = !text;
    pickerMessage.dataset.tone = tone;
  }

  function isCurrentView(view) {
    return canOpen() && activeView && picker.open && pickerState === view && currentRegion() === view.region;
  }

  function showPickerResultsMessage() {
    clearFilters.hidden = !pickerSearch.value.trim() && !pickerFilter.value;
    clearSearch.hidden = Boolean(pickerState.items.length || !pickerSearch.value.trim() || !pickerFilter.value);
    const otherMatches = pickerState.keywordMatchesElsewhere || 0;
    allGroups.hidden = Boolean(pickerState.items.length || !otherMatches);
    if (!pickerState.items.length) {
      showPickerMessage(allGroups.hidden
        ? '没有符合当前搜索和分类条件的素材。'
        : `当前分类无匹配，其他分类有 ${otherMatches} 个匹配素材。`);
    } else {
      showPickerMessage('');
    }
  }

  function appendPickerItems(prepend = false) {
    if (!isCurrentView(pickerState)) return;
    const view = pickerState;
    const { control, items, region } = view;
    const start = prepend ? Math.max(0, pickerState.start - COS.pageSize) : pickerState.shown;
    const next = items.slice(start, prepend ? pickerState.start : start + COS.pageSize);
    const fragment = document.createDocumentFragment();
    const oldHeight = scroll.scrollHeight;
    const oldScroll = scroll.scrollTop;
    next.forEach((item) => {
      const button = document.createElement('button');
      button.className = 'asset-item';
      button.type = 'button';
      button.dataset.assetId = itemId(item);
      buttonItems.set(button, item);
      updateSelectedButton(button, control);
      const image =
        control.id === 'title' ? document.createElement('i') : document.createElement('img');
      let artwork = image;
      let thumbnailUnavailable = false;
      if (control.id === 'title') {
        image.className = `title-swatch title-${String(item.color).toLowerCase()}`;
        image.textContent = item.name;
      } else {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'asset-thumbnail';
        const fallback = document.createElement('span');
        fallback.className = 'asset-thumbnail-fallback';
        fallback.textContent = '缩略图暂不可用';
        fallback.hidden = true;
        thumbnail.append(image, fallback);
        artwork = thumbnail;
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
        const source = assetUrl(item);
        image.addEventListener('error', () => {
          thumbnailUnavailable = true;
          thumbnail.dataset.unavailable = 'true';
          fallback.hidden = false;
        });
        image.addEventListener('load', () => {
          thumbnailUnavailable = false;
          thumbnail.dataset.unavailable = 'false';
          fallback.hidden = true;
        });
        if (/^https?:\/\//.test(source)) image.crossOrigin = 'anonymous';
        image.src = source;
      }
      const name = document.createElement('span');
      name.textContent = item.name;
      const group = document.createElement('small');
      const groupName = itemGroup(item);
      group.textContent = groupName;
      button.title = [item.name, item.description, item.id].filter(Boolean).join('\n');
      button.append(artwork, name, group);
      let loading = false;
      button.addEventListener('click', async () => {
        if (!isCurrentView(view) || loading) return;
        const control = view.control;
        const version = ++selectionVersion;
        if (control.selectedAssetId && isSelected(control, item)) {
          showPickerMessage('当前已选择「' + item.name + '」。', 'success');
          control.afterSelect?.();
          return;
        }
        const selectedUrl = control.id === 'title'
          ? titleAsset(item.color || 'Normal', region)
          : assetUrl(item);
        loading = true;
        pickerGrid.querySelector('[data-selection-error]')?.removeAttribute('data-selection-error');
        button.setAttribute('aria-disabled', 'true');
        button.setAttribute('aria-busy', 'true');
        showPickerMessage('正在加载所选素材…');
        try {
          // Keep the current composition and history intact until the image is usable.
          const loaded = await loadImage(selectedUrl);
          if (thumbnailUnavailable) image.src = loaded.src;
        } catch {
          if (isCurrentView(view) && version === selectionVersion) {
            button.setAttribute('data-selection-error', '');
            showPickerMessage('「' + item.name + '」暂时无法加载，已保留原搭配。可再次点选这张素材重试。');
          }
          return;
        } finally {
          loading = false;
          button.removeAttribute('aria-disabled');
          button.removeAttribute('aria-busy');
        }
        if (!isCurrentView(view) || version !== selectionVersion) return;
        const selectionError = control.selectionError?.(item);
        if (selectionError) {
          showPickerMessage(selectionError);
          return;
        }
        pickerGrid
          .querySelectorAll('.is-selected')
          .forEach((node) => {
            node.classList.remove('is-selected');
            node.setAttribute('aria-pressed', 'false');
          });
        button.classList.add('is-selected');
        button.setAttribute('aria-pressed', 'true');
        recordHistory();
        if (control.select) {
          control.select(item);
        } else {
          if (control.id === 'title') {
            state.titleName = item.name;
            state.titleColor = item.color || 'Normal';
            state.files.titleBase = selectedUrl;
          } else {
            state.files[control.target] = selectedUrl;
          }
          state.labels[control.id] = item.name;
          state.visible[control.target] = true;
          document.querySelector(`[data-control="${control.id}"] .control-file`).textContent = item.name;
        }
        onSelection();
        showPickerMessage('已选择：' + item.name, 'success');
        control.afterSelect?.();
        await render();
      });
      fragment.appendChild(button);
    });
    if (prepend) {
      pickerGrid.prepend(fragment);
      pickerState.start = start;
      scroll.scrollTop = oldScroll + scroll.scrollHeight - oldHeight;
    } else {
      pickerGrid.append(fragment);
      pickerState.shown += next.length;
    }
  }

  function applyPickerFilters(locateSelection = false) {
    if (!pickerState.category || !isCurrentView(pickerState)) return;
    selectionVersion += 1;
    const query = normalizeSearch(pickerSearch.value);
    pickerState.appliedQuery = query;
    const group = pickerFilter.value;
    pickerState.keywordMatchesElsewhere = 0;
    pickerState.items = pickerState.sortedItems.filter((item) => {
      const inGroup = !group || itemGroup(item) === group;
      if (!query) return inGroup;
      let searchable = searchText.get(item);
      if (searchable === undefined) {
        searchable = normalizeSearch([
          item.name, item.id, item.description, item.genre, itemGroup(item), item.gameId,
        ].join(' '));
        searchText.set(item, searchable);
      }
      const matches = searchable.includes(query);
      if (matches && !inGroup) pickerState.keywordMatchesElsewhere++;
      return matches && inGroup;
    });
    const index =
      locateSelection === true
        ? pickerState.items.findIndex(item => isSelected(pickerState.control, item))
        : -1;
    pickerState.start = index < 0 ? 0 : Math.floor(index / COS.pageSize) * COS.pageSize;
    pickerState.shown = pickerState.start;
    pickerGrid.replaceChildren();
    showPickerResultsMessage();
    pickerMeta.textContent = `找到 ${pickerState.items.length} / ${pickerState.category.items.length} 个素材`;
    appendPickerItems();
    // Fill short viewports far enough to make the next batch reachable by scrolling.
    while (pickerState.shown < pickerState.items.length && scroll.clientHeight > 0 &&
      scroll.scrollHeight - scroll.clientHeight <= 24) appendPickerItems();
    scroll.scrollTop = 0;
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
    [...counts.keys()].sort((a, b) => compareMaterialGroups(a, b, category.id)).forEach((group) =>
      pickerFilter.add(new Option(`${group}（${counts.get(group)}）`, group))
    );
  }

  function cachePickerView() {
    if (!activeView) return;
    activeView = false;
    if (!pickerState.control || !pickerState.category) return;
    const position = scroll.scrollTop;
    const nodes = document.createDocumentFragment();
    nodes.append(...pickerGrid.childNodes);
    pickerViews.set(viewKey(pickerState.control.id, pickerState.region), {
      state: pickerState,
      nodes,
      query: pickerSearch.value,
      group: pickerFilter.value,
      meta: pickerMeta.textContent,
      scroll: position,
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
      if (!isCurrentView(view)) return;
      const selected = pickerGrid.querySelector('.is-selected');
      if (!selected) return;
      const item = selected.getBoundingClientRect();
      const viewport = scroll.getBoundingClientRect();
      scroll.scrollTop += item.top + item.height / 2 - viewport.top - viewport.height / 2;
    });
  }

  async function openPicker(control, trigger = document.activeElement) {
    if (!canOpen()) return;
    if (!picker.open) openingFocus = { trigger, previous: document.activeElement };
    cachePickerView();
    const openedRegion = currentRegion();
    const sourceLabel = picker.querySelector('.eyebrow');
    if (sourceLabel) sourceLabel.textContent = openedRegion === 'jp' ? 'JP ASSETS' : 'CN ASSETS';
    selectionVersion += 1;
    const cachedView = pickerViews.get(viewKey(control.id, openedRegion));
    activeView = true;
    retryLoad.hidden = true;
    if (picker.dataset) picker.dataset.category = control.category;
    if (cachedView) {
      pickerState = cachedView.state;
      pickerState.control = control;
      pickerTitle.textContent = `选择${control.label}`;
      preparePickerFilters(pickerState.category);
      pickerSearch.value = cachedView.query;
      pickerFilter.value = cachedView.group;
      pickerGrid.replaceChildren(cachedView.nodes);
      for (const button of pickerGrid.querySelectorAll('.asset-item')) updateSelectedButton(button, control);
      pickerMeta.textContent = cachedView.meta;
      showPickerResultsMessage();
      pickerGrid.setAttribute('aria-busy', 'false');
      if (!picker.open) picker.showModal();
      scroll.scrollTop = cachedView.scroll;
      scrollToSelection(pickerState);
      return;
    }
    pickerTitle.textContent = `选择${control.label}`;
    pickerState = { control, category: null, region: openedRegion, items: [], shown: 0, start: 0 };
    const requestState = pickerState;
    pickerMeta.textContent = '正在读取素材…';
    pickerGrid.replaceChildren();
    pickerSearch.value = '';
    pickerFilter.replaceChildren(new Option('全部分类', ''));
    pickerMessage.hidden = true;
    clearFilters.hidden = true;
    clearSearch.hidden = true;
    allGroups.hidden = true;
    pickerGrid.setAttribute('aria-busy', 'true');
    if (!picker.open) picker.showModal();
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
        showPickerMessage(category?.unavailableMessage || category?.visibilityMessage || '此分类暂无可用素材。');
        return;
      }
      Object.assign(requestState, { category, sortedItems: sortedPickerItems(category) });
      preparePickerFilters(category);
      applyPickerFilters(true);
    } catch (error) {
      if (!isCurrentView(requestState)) return;
      pickerMeta.textContent = '连接失败';
      showPickerMessage('此分类的素材暂时无法加载。可以直接重试，或返回编辑器。');
      retryLoad.hidden = false;
    } finally {
      if (isCurrentView(requestState)) pickerGrid.setAttribute('aria-busy', 'false');
    }
  }

  document.querySelector('#picker-close').addEventListener('click', closePicker);
  clearFilters.addEventListener('click', () => {
    pickerSearch.value = '';
    pickerFilter.value = '';
    applyPickerFilters();
    pickerSearch.focus();
  });
  clearSearch.addEventListener('click', () => {
    pickerSearch.value = '';
    applyPickerFilters();
    pickerSearch.focus();
  });
  allGroups.addEventListener('click', () => {
    pickerFilter.value = '';
    applyPickerFilters();
    pickerSearch.focus();
  });
  retryLoad.addEventListener('click', () => {
    if (!isCurrentView(pickerState)) return;
    document.querySelector('#picker-close').focus();
    void openPicker(pickerState.control);
  });
  scroll.addEventListener('scroll', () => {
    if (!isCurrentView(pickerState)) return;
    const edge = 24;
    if (pickerState.start > 0 && scroll.scrollTop <= edge) {
      appendPickerItems(true);
    } else if (pickerState.shown < pickerState.items.length &&
      scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= edge) {
      appendPickerItems();
    }
  }, { passive: true });
  pickerGrid.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || !isCurrentView(pickerState)) return;
    if (event.shiftKey && event.target === pickerGrid.firstElementChild && pickerState.start > 0) {
      appendPickerItems(true);
    } else if (!event.shiftKey && event.target === pickerGrid.lastElementChild &&
        pickerState.shown < pickerState.items.length) {
      appendPickerItems();
    }
  });
  pickerGrid.addEventListener('focusin', event => {
    const item = event.target;
    requestAnimationFrame(() => {
      if (document.activeElement !== item || !isCurrentView(pickerState)) return;
      const viewport = scroll.getBoundingClientRect();
      const bounds = item.getBoundingClientRect();
      if (bounds.top < viewport.top + 4) scroll.scrollTop += bounds.top - viewport.top - 4;
      else if (bounds.bottom > viewport.bottom - 4)
        scroll.scrollTop += bounds.bottom - viewport.bottom + 4;
    });
  });
  picker.addEventListener('close', () => {
    if (picker.open) return;
    selectionVersion += 1;
    cachePickerView();
    const origin = openingFocus;
    openingFocus = undefined;
    const trigger = typeof origin?.trigger === 'function' ? origin.trigger() : origin?.trigger;
    if (canOpen() && trigger?.isConnected &&
        (document.activeElement === document.body || document.activeElement === origin.previous))
      trigger.focus({ preventScroll: true });
  });
  function applySearchInput(event) {
    if (!event.isComposing && normalizeSearch(pickerSearch.value) !== pickerState.appliedQuery)
      applyPickerFilters();
  }
  pickerSearch.addEventListener('input', applySearchInput);
  pickerSearch.addEventListener('compositionend', applySearchInput);
  pickerFilter.addEventListener('change', applyPickerFilters);
  picker.addEventListener('click', (event) => {
    if (event.target !== picker) return;
    const { left, top, right, bottom } = picker.getBoundingClientRect();
    if (event.clientX < left || event.clientX >= right ||
        event.clientY < top || event.clientY >= bottom) closePicker();
  });

  return { open: openPicker, close: closePicker };
}

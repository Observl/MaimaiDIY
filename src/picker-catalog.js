import { TITLE_COLOR_NAMES } from './config.js';

export const normalizeSearch = text => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');

export function itemGroup(item) {
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

// The next item goes to the shortest column. DOM/tab order is unchanged and
// its vertical position never moves backwards; only the final row can be ragged.
export function titleMasonryLayout(width, heights, gap = 8) {
  const columns = Math.max(1, Math.floor((width + gap) / 148));
  const itemWidth = Math.max(0, (width - (columns - 1) * gap) / columns);
  const bottoms = Array(columns).fill(0);
  const positions = heights.map(height => {
    const column = bottoms.indexOf(Math.min(...bottoms));
    const position = { left: column * (itemWidth + gap), top: bottoms[column] };
    bottoms[column] += height + gap;
    return position;
  });
  return { itemWidth, positions, height: Math.max(0, ...bottoms) - (heights.length ? gap : 0) };
}

export function filterPickerItems(sortedItems, query, group, searchText) {
  let matchesElsewhere = 0;
  const items = sortedItems.filter(item => {
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
    if (matches && !inGroup) matchesElsewhere++;
    return matches && inGroup;
  });
  return { items, matchesElsewhere };
}

export function pickerGroupCounts(category) {
  const counts = new Map();
  if (Array.isArray(category.groups)) {
    for (const { label, count, ids } of category.groups)
      counts.set(label, Number.isInteger(count) ? count : ids.length);
  } else {
    for (const item of category.items) {
      const group = itemGroup(item);
      counts.set(group, (counts.get(group) || 0) + 1);
    }
  }
  return [...counts].sort(([a], [b]) => compareMaterialGroups(a, b, category.id));
}

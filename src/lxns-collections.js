import { TITLE_COLOR_NAMES } from './config.js';
import { materialIdentity } from './material-visibility.js';

const endpoint = 'https://maimai.lxns.net/api/v0/maimai/';
const collections = {
  avatars: ['icon', 'icons'],
  nameplates: ['plate', 'plates'],
  backgrounds: ['frame', 'frames'],
  titles: ['trophy', 'trophies'],
};
const requests = new Map();
const cnDate = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const isLxnsCollection = category => Object.hasOwn(collections, category);

function released(date, today) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return false;
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}

function dateInChina() {
  const { year, month, day } = Object.fromEntries(cnDate.formatToParts().map(({type, value}) => [type, value]));
  return `${year}-${month}-${day}`;
}

export function buildLxnsCollection(control, entries, artwork, today = dateInChina()) {
  const category = control.category;
  const images = new Map();
  for (const item of artwork) {
    if (item.region && item.region !== 'cn') continue;
    const id = materialIdentity(item, category);
    if (id && !images.has(id)) images.set(id, item);
  }
  const items = [];
  const seen = new Set();
  for (const record of entries) {
    const { id, name, genre, description, release_date: date, color } = record || {};
    if (!Number.isSafeInteger(id) || id < 0 || id > 999999 || typeof name !== 'string' ||
        !name.trim() || !released(date, today) || seen.has(id)) continue;
    const identity = String(id).padStart(6, '0');
    const image = images.get(identity);
    const metadata = {
      lxnsId: id, name, group: typeof genre === 'string' && genre.trim() ? genre.trim() : '落雪未分类',
      description: typeof description === 'string' ? description : '', region: 'cn',
    };
    if (category === 'titles' && Object.hasOwn(TITLE_COLOR_NAMES, color)) {
      items.push({ ...metadata, id: `titles/${identity}`, color });
      seen.add(id);
    } else if (category !== 'titles' && image) {
      items.push({ id: image.id, file: image.file, local: image.local, ...metadata });
      seen.add(id);
    }
  }
  return { id: category, label: control.label, items, sourceStatus: 'lxns' };
}

export function loadLxnsCollection(category) {
  const [type, property] = collections[category];
  if (!requests.has(type)) requests.set(type, fetch(`${endpoint}${type}/list?required=false`, {
    cache: 'no-cache',
    signal: AbortSignal.timeout(12000),
  })
    .then(async response => {
      if (!response.ok) throw new Error('落雪收藏品索引读取失败');
      const entries = (await response.json())?.[property];
      if (!Array.isArray(entries)) throw new Error('落雪收藏品索引格式无效');
      return entries;
    })
    .catch(error => { requests.delete(type); throw error; }));
  return requests.get(type);
}

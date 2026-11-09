import { COS } from './config.js';
import { resolveAssetUrl } from './asset-paths.js';
const imageCache = new Map();
let titleManifest;
let badgeManifest;
let manifestRequest;
export function loadImage(src) {
  src=resolveAssetUrl(src);
  if (imageCache.has(src)) return imageCache.get(src);
  const request = new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => {
      image.src = '';
      reject(new Error(`素材加载超时：${src}`));
    }, COS.timeout);
    if (/^https?:\/\//.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => {
      clearTimeout(timer);
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error('素材图片为空'));
        return;
      }
      resolve(image);
    };
    image.onerror = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    image.src = src;
  });
  imageCache.set(src, request);
  request.catch(() => imageCache.delete(src));
  return request;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url, forceFresh = false) {
  const hostname = globalThis.location?.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const index = [COS.manifestUrl, COS.titleManifestUrl, COS.badgeManifestUrl, COS.recommendationsUrl]
      .find((source) => source === url);
    if (index) {
      try {
        const response = await fetch(`/cos-index/${index.split('/').pop()}`, { cache: 'no-store' });
        if (response.ok) return await response.json();
      } catch {
        // Local snapshots are optional. Continue with the cloud source.
      }
    }
  }
  let lastError;
  for (let attempt = 0; attempt <= COS.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COS.timeout);
    try {
      const requestUrl = forceFresh
        ? `${url}${url.includes('?') ? '&' : '?'}refresh=${Date.now()}`
        : url;
      const response = await fetch(requestUrl, {
        signal: controller.signal,
        cache: forceFresh ? 'reload' : 'default',
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      // Retrying unavailable/forbidden objects cannot recover them. Still retry
      // transient failures, request timeouts and rate limits.
      if (error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) break;
      if (attempt < COS.retries) await wait(350 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export function validateManifest(data) {
  if (
    !data ||
    data.schemaVersion !== 1 ||
    !Array.isArray(data.categories) ||
    !data.categories.every(
      (category) =>
        category &&
        typeof category.id === 'string' &&
        Array.isArray(category.items) &&
        category.items.every(
          (item) => item && typeof item.file === 'string' && typeof item.name === 'string'
        )
    )
  ) {
    throw new Error('素材清单格式不兼容');
  }
  return data;
}

export function loadManifest() {
  manifestRequest ||= readManifest().catch((error) => {
    manifestRequest = null;
    throw error;
  });
  return manifestRequest;
}

async function readManifest() {
  const sources = [COS.manifestUrl];
  for (const url of sources) {
    try {
      const data = validateManifest(await fetchJson(url, true));
      normalizeManifestGroups(data);
      try {
        localStorage.setItem(COS.cacheKey, JSON.stringify(data));
      } catch (error) {
        console.warn('素材索引缓存写入失败', error);
      }
      return data;
    } catch (error) {
      console.warn(`无法读取素材清单：${url}`, error);
    }
  }
  try {
    const cached = localStorage.getItem(COS.cacheKey);
    if (cached) return normalizeManifestGroups(validateManifest(JSON.parse(cached)));
  } catch {
    /* A blocked or corrupt browser cache must not break the editor. */
  }
  throw new Error('素材库暂时不可用');
}

export function normalizeManifestGroups(data) {
  const regionNames = {
    イベント: '活动',
    オリジナル: '原创',
    天界: '天界',
    月面: '月面',
    '裏 月面': '里 月面',
    はじまりの: '启程',
    メトロポリス: '大都会',
    宇宙すてーしょん: '宇宙空间站',
    BLACKROSE: '黑蔷薇',
    'BLACK ROSE': '黑蔷薇',
    しゅわしゅわ: '咻哇咻哇',
    ドラゴン: '龙之',
    スカイストリート: '天空街',
    パーリィ: '派对',
    ハピフェス: '欢乐节日',
    でらっくす: 'DX',
    ProjectDIVA: 'Project DIVA',
    'HARDCORETANO*C': 'HARDCORE TANO*C',
  };
  const groupNames = {
    実績: '成绩',
    その他: '其他',
    デフォルト: '默认',
    ランダム: '随机',
    随机选择: '随机',
    'maimaiシリーズ': '舞萌系列',
  };
  const canonicalGroup = (value) => {
    const label = value?.replace(/^2026\s*·\s*/, '').trim();
    if (!label) return undefined;
    const region = /^(.*?)(?:ちほー|区域)\s*(\d*)(.*)$/.exec(label);
    if (region) {
      const [, name, number, suffix] = region;
      return `${regionNames[name.trim()] ?? name.trim()}区域${number}${suffix}`;
    }
    return groupNames[label] ?? label;
  };
  data.categories.forEach((category) => {
    const seenAssets = new Set();
    category.items = category.items.filter((item) => {
      const key = item.gameId != null ? `game:${item.gameId}` : `file:${item.source || item.file}`;
      if (seenAssets.has(key)) return false;
      seenAssets.add(key);
      return true;
    });
    category.count = category.items.length;
    category.items.forEach((item) => {
      const group = canonicalGroup(item.genre) ?? canonicalGroup(item.group);
      if (group) item.group = group;
    });
  });
  return data;
}

export function assetUrl(item) {
  if (item.local) return resolveAssetUrl(item.file);
  const path = item.source || item.file.split('/').map(encodeURIComponent).join('/');
  return `${COS.baseUrl}/materials/${path}`;
}

export async function loadTitleManifest() {
  titleManifest ||= fetchJson(COS.titleManifestUrl)
    .then((data) => {
      if (
        !Array.isArray(data?.items) ||
        !data.items.every((item) => item && typeof item.name === 'string')
      )
        throw new Error('称号清单格式无效');
      return data;
    })
    .catch((error) => {
      titleManifest = null;
      throw error;
    });
  return titleManifest;
}

export async function loadBadgeManifest() {
  badgeManifest ||= fetchJson(COS.badgeManifestUrl)
    .then(validateManifest)
    .then((data) => {
      const ranks = data.categories.find((category) => category.id === 'ranks');
      if (ranks)
        ranks.items = ranks.items.filter(
          (item) => item.id !== 'ranks/11' && item.name !== '真段位'
        );
      return data;
    })
    .catch((error) => {
      badgeManifest = null;
      throw error;
    });
  return badgeManifest;
}

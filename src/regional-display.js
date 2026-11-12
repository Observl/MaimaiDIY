import { loadImage } from './assets.js';
import { loadRegionCatalog, getRegionCatalogItem } from './region-catalog.js';
import { validateRegionalDisplayLayout } from './regional-display-layout.js';

const layouts = new Map();
const songLayout = {
  cn: { base: [299, 156, 757, 275], cover: [16, 159, 279, 287], jacket: [48, 195],
    type: [779, 215, 115, 28], title: [655.5, 271.5, 654],
    level: [[932, 189, 32, 53], [960, 190, 44, 56], [995, 182, 33, 60]],
    levelHeight: 44, levelBaseline: 243,
    score: { y: 345, height: 52, gap: 2, dotHeight: 17, percentHeight: 25 } },
  jp: { base: [284, 144, 788, 280], jacket: [45, 195],
    type: [779, 190, 115, 28], title: [655.5, 252.5, 660],
    level: [[932, 174, 32, 53], [960, 174, 45, 53], [995, 165, 33, 32]],
    levelHeight: 46, levelBaseline: 224,
    score: { y: 321, height: 74, gap: 10, dotHeight: 10, percentHeight: 32 } },
};

export function songJacketBounds(region) {
  return [...songLayout[region].jacket, 216, 216];
}

// Visible glyph bounds in the template sprites, excluding transparent margins
// and faint shadows. Both sides of the decimal point use these same metrics.
const scoreGlyphBounds = {
  cn: [[1, 1, 80, 108], [1, 1, 62, 104], [1, 1, 76, 106], [1, 1, 79, 108], [1, 1, 80, 104],
    [0, 1, 79, 106], [1, 1, 80, 108], [0, 1, 75, 104], [1, 1, 80, 108], [0, 1, 80, 108]],
  jp: [[4, 19, 55, 93], [4, 1, 35, 71], [3, 19, 51, 91], [4, 3, 55, 77], [3, 3, 56, 73],
    [4, 3, 54, 75], [4, 17, 55, 91], [4, 3, 52, 73], [3, 19, 56, 93], [3, 18, 55, 92]],
};

function loadLayout(region, refreshId) {
  const cached = layouts.get(region);
  if (cached && (!refreshId || cached.refreshId === refreshId)) return cached.request;
  const entry = {
    refreshId,
    request: fetch(new URL(`../regional-display/${region}/layout.json`, import.meta.url),
      refreshId ? { cache: 'reload' } : undefined)
      .then(response => {
        if (!response.ok) throw new Error('展示模板暂不可用');
        return response.json();
      })
      .then(layout => {
        validateRegionalDisplayLayout(layout, region);
        return layout;
      })
      .catch(error => {
        if (layouts.get(region) === entry) layouts.delete(region);
        throw error;
      }),
  };
  layouts.set(region, entry);
  return entry.request;
}

function fit(ctx, image, [x, y, width, height], alignBottom = false) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - w) / 2, y + (alignBottom ? height - h : (height - h) / 2), w, h);
}

const glyphBounds = new WeakMap();

function artworkBounds(image) {
  if (glyphBounds.has(image)) return glyphBounds.get(image);
  const { naturalWidth: width, naturalHeight: height } = image;
  const sample = document.createElement('canvas');
  sample.width = width;
  sample.height = height;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= 16) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  const bounds = right >= left ? [left, top, right - left + 1, bottom - top + 1] : [0, 0, width, height];
  glyphBounds.set(image, bounds);
  return bounds;
}

function baselineGlyph(image, center, baseline, height) {
  const [left, top, width, sourceHeight] = artworkBounds(image);
  const scale = height / sourceHeight;
  const visibleWidth = width * scale;
  return {
    width: visibleWidth,
    draw: ctx => ctx.drawImage(image,
      center - visibleWidth / 2 - left * scale, baseline - height - top * scale,
      image.naturalWidth * scale, image.naturalHeight * scale),
  };
}

export async function prepareRegionalDisplay({ region, screenMode, song }, refreshId) {
  if (screenMode !== 'achievement' || !song.id) return null;

  const [, layout] = await Promise.all([loadRegionCatalog(region), loadLayout(region, refreshId)]);
  const art = name => loadImage(`regional-display/${region}/${name}.webp`, refreshId);
  const stamp = async (name, bounds = layout[name], fitted = false) => {
    const image = await art(name);
    return ctx => fitted ? fit(ctx, image, bounds, true) : ctx.drawImage(image, ...bounds);
  };
  const itemImage = (category, id) => {
    const item = getRegionCatalogItem(region, category, id);
    if (!item) throw new Error('所选素材不在当前区服目录中');
    return loadImage(item.image, refreshId);
  };
  const draw = layers => ctx => { for (const layer of layers) layer(ctx); };

  const item = getRegionCatalogItem(region, 'songs', song.id);
  const chart = item?.charts.find(chart => chart.difficulty === song.difficulty);
  if (!chart) throw new Error('所选歌曲难度暂不可用');
  const positions = songLayout[region];
  const [whole, decimal] = Number(song.achievement).toFixed(4).split('.');
  const { y, height, gap, dotHeight, percentHeight } = positions.score;
  const [dotX, , dotWidth] = layout.dot;
  const dotCenter = dotX + dotWidth / 2;
  const dotGlyph = art('dot').then(image => baselineGlyph(image, dotCenter, y + height, dotHeight));
  const scoreDigits = async (digits, edge, direction) => {
    const glyphs = await Promise.all([...digits].map(async digit => {
      const image = await art(`digit-${digit}`);
      const [left, top, right, bottom] = scoreGlyphBounds[region][digit];
      const scale = height / (bottom - top);
      return { image, left, top, scale, width: (right - left) * scale };
    }));
    let cursor = edge;
    const layers = glyphs.map(({ image, left, top, scale, width }) => {
      const x = direction < 0 ? cursor - width : cursor;
      cursor += direction * (width + gap);
      return ctx => ctx.drawImage(image, x - left * scale, y - top * scale,
        image.naturalWidth * scale, image.naturalHeight * scale);
    });
    return { layers, edge: cursor };
  };
  const level = /^(\d)?(\d)(\+)?$/.exec(chart.level)?.slice(1) ?? [];
  const difficulty = song.difficulty;
  const coverArtwork = region === 'jp' && difficulty < 3
    ? loadImage(`regional-display/cn/cover-${difficulty}.webp`, refreshId)
      .then(image => ctx => ctx.drawImage(image, ...layout.cover))
    : stamp(region === 'jp' && difficulty === 3 ? 'cover' : `cover-${difficulty}`, positions.cover);
  const [base, cover, jacket, type, overlay, levelLabel, dot, percent, integerDigits, decimalDigits, chartLevel] = await Promise.all([
    stamp(`base-${difficulty}`, positions.base),
    coverArtwork,
    itemImage('songs', song.id),
    stamp(song.id.endsWith(':dx') ? 'dx' : 'sd', positions.type),
    stamp('song-overlay'),
    stamp(`level-label-${difficulty}`),
    dotGlyph,
    art('percent'),
    dotGlyph.then(dot => scoreDigits([...whole].reverse(), dotCenter - dot.width / 2 - gap, -1)),
    dotGlyph.then(dot => scoreDigits(decimal, dotCenter + dot.width / 2 + gap, 1)),
    Promise.all(level.map(async (value, index) => {
      const name = `level-${difficulty}-${value === '+' ? '10' : value}`;
      if (!layout[name]) return null;
      if (value === '+') return stamp(name, positions.level[index], true);
      const [x, , width] = positions.level[index];
      return baselineGlyph(await art(name), x + width / 2, positions.levelBaseline, positions.levelHeight).draw;
    })),
  ]);
  const [percentX, , percentWidth] = layout.percent;
  const [, , percentSourceWidth, percentSourceHeight] = artworkBounds(percent);
  const percentCenter = Math.max(percentX + percentWidth / 2,
    decimalDigits.edge + percentSourceWidth * percentHeight / percentSourceHeight / 2);
  const percentGlyph = baselineGlyph(percent, percentCenter, y + height, percentHeight);
  return { draw: draw([
    base, cover,
    ctx => ctx.drawImage(jacket, ...songJacketBounds(region)),
    type, overlay, levelLabel, dot.draw, ...integerDigits.layers, ...decimalDigits.layers, percentGlyph.draw,
    ...chartLevel.filter(Boolean),
    ctx => {
      const [x, y, width] = positions.title;
      ctx.save();
      ctx.font = 'bold 23px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#20213a';
      ctx.fillStyle = '#fff';
      ctx.strokeText(item.name, x, y, width);
      ctx.fillText(item.name, x, y, width);
      ctx.restore();
    },
  ]) };
}

import { loadImage } from './assets.js';
import { loadRegionCategoryIndex, getRegionCatalogItem } from './region-catalog.js';
import { companionAwakeningTier, validateCompanionDisplay, validateCompanionPalettes, validateConfirmedCompanionSets, validateRegionalDisplayLayout } from './regional-display-layout.js';

import { indexedMaterialCategory } from './material-index.js';
import { sortedPickerItems } from './picker.js';

export async function companionPlaceholders(region) {
  const category = await indexedMaterialCategory({ category: 'charas', label: '旅行伙伴' }, region);
  return sortedPickerItems(category).filter(item => item.companionColorKnown !== false).slice(0, 5);
}

export function unusedCompanionPlaceholders(items, companions) {
  const selected = new Set(companions.map(member => String(member.id)));
  return items.filter(item => !selected.has(String(item.id))).slice(0, 5 - companions.length);
}

let paletteEntry;

function loadCompanionPalettes(refreshId) {
  if (paletteEntry && (!refreshId || paletteEntry.refreshId === refreshId)) return paletteEntry.request;
  const entry = { refreshId };
  const read = async file => {
    const response = await fetch(new URL(`../regional-display/${file}.json`, import.meta.url),
      refreshId ? { cache: 'reload' } : undefined);
    if (!response.ok) throw new Error('伙伴配色目录暂不可用');
    return response.json();
  };
  entry.request = Promise.all([
    read('companion-palettes').then(validateCompanionPalettes),
    read('confirmed-companion-sets').then(validateConfirmedCompanionSets),
  ])
    .catch(error => {
      if (paletteEntry === entry) paletteEntry = undefined;
      throw error;
    });
  paletteEntry = entry;
  return entry.request;
}
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

// Keep every digit in the same-width cell without stretching its artwork.
// Anchor both runs to the existing decimal point; narrow digits are centered.
export function layoutScoreDigits(region, digits, edge, direction) {
  const { y, height, gap } = songLayout[region].score;
  const cellWidth = Math.max(...scoreGlyphBounds[region].map(
    ([left, top, right, bottom]) => (right - left) * height / (bottom - top)
  ));
  let cursor = edge;
  const glyphs = [...digits].map(digit => {
    const [left, top, right, bottom] = scoreGlyphBounds[region][digit];
    const scale = height / (bottom - top);
    const width = (right - left) * scale;
    const cellX = direction < 0 ? cursor - cellWidth : cursor;
    const x = cellX + (cellWidth - width) / 2;
    cursor += direction * (cellWidth + gap);
    return { digit, x, y, left, top, scale, width, cellX, cellWidth };
  });
  return { glyphs, edge: cursor };
}

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

function preparePortrait(image, mask, portraitBounds, maskBounds) {
  if (!mask) return ctx => ctx.drawImage(image, ...portraitBounds);
  const [x, y, width, height] = maskBounds;
  const portrait = document.createElement('canvas');
  portrait.width = width * 2;
  portrait.height = height * 2;
  const layer = portrait.getContext('2d');
  layer.scale(2, 2);
  layer.imageSmoothingQuality = 'high';
  layer.drawImage(image, portraitBounds[0] - x, portraitBounds[1] - y, ...portraitBounds.slice(2));
  layer.globalCompositeOperation = 'destination-in';
  layer.drawImage(mask, 0, 0, width, height);
  return ctx => ctx.drawImage(portrait, x, y, width, height);
}

export async function prepareRegionalDisplay({ region, screenMode, song, companions }, refreshId, previewExamples) {
  if (screenMode === 'collection' || (screenMode === 'achievement' && !song.id) ||
      (screenMode === 'companions' && !previewExamples && !companions.length)) return null;

  const [, layout] = await Promise.all([loadRegionCategoryIndex(region, screenMode === 'companions' ? 'charas' : 'songs'), loadLayout(region, refreshId)]);
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

  if (screenMode === 'companions') {
    const [{ regions, awakeningLevels }, confirmed] = await loadCompanionPalettes(refreshId);
    const palette = regions[region];
    const { display } = palette;
    validateCompanionDisplay(display, layout, region);
    const texture = name => loadImage(`regional-display/companion-sets/${name}.webp`, refreshId);
    async function prepareStars(slot, member, bounds, set, profile) {
      const tier = Math.min(companionAwakeningTier(member.level, awakeningLevels), awakeningLevels.length - 1);
      if (member.awakened) {
        const name = slot.superAwakening.starBase;
        return stamp(name, bounds(name));
      }
      const name = slot.normal.starBase;
      const [x, y, width, height] = bounds(name);
      const [source, socket] = await Promise.all([texture(profile.starOverlay), texture(set.star)]);
      if (source.naturalWidth !== width || source.naturalHeight !== height * awakeningLevels.length)
        throw new Error('旅行伙伴星星素材尺寸无效');
      const image = source;
      return ctx => {
        for (const rect of profile.starBounds) ctx.drawImage(socket, ...rect);
        ctx.drawImage(image, 0, tier * height, width, height, x, y, width, height);
      };
    }
    async function prepareMember(imageRequest, member, index) {
      const assignment = confirmed.characters[String(member.id).padStart(6, '0')];
      if (!assignment) throw Object.assign(new Error(`旅行伙伴 ${member.id} 尚无已核实的配色索引，请更换伙伴。`), { code: 'COMPANION_COLOR_UNKNOWN' });
      const set = confirmed.sets[assignment.setId];
      const profile = confirmed.regions[region][index];
      const source = display.slots[index];
      const style = member.awakened ? source.superAwakening : source.normal;
      const bounds = name => layout[name];
      const [image, mask, back, front, stars, levels] = await Promise.all([
        imageRequest,
        source.mask ? art(source.mask) : null,
        member.awakened ? (style.background ? stamp(style.background) : null) :
          (index ? texture(set.base).then(image => ctx => ctx.drawImage(image, ...profile.baseBounds)) : null),
        member.awakened ? stamp(style.frame) : Promise.all([texture(index ? set.frame : set.leader), texture(profile.caption)])
          .then(([frame, caption]) => ctx => { ctx.drawImage(frame, ...profile.frameBounds); ctx.drawImage(caption, ...profile.captionBounds); }),
        prepareStars(source, member, bounds, set, profile),
        Promise.all([...String(member.level)].map(async (digit, offset) => {
          const glyph = await art(display.levelDigits[Number(digit)]);
          const transform = source.levelTransforms[offset];
          return ctx => {
            ctx.save();
            ctx.transform(...transform);
            ctx.drawImage(glyph, 0, 0);
            ctx.restore();
          };
        })),
      ]);
      const portrait = preparePortrait(image, mask, source.portraitBounds, source.mask ? bounds(source.mask) : null);
      return ctx => {
        back?.(ctx);
        portrait(ctx);
        front(ctx);
        stars(ctx);
        levels.forEach(layer => layer(ctx));
      };
    }
    const selected = Promise.all(companions.map((member, index) =>
      prepareMember(itemImage('charas', member.id), member, index)));
    const emptySlots = previewExamples && companions.length < 5
      ? companionPlaceholders(region)
      : [];
    const [members, examples] = await Promise.all([selected, emptySlots]);
    const placeholders = await Promise.all(unusedCompanionPlaceholders(examples, companions).map((item, offset) =>
      prepareMember(loadImage(item.image, refreshId), { id: item.id, level: 1 }, companions.length + offset)));
    return {
      draw: draw(members),
      preview: draw(placeholders.filter(Boolean)),
    };
  }

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
    const run = layoutScoreDigits(region, digits, edge, direction);
    const layers = await Promise.all(run.glyphs.map(async ({ digit, x, y, left, top, scale }) => {
      const image = await art(`digit-${digit}`);
      return ctx => ctx.drawImage(image, x - left * scale, y - top * scale,
        image.naturalWidth * scale, image.naturalHeight * scale);
    }));
    return { layers, edge: run.edge };
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

import { CANVAS, DISPLAY_FONT, RATING_FONT, RENDER_SCALE, DEFAULT_BACKGROUND, slots, controls, COMPOSITION_ORDER } from './config.js';
import { nameCharacterCount } from './model.js';
import { layoutPlayerName } from './player-name.js';
import { loadImage } from './assets.js';
import { prepareRegionalDisplay } from './regional-display.js';

export function failedPreviewAssetLabel(error) {
  const slot = error?.assetSlot;
  if (slot === 'ratingFrame') return 'Rating 框';
  if (slot === 'nameBase') return '名称底板';
  if (slot === 'companions') return '旅行伙伴';
  if (slot === 'achievement') return '歌曲达成率';
  return controls.find(control => control.slotIds.includes(slot))?.label;
}

const ratingArtworkBounds = new WeakMap();
// Cell centers in the original 664 × 130 Japanese textures. The high tiers
// have less visible artwork to the right, so their slot scales differently.
const JP_RATING_CELL_X = [335, 389, 442, 495, 549];
// Offset the text baseline so the visible digit ink centers vertically.
const JP_RATING_CELL_Y = 71;
const RATING_FRAME_INSET = 2;

function visibleRatingBounds(image) {
  if (ratingArtworkBounds.has(image)) return ratingArtworkBounds.get(image);
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height) return null;
  const sample = document.createElement('canvas');
  sample.width = width;
  sample.height = height;
  const context = sample.getContext('2d');
  let bounds = null;
  try {
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
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
    if (right >= left) bounds = [left, top, right - left + 1, bottom - top + 1];
  } catch {
    // A texture that cannot be sampled still uses the shared slot dimensions.
  }
  ratingArtworkBounds.set(image, bounds);
  return bounds;
}

let ratingFontReady;
function prepareRatingFont() {
  if (!document.fonts?.load) return Promise.resolve();
  // All renderer consumers (preview, PNG and finish masks) wait for the same
  // locally served font. Failed optional fonts must not block the editor.
  ratingFontReady ||= document.fonts.load(`800 19px ${RATING_FONT}`, '0123456789')
    .catch(error => {
      ratingFontReady = undefined;
      console.warn('Rating 字体加载失败，将使用备用字体', error);
    });
  return ratingFontReady;
}

export function preferredRenderScale({
  coarsePointer = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
  maxTouchPoints = globalThis.navigator?.maxTouchPoints ?? 0,
  screenWidth = Math.min(globalThis.screen?.width ?? Infinity, globalThis.screen?.height ?? Infinity),
} = {}) {
  // A 4x composition is 4320 x 1808 (7.8 MP). That exceeds the reliable
  // per-canvas area/memory budget of several iOS Safari and Android WebView
  // versions, especially while the product preview creates its mask canvases.
  const mobile = coarsePointer || (maxTouchPoints > 0 && screenWidth <= 1024);
  return mobile ? Math.min(2, RENDER_SCALE) : RENDER_SCALE;
}

export function createRenderer(canvas, { scale = preferredRenderScale(), previewExamples = false } = {}) {
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = CANVAS.width * scale;
  renderCanvas.height = CANVAS.height * scale;
  const ctx = renderCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  let renderVersion = 0;
  let state;
  let previewOverlay;

  function paintPreview(target = canvas) {
    const preview = target.getContext('2d');
    preview.imageSmoothingEnabled = true;
    preview.imageSmoothingQuality = 'high';
    preview.clearRect(0, 0, target.width, target.height);
    preview.drawImage(renderCanvas, 0, 0, target.width, target.height);
    if (!previewOverlay) return;
    preview.save();
    preview.scale(target.width / CANVAS.width, target.height / CANVAS.height);
    previewOverlay(preview);
    preview.restore();
  }
  function textWidth(text, spacing) {
    return [...text].reduce(
      (width, char, index) => width + ctx.measureText(char).width + (index ? spacing : 0),
      0
    );
  }

  function drawSpacedText(text, x, y, spacing, maxWidth, align = 'left', stroke = false) {
    const chars = [...text];
    const naturalWidth = textWidth(text, spacing);
    const scale = maxWidth && naturalWidth > maxWidth ? maxWidth / naturalWidth : 1;
    const visualWidth = naturalWidth * scale;
    let cursor = align === 'right' ? x - visualWidth : align === 'center' ? x - visualWidth / 2 : x;
    ctx.save();
    ctx.translate(cursor, y);
    ctx.scale(scale, 1);
    chars.forEach((char, index) => {
      if (stroke) ctx.strokeText(char, 0, 0);
      ctx.fillText(char, 0, 0);
      cursor = ctx.measureText(char).width + (index < chars.length - 1 ? spacing : 0);
      ctx.translate(cursor, 0);
    });
    ctx.restore();
  }

  function drawRatingValue(frameImage) {
    const digits = String(state.ratingValue).slice(-5);
    let cellCenters = [230.5, 246, 261, 276, 291];
    let y = 49;
    if (state.region === 'jp') {
      const frame = slots.ratingFrame;
      const inset = RATING_FRAME_INSET;
      const [left, top, width, height] = (frameImage && visibleRatingBounds(frameImage)) ||
        [4, 4, state.ratingValue >= 14000 ? 596 : 656, 122];
      cellCenters = JP_RATING_CELL_X.map(x => frame.x + inset + (x - left) / width * (frame.width - 2 * inset));
      y = frame.y + inset + (JP_RATING_CELL_Y - top) / height * (frame.height - 2 * inset);
    }
    const startCell = 5 - digits.length;
    ctx.save();
    ctx.font = `800 19px ${RATING_FONT}, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.35;
    ctx.strokeStyle = '#76530d';
    ctx.fillStyle = '#fbc802';
    [...digits].forEach((digit, index) => {
      const x = cellCenters[startCell + index];
      ctx.strokeText(digit, x, y);
      ctx.fillText(digit, x, y);
    });
    ctx.restore();
  }

  function drawPlayerName() {
    ctx.save();
    // Half a blank cell + eight fixed name cells span the board to the rank,
    // even when rank is hidden. No name-length or per-glyph scaling.
    const left = slots.nameBase.x;
    const { glyphs, cellWidth } = layoutPlayerName(state.playerName || '', slots.rank.x - left);
    ctx.font = `400 ${cellWidth}px ${DISPLAY_FONT}, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111318';
    for (const glyph of glyphs) {
      ctx.save();
      // Unusually wide fallback glyphs or ink overhangs are clipped rather
      // than compressed, so they cannot intrude into another cell or the rank.
      ctx.beginPath();
      ctx.rect(left + glyph.x, slots.nameBase.y, cellWidth, slots.nameBase.height);
      ctx.clip();
      ctx.fillText(glyph.text, left + glyph.x + cellWidth / 2, 87);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawTitleText() {
    const slot = slots.titleBase;
    ctx.save();
    ctx.font = `600 13.33333px ${DISPLAY_FONT}, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const normal = state.titleColor === 'Normal';
    // Canvas strokes are centered on the glyph edge. Drawing twice the desired
    // outer width and then filling the glyph leaves a true outside-only outline.
    ctx.lineWidth = normal ? 2 : 2.4;
    ctx.strokeStyle = normal ? 'rgba(35, 39, 52, .92)' : 'rgba(42, 31, 5, .9)';
    ctx.fillStyle = '#ffffff';
    drawSpacedText(
      state.titleName,
      272.2223658521258,
      126.44731107159686,
      0.2666666,
      slot.width - 20,
      'center',
      true
    );
    ctx.restore();
  }

  function drawTitleBase(image, slot) {
    // JP NET frames are already cropped to the visible 25-pixel artwork.
    if (state.region === 'jp') {
      ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
      return;
    }
    // The source has transparent rows 0–4 and 30–35. Cropping only those rows
    // thickens the frame vertically without changing its destination bounds.
    ctx.drawImage(image, 0, 5, image.naturalWidth, 25, slot.x, slot.y, slot.width, slot.height);
  }

  async function render(composition, { strict = false, refreshId, onRegionalDisplayError } = {}) {
    if (nameCharacterCount(composition.playerName || '') > 8) {
      alert('名称最多允许八个字符，请修改后再试。');
      return;
    }
    const version = ++renderVersion;
    const snapshot = structuredClone(composition);
    const ordered = COMPOSITION_ORDER.map(id => [id,slots[id]]);
    const drawable = [];
    const prepared = ordered.map(async ([id, slot]) => {
      if (!snapshot.visible[id]) return null;
      if (
        ['ratingDigits', 'playerName'].includes(id) ||
          id === 'titleText'
      ) {
        return { id, slot };
      }
      try {
        return { id, slot, image: await loadImage(snapshot.files[id], refreshId) };
      } catch (error) {
        if (strict) throw Object.assign(new Error(`素材未加载完成：${id}`), { assetSlot: id });
        console.warn(`素材加载失败：${snapshot.files[id]}`, error);
        if (id === 'background' && snapshot.files[id] !== DEFAULT_BACKGROUND) {
          return { id, slot, image: await loadImage(DEFAULT_BACKGROUND) };
        }
        return null;
      }
    });
    let regionalDisplayFailure;
    const [images, , display] = await Promise.all([
      Promise.all(prepared),
      snapshot.visible.ratingDigits ? prepareRatingFont() : null,
      prepareRegionalDisplay(snapshot, refreshId, previewExamples).catch(error => {
        regionalDisplayFailure = Object.assign(new Error('展示素材加载失败', { cause: error }), {
          assetSlot: snapshot.screenMode,
        });
        if (strict) throw regionalDisplayFailure;
        console.warn('展示素材加载失败', error);
        return null;
      }),
    ]);
    drawable.push(...images.filter(Boolean));
    if (version !== renderVersion) return false;
    onRegionalDisplayError?.(regionalDisplayFailure);
    state = snapshot;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const ratingFrame = drawable.find(layer => layer.id === 'ratingFrame')?.image;
    for (const { id, slot, image } of drawable) {
      if (id === 'ratingDigits') {
        drawRatingValue(ratingFrame);
        continue;
      }
      if (id === 'playerName') {
        drawPlayerName();
        continue;
      }
      if (id === 'titleText') {
        drawTitleText();
        continue;
      }
      if (id === 'titleBase' && state.titleColor === 'Bronze' && state.region !== 'jp') {
        ctx.save();
        ctx.filter = 'sepia(1) saturate(1.25) brightness(.78)';
        drawTitleBase(image, slot);
        ctx.restore();
      } else if (id === 'titleBase') {
        drawTitleBase(image, slot);
      } else if (id === 'ratingFrame' && state.region === 'jp') {
        const bounds = visibleRatingBounds(image);
        // The CN frame artwork sits two canvas pixels inside the shared slot.
        const inset = RATING_FRAME_INSET;
        if (bounds) ctx.drawImage(image, ...bounds, slot.x + inset, slot.y + inset, slot.width - 2 * inset, slot.height - 2 * inset);
        else ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
      } else {
        ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
      }
    }
    display?.draw(ctx);
    previewOverlay = display?.preview;
    paintPreview();
    return true;
  }

  return { render, renderCanvas, paintPreview };
}

import { CANVAS, DISPLAY_FONT, RENDER_SCALE, DEFAULT_BACKGROUND, slots } from './config.js';
import { nameCharacterCount } from './model.js';
import { loadImage } from './assets.js';
export function createRenderer(canvas) {
  const previewCtx = canvas.getContext('2d');
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = CANVAS.width * RENDER_SCALE;
  renderCanvas.height = CANVAS.height * RENDER_SCALE;
  const ctx = renderCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  previewCtx.imageSmoothingEnabled = true;
  previewCtx.imageSmoothingQuality = 'high';

  let renderVersion = 0;
  let state;
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

  function drawRatingValue() {
    const digits = String(state.ratingValue).slice(-5);
    const cellCenters = [230.5, 246, 261, 276, 291];
    const startCell = 5 - digits.length;
    ctx.save();
    ctx.font = `700 15px ${DISPLAY_FONT}, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fbc802';
    ctx.fillStyle = '#fbc802';
    [...digits].forEach((digit, index) => {
      const x = cellCenters[startCell + index];
      const y = 49;
      ctx.strokeText(digit, x, y);
      ctx.fillText(digit, x, y);
    });
    ctx.restore();
  }

  function drawPlayerName() {
    const slot = slots.playerName;
    ctx.save();
    ctx.font = `400 21.33333px ${DISPLAY_FONT}, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111318';
    const availableWidth = slots.rank.x - slot.x - 4;
    const spacing = (availableWidth - ctx.measureText('あ').width * 8) / 7;
    drawSpacedText(state.playerName || '', slot.x, 87, spacing, availableWidth);
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
    // The source has transparent rows 0–4 and 30–35. Cropping only those rows
    // thickens the frame vertically without changing its destination bounds.
    ctx.drawImage(image, 0, 5, image.naturalWidth, 25, slot.x, slot.y, slot.width, slot.height);
  }

  async function render(composition, { strict = false } = {}) {
    if (nameCharacterCount(composition.playerName || '') > 8) {
      alert('名称最多允许八个字符，请修改后再试。');
      return;
    }
    const version = ++renderVersion;
    const snapshot = structuredClone(composition);
    const ordered = Object.entries(slots)
      .filter(([id]) => !['rank', 'friendBattle'].includes(id))
      .sort((a, b) => a[1].z - b[1].z);
    ordered.push(['rank', slots.rank]);
    ordered.push(['friendBattle', slots.friendBattle]);
    const drawable = [];
    const prepared = ordered.map(async ([id, slot]) => {
      if (!snapshot.visible[id]) return null;
      if (
        ['ratingDigits', 'playerName'].includes(id) ||
        (id === 'titleText' && snapshot.titleName)
      ) {
        return { id, slot };
      }
      try {
        return { id, slot, image: await loadImage(snapshot.files[id]) };
      } catch (error) {
        if (strict) throw new Error(`素材未加载完成：${id}`);
        console.warn(`素材加载失败：${snapshot.files[id]}`, error);
        if (id === 'background' && snapshot.files[id] !== DEFAULT_BACKGROUND) {
          return { id, slot, image: await loadImage(DEFAULT_BACKGROUND) };
        }
        return null;
      }
    });
    drawable.push(...(await Promise.all(prepared)).filter(Boolean));
    if (version !== renderVersion) return false;
    state = snapshot;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    for (const { id, slot, image } of drawable) {
      if (id === 'ratingDigits') {
        drawRatingValue();
        continue;
      }
      if (id === 'playerName') {
        drawPlayerName();
        continue;
      }
      if (id === 'titleText' && snapshot.titleName) {
        drawTitleText();
        continue;
      }
      if (id === 'titleBase' && state.titleColor === 'Bronze') {
        ctx.save();
        ctx.filter = 'sepia(1) saturate(1.25) brightness(.78)';
        drawTitleBase(image, slot);
        ctx.restore();
      } else if (id === 'titleBase') {
        drawTitleBase(image, slot);
      } else {
        ctx.drawImage(image, slot.x, slot.y, slot.width, slot.height);
      }
    }
    previewCtx.clearRect(0, 0, CANVAS.width, CANVAS.height);
    previewCtx.drawImage(renderCanvas, 0, 0, CANVAS.width, CANVAS.height);
    return true;
  }

  return { render, renderCanvas };
}

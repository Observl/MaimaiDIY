export function companionLevelFrame(level, leader = false) {
  const color = level >= 1000 ? 'gold' : level >= 100 ? 'silver' : level >= 10 ? 'bronze' : null;
  return color ? `level-${leader ? 'leader' : 'frame'}-${color}` : null;
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateConfirmedCompanionSets(data) {
  if (data?.schemaVersion !== 1 || !isRecord(data.characters) || !isRecord(data.sets) || !isRecord(data.colors))
    throw new Error('Invalid confirmed companion sets');
  for (const [id, set] of Object.entries(data.sets)) {
    if (!/^[a-f0-9]{20}$/.test(id) || !['frame', 'base', 'leader', 'star'].every(part =>
      typeof set[part] === 'string' && new RegExp(`^${part}-[a-f0-9]{20}$`).test(set[part])))
      throw new Error(`Invalid confirmed companion texture: ${id}`);
  }
  for (const [id, assignment] of Object.entries(data.characters)) {
    if (!/^\d{6}$/.test(id) || !Object.hasOwn(data.sets, assignment.setId))
      throw new Error(`Invalid confirmed companion assignment: ${id}`);
  }
  for (const setId of Object.values(data.colors))
    if (!Object.hasOwn(data.sets, setId)) throw new Error('Missing confirmed color set');
  return data;
}

export function validateCompanionPalettes(data) {
  if (data?.schemaVersion !== 1 || !isRecord(data.regions) ||
      !Array.isArray(data.awakeningLevels) || data.awakeningLevels.length !== 6 ||
      !data.awakeningLevels.every((level, index, levels) => Number.isSafeInteger(level) &&
        level > (levels[index - 1] ?? 0) && level <= 9999))
    throw new Error('Invalid companion palette index');
  for (const region of ['cn', 'jp']) {
    const entry = data.regions[region];
    if (!isRecord(entry?.characters) || !Array.isArray(entry.palettes) || entry.palettes.length !== 5)
      throw new Error(`Invalid companion palettes: ${region}`);
    const { fallbackPalettes, leaderHue } = entry.display ?? {};
    if (!Array.isArray(fallbackPalettes) || !fallbackPalettes.length ||
        !fallbackPalettes.every(slot => Number.isInteger(slot) && slot >= 1 && slot <= 4) ||
        !Array.isArray(leaderHue) || leaderHue.length !== 5 ||
        !leaderHue.every(hue => Number.isInteger(hue) && hue >= 0 && hue < 360))
      throw new Error(`Invalid companion fallback palettes: ${region}`);
    for (const [slot, palette] of entry.palettes.entries()) {
      if (palette?.slot !== slot || typeof palette.frame !== 'string' ||
          typeof palette.starBase !== 'string' ||
          (slot ? typeof palette.background !== 'string' : palette.background !== null))
        throw new Error(`Invalid companion palette: ${region}/${slot}`);
    }
    for (const [id, slot] of Object.entries(entry.characters)) {
      if (!/^\d{6}$/.test(id) || (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot > 4)))
        throw new Error(`Invalid companion palette assignment: ${region}/${id}`);
    }
  }
  return data;
}

export function companionAwakeningTier(level, thresholds) {
  return thresholds.filter(threshold => level >= threshold).length;
}

export function companionAwakeningProgress(level, tier, thresholds) {
  if (tier === 0 || tier >= thresholds.length - 1) return null;
  const start = thresholds[tier - 1];
  return Math.floor((level - start) * 10 / (thresholds[tier] - start));
}

export function companionPaletteSlot(region, id) {
  const key = String(id).padStart(6, '0');
  const source = region.characters[key];
  if (Number.isInteger(source)) return source;
  return region.display.fallbackPalettes[0];
}

export function validateMaiDrawPalettes(data) {
  if (!isRecord(data?.characters) || !isRecord(data.colors))
    throw new Error('Invalid mai_draw companion palettes');
  for (const [id, rgb] of Object.entries(data.colors)) {
    if (!/^\d+$/.test(id) || !Array.isArray(rgb) || rgb.length !== 3 ||
        !rgb.every(value => Number.isInteger(value) && value >= 0 && value <= 255))
      throw new Error(`Invalid mai_draw palette color: ${id}`);
  }
  for (const [id, color] of Object.entries(data.characters)) {
    if (!/^\d{6}$/.test(id) || !Number.isSafeInteger(color) || !Object.hasOwn(data.colors, color))
      throw new Error(`Invalid mai_draw character palette: ${id}`);
  }
  return data;
}

export function maiDrawPaletteForCharacter(data, id) {
  const colorId = data.characters[String(id).padStart(6, '0')];
  return colorId === undefined ? null : { colorId, rgb: data.colors[colorId] };
}

const validBounds = (bounds, clipped = false) => Array.isArray(bounds) && bounds.length === 4 &&
  bounds.every(Number.isSafeInteger) && bounds[2] > 0 && bounds[3] > 0 &&
  (clipped ? bounds[0] < 1080 && bounds[1] < 452 && bounds[0] + bounds[2] > 0 && bounds[1] + bounds[3] > 0
    : bounds[0] >= 0 && bounds[1] >= 0 && bounds[0] + bounds[2] <= 1080 && bounds[1] + bounds[3] <= 452);

export function validateCompanionDisplay(display, layout, region) {
  const assets = new Set();
  const requireLayer = name => {
    if (typeof name !== 'string' || !/^party-[\w-]+$/.test(name) ||
        !Object.hasOwn(layout, name) || !validBounds(layout[name]))
      throw new Error(`Invalid companion display layer: ${region}/${name}`);
    assets.add(name);
  };
  const invalid = () => new Error(`Invalid companion display configuration: ${region}`);
  if (!validBounds(display?.portrait, true) || display.levelDigits?.length !== 10 ||
      !Array.isArray(display.levelDigits) || !Array.isArray(display.slots) || display.slots.length !== 5)
    throw invalid();
  display.levelDigits.forEach(requireLayer);
  for (const [index, slot] of display.slots.entries()) {
    const leader = index === 0;
    if (slot?.role !== (leader ? 'leader' : 'member') ||
        !Array.isArray(slot.levelBounds) || slot.levelBounds.length !== 4 ||
        !slot.levelBounds.every(validBounds)) throw invalid();
    if (leader && slot.mask !== null) throw invalid();
    if (!leader) requireLayer(slot.mask);
    for (const style of [slot.normal, slot.superAwakening]) {
      requireLayer(style?.frame);
      if (leader && style.background !== null) throw invalid();
      if (!leader) requireLayer(style.background);
      if (style.starBase !== null) requireLayer(style.starBase);
    }
    const evolved = slot.superAwakening;
    requireLayer(slot.normal.starBase);
    const progress = slot.normal.progressStar;
    const [, , width, height] = layout[slot.normal.starBase];
    if (!validBounds(progress) || progress[0] + progress[2] > width ||
        progress[1] + progress[3] > height) throw invalid();
    requireLayer(evolved.starBase);
    if (!Array.isArray(slot.portraitBounds) || slot.portraitBounds.length !== 4 ||
        !slot.portraitBounds.every(Number.isFinite) || slot.portraitBounds[2] <= 0 || slot.portraitBounds[3] <= 0 ||
        !Array.isArray(slot.levelTransforms) || slot.levelTransforms.length !== 4 ||
        !slot.levelTransforms.every(transform => Array.isArray(transform) && transform.length === 6 && transform.every(Number.isFinite)))
      throw invalid();
  }
  return assets;
}

export function validateRegionalDisplayLayout(layout, region) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout))
    throw new Error(`Invalid regional display layout: ${region}`);

  const required = ['song-overlay', 'dot', 'percent', 'sd', 'dx'];
  for (let slot = 0; slot < 5; slot++) {
    required.push(`base-${slot}`, `level-label-${slot}`);
    if (region === 'cn') required.push(`cover-${slot}`);
    for (let digit = 0; digit <= 10; digit++) required.push(`level-${slot}-${digit}`);
  }
  if (region === 'jp') required.push('cover', 'cover-4');
  for (let digit = 0; digit < 10; digit++)
    required.push(`digit-${digit}`);

  for (const name of required) {
    const rect = Object.hasOwn(layout, name) ? layout[name] : null;
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isSafeInteger))
      throw new Error(`Missing or invalid regional display layer: ${region}/${name}`);
    const [x, y, width, height] = rect;
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1080 || y + height > 452)
      throw new Error(`Regional display layer out of bounds: ${region}/${name}`);
  }
  return required;
}

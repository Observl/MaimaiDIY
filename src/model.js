import {
  slots,
  controls,
  COS,
  DEFAULT_PRESET,
  RATING_BANDS,
  TITLE_COLOR_NAMES,
  TEMPLATE_FILE_MAX_BYTES,
} from './config.js';
export function ratingBand(value) {
  return [...RATING_BANDS].reverse().find((band) => value >= band.min) || RATING_BANDS[0];
}

export function applyRatingBand(state) {
  const band = ratingBand(state.ratingValue);
  state.files.ratingFrame = `${COS.baseUrl}/materials/ratings/${band.asset}`;
  return band;
}

export function titleAsset(color) {
  const supported = ['Normal', 'Silver', 'Gold', 'Rainbow'];
  const fileColor = supported.includes(color) ? color : 'Gold';
  return `assets/titles/UI_CMN_Shougou_${fileColor}.png`;
}

export function nameCharacterCount(value) {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(value)].length;
  }
  return [...value].length;
}

export function safeTemplateName(value) {
  const name = String(value || '')
    .trim()
    .slice(0, 30);
  return name || 'MaimaiDIY 模板';
}

export function isAllowedAsset(value, slotId) {
  if (typeof value !== 'string' || value.length > TEMPLATE_FILE_MAX_BYTES) return false;
  if (slotId === 'avatar' && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value))
    return true;
  try {
    const url = new URL(value, 'https://local.invalid/');
    const local = url.origin === 'https://local.invalid' && /^(?:assets|materials)\//.test(value);
    const cloud = url.origin === COS.baseUrl && url.pathname.startsWith('/materials/');
    return (
      !url.username &&
      !url.password &&
      (local || cloud) &&
      /\.(?:png|jpe?g|webp)$/i.test(url.pathname) &&
      (cloud || /^\/(?:assets|materials)\//.test(url.pathname))
    );
  } catch {
    return false;
  }
}

export function sanitizeImportedState(value, baseState = createDefaultState()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('模板状态无效');
  const next = structuredClone(baseState);
  if (value.files && typeof value.files === 'object') {
    Object.keys(slots).forEach((slotId) => {
      if (!Object.hasOwn(value.files, slotId)) return;
      if (!isAllowedAsset(value.files[slotId], slotId))
        throw new Error('模板包含不受支持的素材地址');
      next.files[slotId] = value.files[slotId];
    });
  }
  if (value.visible && typeof value.visible === 'object') {
    Object.keys(slots).forEach((slotId) => {
      if (typeof value.visible[slotId] === 'boolean') next.visible[slotId] = value.visible[slotId];
    });
  }
  controls
    .filter((control) => !control.canHide)
    .flatMap((control) => control.slotIds)
    .forEach((slotId) => {
      next.visible[slotId] = true;
    });
  if (value.labels && typeof value.labels === 'object') {
    controls.forEach((control) => {
      if (typeof value.labels[control.id] === 'string')
        next.labels[control.id] = value.labels[control.id].slice(0, 120);
    });
  }
  const rating = Number(value.ratingValue);
  if (Number.isFinite(rating)) next.ratingValue = Math.max(0, Math.min(99999, Math.round(rating)));
  if (typeof value.playerName === 'string') {
    if (nameCharacterCount(value.playerName) > 8)
      throw new Error('模板名称字段中的玩家名称超过八个字符');
    next.playerName = value.playerName;
  }
  if (typeof value.titleName === 'string') next.titleName = value.titleName.slice(0, 100);
  if (Object.hasOwn(TITLE_COLOR_NAMES, value.titleColor)) next.titleColor = value.titleColor;
  next.files.titleBase = titleAsset(next.titleColor);
  applyRatingBand(next);
  return next;
}

export function createDefaultState() {
  const state = {
    files: Object.fromEntries(Object.entries(slots).map(([id, slot]) => [id, slot.asset])),
    visible: Object.fromEntries(Object.keys(slots).map((id) => [id, true])),
    labels: { ...DEFAULT_PRESET.labels },
    ratingValue: DEFAULT_PRESET.ratingValue,
    playerName: DEFAULT_PRESET.playerName,
    titleName: DEFAULT_PRESET.titleName,
    titleColor: DEFAULT_PRESET.titleColor,
  };
  Object.assign(state.files, DEFAULT_PRESET.files);
  applyRatingBand(state);
  return state;
}

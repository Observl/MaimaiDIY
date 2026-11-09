import { jpBadges, jpTitleFrames, isJpRankAsset } from './jp-profile-assets.js';
import {
  sanitizeRegionFields,
  isPinnedRegionAsset,
  JP_ASSET_ROOT,
  JP_RATING_ROOT,
  JP_RATING_BANDS,
  isPinnedJpRatingAsset,
} from './region-profile.js';
import {
  slots,
  controls,
  COS,
  DEFAULT_PRESET,
  RATING_BANDS,
  TITLE_COLOR_NAMES,
  TEMPLATE_FILE_MAX_BYTES,
} from './config.js';
import { resolveAssetUrl } from './asset-paths.js';
import { nameCharacters } from './player-name.js';
export const JP_UNAVAILABLE_BADGES = Object.freeze({
  rank: '日服段位素材待补充',
  friendBattle: '日服友人对战素材待补充',
});

function isJpBadgeAsset(value, slotId) {
  if (slotId === 'rank') return isJpRankAsset(resolveAssetUrl(value));
  if (slotId !== 'friendBattle') return false;
  const resolved = resolveAssetUrl(value);
  const root = COS.baseUrl + '/materials/friend-battles/';
  return resolved === jpBadges.friendBattle ||
    (typeof resolved === 'string' && resolved.startsWith(root) && /^\d{1,3}\.png$/.test(resolved.slice(root.length)));
}

export function clearUnavailableRegionBadges(state) {
  if (state.region === 'jp') {
    for (const [slotId, label] of Object.entries(JP_UNAVAILABLE_BADGES)) {
      if (isJpBadgeAsset(state.files[slotId], slotId)) continue;
      state.files[slotId] = '';
      state.visible[slotId] = false;
      state.labels[slotId] = label;
    }
  }
  return state;
}

export function ratingBand(value, region = 'cn') {
  const bands = region === 'jp' ? JP_RATING_BANDS : RATING_BANDS;
  return [...bands].reverse().find((band) => value >= band.min) || bands[0];
}

export function applyRatingBand(state) {
  const band = ratingBand(state.ratingValue, state.region);
  state.files.ratingFrame =
    state.region === 'jp'
      ? `${JP_RATING_ROOT}${band.asset}`
      : `${COS.baseUrl}/materials/ratings/${band.asset}`;
  return band;
}

export function titleAsset(color, region) {
  if (region === 'jp') return Object.hasOwn(jpTitleFrames, color) ? jpTitleFrames[color] : jpTitleFrames.Normal;
  const supported = ['Normal', 'Silver', 'Gold', 'Rainbow'];
  const fileColor = supported.includes(color) ? color : 'Gold';
  return `${COS.baseUrl}/materials/titles/UI_CMN_Shougou_${fileColor}.png`;
}

export function nameCharacterCount(value) {
  return nameCharacters(value).length;
}

export function safeTemplateName(value) {
  const name = String(value || '')
    .trim()
    .slice(0, 30);
  return name || 'MaimaiDIY 模板';
}

function isLegacyMaterialPath(pathname) {
  const match = /^\/materials\/(?:backgrounds|nameplates|avatars|ratings|ranks|friend-battles|titles|name-bases|previews)\/([^/]+)$/i.exec(pathname);
  if (!match) return false;
  // Some original CN object names contain spaces and parentheses. Accept their
  // canonical URL spelling only, without decoding directory names or separators.
  const filename = decodeURIComponent(match[1]);
  if (!/^[A-Za-z0-9_. ()-]+\.(?:png|jpe?g|webp)$/i.test(filename)) return false;
  const canonical = encodeURIComponent(filename);
  const encodedParentheses = canonical.replace(/[()]/g, (char) =>
    char === '(' ? '%28' : '%29'
  );
  // Older picker entries without source use encodeURIComponent, which leaves
  // parentheses literal; the COS manifest encodes both parentheses instead.
  return match[1] === canonical || match[1] === encodedParentheses;
}

export function isAllowedAsset(value, slotId, region) {
  if (typeof value !== 'string' || value.length > TEMPLATE_FILE_MAX_BYTES) return false;
  if (!Object.hasOwn(slots, slotId) || (region !== undefined && !['cn', 'jp'].includes(region)))
    return false;
  // Check the original spelling before URL parsing, which normalizes traversal,
  // backslashes, escaped characters and default ports.
  if (/[?#\\\s\u0000-\u001f\u007f]/.test(value) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(value))
    return false;
  if (slotId === 'avatar' && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value))
    return true;
  if (value === 'cos-index/cn-review/images/UI_Frame_409517.png')
    return slotId === 'background' && region !== 'jp';
  if (isJpBadgeAsset(value, slotId) || (slotId === 'titleBase' && Object.values(jpTitleFrames).includes(resolveAssetUrl(value))))
    return region !== 'cn' || (slotId === 'friendBattle' && resolveAssetUrl(value) !== jpBadges.friendBattle);
  if (!/^(?:https:\/\/|assets\/|materials\/)/.test(value)) return false;
  if (isPinnedRegionAsset(value, slotId) || isPinnedJpRatingAsset(value, slotId))
    return region !== 'cn';
  try {
    const resolved = resolveAssetUrl(value);
    const url = new URL(resolved);
    if (url.href !== resolved || url.origin !== COS.baseUrl || url.username || url.password)
      return false;
    // A relative materials/regions URL must meet the same exact regional allowlist.
    if (isPinnedRegionAsset(resolved, slotId) || isPinnedJpRatingAsset(resolved, slotId))
      return region !== 'cn';
    // Keep the original CN material directories separate from new release trees.
    if (!isLegacyMaterialPath(url.pathname)) return false;
    if (region !== 'jp') return true;
    // Only these original neutral layers are shared with JP. ratingDigits is a
    // historical placeholder; its artwork is never rendered (digits use a font).
    if (['titleBase', 'titleText'].includes(slotId))
      return /^\/materials\/titles\/UI_CMN_Shougou_(?:Normal|Silver|Gold|Rainbow)\.png$/.test(url.pathname);
    if (['nameBase', 'playerName'].includes(slotId))
      return url.pathname === '/materials/name-bases/default.png';
    return slotId === 'ratingDigits' && resolved === slots.ratingDigits.asset;
  } catch {
    return false;
  }
}

export function sanitizeImportedState(value, baseState = createDefaultState(), catalog) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('模板状态无效');
  const regionFields = sanitizeRegionFields(value, catalog);
  const next = structuredClone(
    regionFields.region === (baseState.region || 'cn')
      ? baseState
      : createDefaultState(regionFields.region)
  );
  Object.assign(next, regionFields);
  if (value.files && typeof value.files === 'object') {
    Object.keys(slots).forEach((slotId) => {
      if (!Object.hasOwn(value.files, slotId)) return;
      if (next.region === 'jp' && Object.hasOwn(jpBadges, slotId) && !isJpBadgeAsset(value.files[slotId], slotId)) {
        const asset = value.files[slotId];
        const category = slotId === 'rank' ? 'ranks' : 'friend-battles';
        // Early JP drafts inherited these CN badge slots. Drop valid old badges
        // without ever accepting them as JP artwork or losing the user's draft.
        const legacyBadge = isAllowedAsset(asset, slotId, 'cn') &&
          new RegExp(`^${category}/[0-9]{1,3}\\.png$`).test(
            resolveAssetUrl(asset).slice(`${COS.baseUrl}/materials/`.length)
          );
        if (asset !== '' && !legacyBadge) throw new Error('模板包含不受支持的素材地址');
        next.files[slotId] = '';
        return;
      }
      if (!isAllowedAsset(value.files[slotId], slotId, next.region))
        throw new Error('模板包含不受支持的素材地址');
      next.files[slotId] = resolveAssetUrl(value.files[slotId]);
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
  next.files.titleBase = titleAsset(next.titleColor, next.region);
  applyRatingBand(next);
  return clearUnavailableRegionBadges(next);
}

export function createDefaultState(region = 'cn') {
  const state = {
    ...sanitizeRegionFields({ region }),
    files: Object.fromEntries(Object.entries(slots).map(([id, slot]) => [id, slot.asset])),
    visible: Object.fromEntries(Object.keys(slots).map((id) => [id, true])),
    labels: { ...DEFAULT_PRESET.labels },
    ratingValue: DEFAULT_PRESET.ratingValue,
    playerName: DEFAULT_PRESET.playerName,
    titleName: DEFAULT_PRESET.titleName,
    titleColor: DEFAULT_PRESET.titleColor,
  };
  Object.assign(state.files, DEFAULT_PRESET.files);
  if (region === 'jp') {
    Object.assign(state.labels, {
      background: '日服默认背景',
      avatar: '日服默认头像',
      nameplate: '日服默认姓名框',
    });
    state.files.friendBattle = '';
    state.titleName = state.labels.title = 'でびゅー';
    state.titleColor = 'Normal';
    state.files.titleBase = titleAsset(state.titleColor, region);
    state.files.background = `${JP_ASSET_ROOT}frames/UI_Frame_000000.png`;
    state.files.avatar = `${JP_ASSET_ROOT}icons/UI_Icon_000000.png`;
    state.files.nameplate = `${JP_ASSET_ROOT}plates/UI_Plate_000000.png`;
  }
  applyRatingBand(state);
  return clearUnavailableRegionBadges(state);
}

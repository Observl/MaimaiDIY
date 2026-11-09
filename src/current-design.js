import { requireRegion } from './region-profile.js';
import { sanitizeImportedState } from './model.js';

export const LEGACY_CURRENT_DESIGN_KEY = 'maimai-diy-current-design-v1';
export const CURRENT_DESIGN_KEY = 'maimai-diy-region-current-design-v1';

export function regionDesignKey(region) {
  return `${CURRENT_DESIGN_KEY}:${requireRegion(region)}`;
}

function readDraft(draft) {
  const state = sanitizeImportedState(draft.state);
  if (state.region === 'jp' && !draft.jpTitleVisibilityRestored &&
      state.visible.titleBase === false && state.visible.titleText === false) {
    state.visible.titleBase = state.visible.titleText = true;
  }
  return state;
}

export function saveCurrentDesign(state, storage) {
  try {
    const clean = sanitizeImportedState(state);
    const target = storage || localStorage;
    const payload = JSON.stringify({ version: 1, jpTitleVisibilityRestored: true, state: clean });
    // Write the region snapshot first so switching regions cannot lose this draft.
    target.setItem(regionDesignKey(clean.region), payload);
    target.setItem(CURRENT_DESIGN_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

export function readCurrentDesign(storage = localStorage) {
  try {
    const draft = JSON.parse(
      (storage || localStorage).getItem(CURRENT_DESIGN_KEY) ||
        (storage || localStorage).getItem(LEGACY_CURRENT_DESIGN_KEY) ||
        'null'
    );
    return draft?.version === 1 ? readDraft(draft) : null;
  } catch {
    return null;
  }
}

export function readRegionDesign(region, storage = localStorage) {
  try {
    const target = storage || localStorage;
    const raw = target.getItem(regionDesignKey(region));
    if (raw !== null) {
      const draft = JSON.parse(raw);
      if (draft?.version !== 1) return null;
      const clean = readDraft(draft);
      return clean.region === region ? clean : null;
    }
    // Existing latest/legacy drafts are read-only fallbacks, never migrated in place.
    const latest = readCurrentDesign(target);
    return latest?.region === region ? latest : null;
  } catch {
    return null;
  }
}

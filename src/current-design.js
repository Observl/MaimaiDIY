import { sanitizeImportedState } from './model.js';

export const CURRENT_DESIGN_KEY = 'maimai-diy-current-design-v1';

export function saveCurrentDesign(state, storage) {
  try {
    (storage || localStorage).setItem(CURRENT_DESIGN_KEY, JSON.stringify({ version: 1, state }));
    return true;
  } catch {
    return false;
  }
}

export function readCurrentDesign(storage = localStorage) {
  try {
    const draft = JSON.parse((storage || localStorage).getItem(CURRENT_DESIGN_KEY) || 'null');
    return draft?.version === 1 ? sanitizeImportedState(draft.state) : null;
  } catch {
    return null;
  }
}

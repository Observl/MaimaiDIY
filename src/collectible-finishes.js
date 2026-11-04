import { COLLECTIBLE_PLATES } from './collectible-catalog.js';

const silver = [212, 229, 255], gold = [255, 216, 134], prism = [235, 215, 255];
export function collectibleFinish(state, slot) {
  if (!state.visible[slot]) return null;
  const file = state.files[slot] || '';
  if (slot === 'rank') {
    const match = file.match(/(?:^|\/)ranks\/(\d{2})\.png(?:[?#]|$)/);
    const level = match ? Number(match[1]) : -1;
    if (level < 12 || level > 23) return null;
    return { shape: level >= 22 ? 'rank-emblems' : 'rank-border', uv: 0.8,
      glitter: level < 16 ? 0.4 : level < 19 ? 0.6 : 0.85,
      rainbow: level >= 19 ? 0.8 : 0.05, tint: level < 16 ? silver : level < 19 ? gold : prism };
  }
  if (slot === 'friendBattle') {
    const match = file.match(/(?:^|\/)friend-battles\/(\d{2})\.png(?:[?#]|$)/);
    const level = match ? Number(match[1]) : -1;
    if (level < 10 || level > 25) return null;
    return { shape: 'battle-emblems', uv: 0.8, glitter: level < 15 ? 0 : level < 20 ? 0.4 : 0.8,
      rainbow: level === 25 ? 1 : 0.1, tint: level === 25 ? prism : level < 20 ? silver : gold };
  }
  if (['titleBase','titleText'].includes(slot) && ['Gold', 'Silver'].includes(state.titleColor)) {
    return { shape: slot==='titleText' ? 'title-lettering' : 'title-rails', metal: state.titleColor, uv: 1, glitter: 0, rainbow: 0, tint: state.titleColor === 'Gold' ? gold : silver };
  }
  if (slot === 'nameplate') {
    const id = file.match(/UI_Plate_\d+\.png/)?.[0];
    const plate = COLLECTIBLE_PLATES[id];
    if (!plate) return null;
    return { shape: id === 'UI_Plate_006150.png' ? 'plate-wings' : plate.name.startsWith('鏡') ? 'plate-mirror' : 'plate-border',
      uv: 0.9, glitter: plate.kind === 'kiwami' ? 0.4 : plate.kind === 'shogun' ? 0.6 : 0.85,
      rainbow: ['god', 'maimai'].includes(plate.kind) ? 0.9 : 0.05,
      tint: plate.kind === 'kiwami' ? silver : plate.kind === 'shogun' ? gold : prism };
  }
  return null;
}

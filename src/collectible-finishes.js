import { COLLECTIBLE_PLATES } from './collectible-catalog.js';

const silver = [212, 229, 255], gold = [255, 216, 134], prism = [235, 215, 255];
export function collectibleFinish(state, slot) {
  if (!state.visible[slot]) return null;
  const file = state.files[slot] || '';
  if (slot === 'rank') {
    const match = file.match(/(?:^|\/)ranks\/(\d{2})\.png(?:[?#]|$)/);
    const level = match ? Number(match[1]) : -1;
    if (level < 0 || level > 23) return null;
    return { shape: level >= 22 ? 'rank-emblems' : 'rank-border', uv: 0.8,
      powder: level < 16 ? 0.7 : level < 19 ? 0.8 : 0.95,
      rainbow: level >= 19 ? 0.8 : 0.05, tint: level < 16 ? silver : level < 19 ? gold : prism };
  }
  if (slot === 'friendBattle') {
    const match = file.match(/(?:^|\/)friend-battles\/(\d{2})\.png(?:[?#]|$)/);
    const level = match ? Number(match[1]) : -1;
    if (level < 0 || level > 25) return null;
    return { shape: 'battle-emblems', uv: 0.9, powder: level < 20 ? 0.75 : 0.95,
      rainbow: level === 25 ? 1 : 0.1, tint: level === 25 ? prism : level < 20 ? silver : gold };
  }
  if (slot === 'titleBase') {
    return { shape: 'title-board', metal: state.titleColor, uv: 1, powder: 0.8, rainbow: 0, tint: state.titleColor === 'Gold' ? gold : silver };
  }
  if (slot === 'ratingFrame') {
    return { shape:'rating-frame', uv:1, powder:0.9, rainbow:0, tint:gold };
  }
  if(slot==='titleText')return {shape:'title-lettering',uv:0.9,powder:0.8,rainbow:0,tint:silver};
  if (slot === 'nameplate') {
    const id = file.match(/UI_Plate_\d+\.png/)?.[0];
    const plate = COLLECTIBLE_PLATES[id];
    if (!plate) return {shape:'plate-print',uv:0.85,powder:0.85,rainbow:0,tint:prism};
    return { shape: id === 'UI_Plate_006150.png' ? 'plate-wings' : plate.name.startsWith('鏡') ? 'plate-mirror' : 'plate-border',
      uv: 0.9, powder: plate.kind === 'kiwami' ? 0.75 : plate.kind === 'shogun' ? 0.8 : 0.9,
      rainbow: ['god', 'maimai'].includes(plate.kind) ? 0.9 : 0.05,
      tint: plate.kind === 'kiwami' ? silver : plate.kind === 'shogun' ? gold : prism };
  }
  return null;
}


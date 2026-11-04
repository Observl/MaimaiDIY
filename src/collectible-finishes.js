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

// Refine the authored region to the actual bright metal/feather pixels inside it.
// A filled polygon is only a search boundary, never the final effect silhouette.
export function finishDetailCoverage(profile, r, g, b, lettering = false) {
  const bright = (r+g+b)/3;
  const spread = Math.max(r,g,b)-Math.min(r,g,b);
  const warmMetal = r>155 && g>105 && b<170 && r>b*1.12;
  const paleMetal = bright>180 && spread<65;
  if(lettering && profile.shape.startsWith('rank')) return r>180 && g>180 && b>180 && spread<70 ? 1 : 0;
  if(profile.shape==='title-lettering') return paleMetal ? 1 : 0;
  if(profile.metal==='Gold') return warmMetal ? 1 : 0;
  if(profile.metal==='Silver') return paleMetal ? 1 : 0;
  if(profile.shape==='plate-wings') {
    const feather = r>150 && g>175 && b>175 && spread<90;
    return feather || warmMetal ? 1 : 0;
  }
  if(profile.shape==='plate-border' || profile.shape==='plate-mirror') return warmMetal || paleMetal ? 1 : 0;
  return bright>140 && (warmMetal || paleMetal || (g>155 && b>155)) ? 1 : 0;
}

// Deliberately narrow, authored shapes in original sprite coordinates.
// Letter faces have a separate region marker so their backing is not selected.
export function paintFinishShapes(ctx, shape, width, height) {
  const plate = shape.startsWith('plate');
  const title = shape.startsWith('title-');
  ctx.save();
  ctx.scale(width / (plate ? 717 : title ? 276 : shape.startsWith('rank') ? 380 : 140),
    height / (plate ? 116 : title ? 25 : shape.startsWith('rank') ? 160 : 84));
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineJoin = 'round';
  const line = (points, thickness) => {
    ctx.lineWidth = thickness; ctx.beginPath();
    points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.stroke();
  };
  const polygon = (points) => {
    ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.fill();
  };
  if (shape.startsWith('rank')) {
    line([[54,29],[358,22],[343,44]], 5);
    line([[43,123],[30,140],[317,138],[337,123]], 5);
    line([[48,47],[39,64],[33,108]], 4);
    line([[347,52],[342,99],[332,115]], 4);
    if (shape === 'rank-emblems') {
      for (const [x,y,r] of [[30,108,19],[346,60,18],[102,141,12],[290,18,10]]) {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      }
    }
    // The source-pixel refinement selects the actual bright letter faces.
    ctx.fillStyle='#808080'; ctx.fillRect(49,35,287,91);
  } else if (shape === 'battle-emblems') {
    polygon([[27,20],[30,8],[46,16],[52,3],[65,11],[70,0],[79,10],[92,3],[100,17],[115,8],[113,21]]);
    line([[20,25],[11,39],[16,57],[31,70],[52,77],[90,77],[112,66],[126,48],[120,26]], 7);
    ctx.fillRect(9,22,123,42);
  } else if(shape==='title-lettering') {
    ctx.fillRect(0,0,276,25);
  } else if (title) {
    line([[14,3],[261,3]], 3); line([[13,17],[262,17]], 2);
    line([[9,4],[5,8],[7,14],[12,17]], 2); line([[265,4],[271,8],[269,14],[264,17]], 2);
    ctx.clearRect(19,6,238,9);
  } else {
    line([[10,3],[706,3],[714,10],[714,106],[706,113],[10,113],[3,106],[3,10],[10,3]], 3);
    if (shape === 'plate-wings') {
      polygon([[413,16],[458,28],[468,39],[449,48],[430,32]]);
      polygon([[421,62],[448,50],[460,66],[441,85],[417,88]]);
      polygon([[668,25],[693,16],[685,42],[664,50]]);
      polygon([[666,62],[691,53],[703,81],[675,91]]);
      ctx.fillRect(465,10,192,99);
    } else if (shape === 'plate-mirror') {
      line([[9,9],[101,9],[110,17],[109,101],[101,108],[10,108],[5,99],[5,17],[9,9]], 6);
      polygon([[143,52],[155,37],[166,53],[188,57],[169,69],[165,86],[151,71],[134,68]]);
      polygon([[323,24],[339,11],[347,30],[366,39],[344,46],[332,62],[328,42],[311,35]]);
      ctx.fillRect(395,0,322,116);
    } else {
      ctx.fillRect(410,5,297,105);
    }
  }
  ctx.restore();
}

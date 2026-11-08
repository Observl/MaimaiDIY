import {COS,DEFAULT_BACKGROUND} from './config.js';
import { migratePinnedRegionAssetUrl } from './region-profile.js';
const root=COS.baseUrl+'/materials/';
const legacy={
  'default-background.png':DEFAULT_BACKGROUND,
  'background.png':root+'backgrounds/UI_Frame_000001.png',
  'avatar.png':root+'avatars/UI_Icon_559504.png',
  'nameplate.png':root+'nameplates/UI_Plate_006150.png',
  'rank.png':root+'ranks/18.png',
  'friendBattle.png':root+'friend-battles/21.png',
  'titleBase.png':root+'titles/UI_CMN_Shougou_Gold.png',
  'titleText.png':root+'titles/UI_CMN_Shougou_Gold.png',
  'nameBase.png':root+'name-bases/default.png',
  'playerName.png':root+'name-bases/default.png',
  'ratingFrame.png':root+'ratings/UI_CMN_DXRating_S_11.png',
  'ratingDigits.png':root+'ratings/UI_CMN_DXRating_S_11.png',
};
// Resolve legacy template/index addresses without keeping artwork in the repository.
export function resolveAssetUrl(value) {
  if(typeof value!=='string')return value;
  const regional = migratePinnedRegionAssetUrl(value);
  if (regional !== value) return regional;
  const path=value.split(/[?#]/)[0],suffix=value.slice(path.length);
  if(path.startsWith('assets/')) {
    const relative=path.slice(7);
    return (legacy[relative]||root+relative)+suffix;
  }
  if(path.startsWith('materials/'))return COS.baseUrl+'/'+path+suffix;
  if(path.startsWith('docs/screenshots/'))return root+'previews/recommended.png'+suffix;
  return value;
}

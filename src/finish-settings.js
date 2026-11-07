// Shared studio settings for live previews, product images and exports.
// Coverage remains source-derived; stronger responses do not coat unselected art.
export const FINISH_PARAMETERS=Object.freeze({
  powderDensity:0.61,powderSize:2.5,powderStrength:2.8,powderSlope:1.8,
  powderSharpness:0.85,powderContrast:0.9,
  glitterDensity:0.25,glitterSize:1.2,glitterStrength:3.0,
  pearlStrength:1.45,titlePearlStrength:1.45,avatarPearlStrength:1.45,
  rankPearlStrength:1.45,battlePearlStrength:1.45,pearlSpread:1.35,
  uvStrength:3,uvSharpness:1,laserStrength:0.6,randomness:1,seed:142,
});
export const MASK_PARAMETERS=Object.freeze({
  whiteThreshold:215,whiteTolerance:22,maxStroke:8,boundaryContrast:48,
  alphaThreshold:96,plateFraction:0.24,componentFraction:0.14,insetBrightness:165,
  contrastThreshold:14,edgeRadius:2,minComponent:3,componentContrast:12,
  contourFraction:0.28,contourContrast:16,textProtection:1,
});
// Light the printed front face by default; -45 placed both sources behind it.
export const DEFAULT_LIGHT_ANGLE=15;
export const uniforms=Object.fromEntries(Object.entries(FINISH_PARAMETERS).map(([key,value])=>['lab_'+key,{value}]));
uniforms.lab_enabled={value:1};

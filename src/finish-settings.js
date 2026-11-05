// Approved local studio settings. Runtime masks are generated from each source asset.
export const FINISH_PARAMETERS=Object.freeze({
  powderDensity:0.61,powderSize:2.5,powderStrength:1.6,powderSlope:1.5,
  powderSharpness:1.4,powderContrast:0.61,
  glitterDensity:0.14,glitterSize:1,glitterStrength:2,
  pearlStrength:1.1,titlePearlStrength:1.1,avatarPearlStrength:1.1,
  rankPearlStrength:1.1,battlePearlStrength:1.1,pearlSpread:1.2,
  uvStrength:2.5,uvSharpness:1,laserStrength:0.6,randomness:1,seed:142,
});
export const MASK_PARAMETERS=Object.freeze({
  whiteThreshold:215,whiteTolerance:22,maxStroke:8,boundaryContrast:48,
  alphaThreshold:96,plateFraction:0.24,componentFraction:0.14,insetBrightness:165,
  contrastThreshold:14,edgeRadius:2,minComponent:3,componentContrast:12,
  contourFraction:0.28,contourContrast:16,textProtection:1,
});
export const DEFAULT_LIGHT_ANGLE=-45;
export const uniforms=Object.fromEntries(Object.entries(FINISH_PARAMETERS).map(([key,value])=>['lab_'+key,{value}]));
uniforms.lab_enabled={value:1};

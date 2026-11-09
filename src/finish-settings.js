// Shared studio settings for live previews, product images and exports.
// Coverage remains source-derived; stronger responses do not coat unselected art.
export const FINISH_PARAMETERS=Object.freeze({
  "powderDensity": 0.8,
  "powderSize": 2.5,
  "powderStrength": 0.66,
  "powderSlope": 1.5,
  "powderSharpness": 1,
  "powderContrast": 0.69,
  "glitterDensity": 0.05,
  "glitterSize": 1,
  "glitterStrength": 1.66,
  "pearlStrength": 1.1,
  "titlePearlStrength": 1.1,
  "avatarPearlStrength": 1.1,
  "rankPearlStrength": 1.1,
  "battlePearlStrength": 1.1,
  "pearlSpread": 1.2,
  "uvStrength": 0,
  "uvSharpness": 1,
  "laserStrength": 0.6,
  "randomness": 1,
  "seed": 142
});
export const MASK_PARAMETERS=Object.freeze({
  "whiteThreshold": 200,
  "whiteTolerance": 50,
  "maxStroke": 2,
  "boundaryContrast": 160,
  "alphaThreshold": 90,
  "plateFraction": 0.51,
  "componentFraction": 0.14,
  "insetBrightness": 120,
  "contrastThreshold": 14,
  "edgeRadius": 2,
  "minComponent": 3,
  "componentContrast": 12,
  "contourFraction": 0.28,
  "contourContrast": 16,
  "textProtection": 1
});
// Keep the printed front face lit when opening a product preview.
export const DEFAULT_LIGHT_ANGLE=15;
export const uniforms=Object.fromEntries(Object.entries(FINISH_PARAMETERS).map(([key,value])=>['lab_'+key,{value}]));
uniforms.lab_enabled={value:1};

// A preview-scale entry-light envelope, not measured coating photometry.
// Refraction jumps to a steep internal direction at the external horizon.
// Fade that source's bounded glint using its EXTERNAL incidence so a whole
// population of flakes cannot switch on/off together at the refraction branch.
export const GLITTER_ENTRY_FADE=0.35;
export function glitterEntry(incidence) {
  const t=Math.max(0,Math.min(1,incidence/GLITTER_ENTRY_FADE));
  return t*t*(3-2*t);
}
export function glitterLighting(windowResponse,sunResponse,windowEntry=1,sunEntry=1) {
  const windowGlint=(1-Math.exp(-windowResponse*0.78*5))*windowEntry;
  const sunGlint=(1-Math.exp(-sunResponse*0.22*5))*sunEntry;
  return windowGlint+sunGlint-windowGlint*sunGlint;
}
export const GLITTER_LIGHTING_GLSL=`
  vec2 glitterEntry(vec2 incidence) {
    return smoothstep(vec2(0.0),vec2(${GLITTER_ENTRY_FADE}),incidence);
  }
  float glitterLighting(float windowResponse,float sunResponse,vec2 entry) {
    // Compress each light before entry attenuation. Attenuating the unbounded
    // reflection before exponential gain made a tiny incidence still look bright.
    vec2 glint=(1.0-exp(-vec2(windowResponse,sunResponse)*vec2(0.78,0.22)*5.0))*entry;
    // At full entry this is exactly 1-exp(-(window*.78+sun*.22)*5),
    // retaining the previous visible flakes without whitening overlapping lights.
    return glint.x+glint.y-glint.x*glint.y;
  }
`;

// A preview-scale microfacet model, not a calibration of a physical coating.
// Grain position and orientation are fixed to the print. Only the subset that
// reflects a light toward the eye changes as the view or the lights move.
export const FACET_LOBES=Object.freeze({broad:12,core:72});
const normalize=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
export function facetNormal(azimuthSeed,tiltSeed,spread=1.4) {
  const angle=azimuthSeed*Math.PI*2,tilt=Math.sqrt(tiltSeed)*spread;
  return normalize([Math.cos(angle)*tilt,Math.sin(angle)*tilt,1]);
}
export function facetResponse(normal,view,light,sharpness=1) {
  if(view[2]<=0||light[2]<=0)return 0;
  const half=normalize(view.map((x,i)=>x+light[i]));
  const alignment=Math.max(0,normal.reduce((s,x,i)=>s+x*half[i],0));
  const broad=Math.pow(alignment,FACET_LOBES.broad*sharpness);
  const core=Math.pow(alignment,FACET_LOBES.core*sharpness);
  return (0.22*broad+1.4*core)*Math.sqrt(light[2])*Math.min(1,view[2]/0.16);
}
export const GRANULAR_REFLECTION_GLSL=`
  vec3 grainFacet(float azimuthSeed,float tiltSeed,float spread) {
    float angle=azimuthSeed*6.28318530718;
    float tilt=sqrt(tiltSeed)*spread;
    return normalize(vec3(cos(angle)*tilt,sin(angle)*tilt,1.0));
  }
  float grainReflection(vec3 facet,vec3 view,vec3 light,float sharpness) {
    if(view.z<=0.0||light.z<=0.0)return 0.0;
    float alignment=max(dot(facet,normalize(view+light)),0.0);
    float broad=pow(alignment,${FACET_LOBES.broad}.0*sharpness);
    float core=pow(alignment,${FACET_LOBES.core}.0*sharpness);
    // No whole-board half-vector gate: differently tilted grains can catch the
    // light over a wide angle, even when the flat print is off-specular.
    return (0.22*broad+1.4*core)*sqrt(light.z)*min(1.0,view.z/0.16);
  }
`;

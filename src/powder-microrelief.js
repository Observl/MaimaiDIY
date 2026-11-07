// All three fields are fixed in print space. Coarser fields represent unresolved
// powder clusters for small previews; they are not a measured physical grain size.
export const POWDER_LEVELS=Object.freeze([980,360,132]);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function powderLevelWeights(footprint) {
  const fine=1-smooth(0.7,1.6,footprint);
  const middle=(1-fine)*(1-smooth(0.7,1.6,footprint*POWDER_LEVELS[1]/POWDER_LEVELS[0]));
  return [fine,middle,1-fine-middle];
}

// Analytic cap profile and its derivatives. A grain has a lit side and a shaded
// side instead of one random normal (which only produced flat colored sparkle).
export function powderCap(x,y,radius=0.48,height=0.26) {
  const q=(x*x+y*y)/(radius*radius);
  if(q>=1)return {height:0,dx:0,dy:0};
  const shoulder=1-q;
  return {height:height*shoulder*shoulder,dx:-4*height*shoulder*x/(radius*radius),dy:-4*height*shoulder*y/(radius*radius)};
}

export const POWDER_MICRORELIEF_GLSL=`
  // xy: height gradient, z: normalized height, w: coating coverage.
  vec4 powderReliefField(vec2 cells,float footprint) {
    vec2 base=floor(cells),local=fract(cells),nearestDelta=vec2(0.0),chosen=base;
    float nearest=10.0;
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++) {
      vec2 offset=vec2(float(x),float(y)),id=base+offset;
      vec2 center=mix(vec2(0.5),vec2(printHash(id+7.0),printHash(id+31.0)),lab_randomness);
      vec2 delta=local-offset-center;
      float distanceSquared=dot(delta,delta);
      if(distanceSquared<nearest){nearest=distanceSquared;nearestDelta=delta;chosen=id;}
    }
    float seed=printHash(chosen+73.0);
    float occupied=step(1.0-lab_powderDensity,seed);
    float radius=mix(0.40,0.55,printHash(chosen+19.0))*clamp(lab_powderSize/2.5,0.4,1.7);
    float q=nearest/(radius*radius);
    float shoulder=max(1.0-q,0.0);
    float height=shoulder*shoulder;
    float edge=clamp(footprint*0.32,0.025,0.5);
    float coverage=(1.0-smoothstep(1.0-edge,1.0+edge,q))*occupied;
    // Screen-space filtering attenuates only unresolved gradients, not mask area.
    float resolved=1.0/(1.0+max(footprint-0.65,0.0)*0.55);
    vec2 gradient=-4.0*0.26*shoulder*nearestDelta/(radius*radius)*occupied*resolved;
    return vec4(gradient,height*occupied,coverage);
  }

  vec4 powderMicrorelief(vec2 printPosition) {
    vec2 field=mat2(0.932,-0.362,0.362,0.932)*printPosition;
    vec2 fineCells=field*(${POWDER_LEVELS[0]}.0/11.91);
    float footprint=max(length(dFdx(fineCells)),length(dFdy(fineCells)));
    float fineWeight=1.0-smoothstep(0.7,1.6,footprint);
    float middleWeight=(1.0-fineWeight)*(1.0-smoothstep(0.7,1.6,footprint*(${POWDER_LEVELS[1]}.0/${POWDER_LEVELS[0]}.0)));
    float clusterWeight=1.0-fineWeight-middleWeight;
    vec4 fine=powderReliefField(fineCells,footprint);
    vec4 middle=powderReliefField(field*(${POWDER_LEVELS[1]}.0/11.91)+vec2(41.7,19.2),footprint*(${POWDER_LEVELS[1]}.0/${POWDER_LEVELS[0]}.0));
    vec4 cluster=powderReliefField(field*(${POWDER_LEVELS[2]}.0/11.91)+vec2(23.1,67.3),footprint*(${POWDER_LEVELS[2]}.0/${POWDER_LEVELS[0]}.0));
    return fine*fineWeight+middle*middleWeight+cluster*clusterWeight;
  }
`;

// All three fields are fixed in print space. Coarser fields represent unresolved
// powder clusters for small previews; they are not a measured physical grain size.
export const POWDER_LEVELS=Object.freeze([840,300,104]);
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

export function powderParallaxOffset(view,height) {
  const slope=[view[0]/Math.max(view[2],0.25),view[1]/Math.max(view[2],0.25)];
  const displacement=slope.map(value=>value*height);
  const length=Math.hypot(...displacement),scale=length>0.18?0.18/length:1;
  return displacement.map(value=>value*scale);
}

export const toPowderFrame=([x,y])=>[0.932*x+0.362*y,-0.362*x+0.932*y];
// Height gradients transform by the transpose, not the sampling rotation.
export const fromPowderGradient=([x,y])=>[0.932*x-0.362*y,0.362*x+0.932*y];

export function powderSelfShadow(point,light,radius=0.48,height=0.39) {
  const length=Math.hypot(light[0],light[1]);
  if(light[2]<=0||length<0.0001)return 0;
  const base=powderCap(point[0],point[1],radius,height).height;
  let occlusion=0;
  for(const fraction of [0.2,0.55]) {
    const distance=radius*fraction;
    const probe=powderCap(point[0]+light[0]/length*distance,point[1]+light[1]/length*distance,radius,height).height;
    const ray=base+distance*light[2]/length;
    occlusion=Math.max(occlusion,smooth(0.005,0.08,probe-ray));
  }
  return occlusion*0.55;
}

export const POWDER_MICRORELIEF_GLSL=`
  float powderCapHeight(vec2 point,vec2 inverseRadiiSquared) {
    float shoulder=max(1.0-dot(point*point,inverseRadiiSquared),0.0);
    return shoulder*shoulder;
  }

  vec2 powderViewOffset(vec3 view,float height) {
    vec2 offset=view.xy/max(view.z,0.25)*height;
    return offset*min(1.0,0.18/max(length(offset),0.0001));
  }

  float powderHorizonShadow(vec2 point,vec2 inverseRadiiSquared,float radius,float peakHeight,vec3 light) {
    float lateral=length(light.xy);
    if(light.z<=0.0||lateral<0.0001)return 0.0;
    vec2 direction=light.xy/lateral;
    float baseHeight=powderCapHeight(point,inverseRadiiSquared)*peakHeight;
    float occlusion=0.0;
    for(int probe=0;probe<2;probe++) {
      float distance=radius*(probe==0?0.2:0.55);
      float blocker=powderCapHeight(point+direction*distance,inverseRadiiSquared)*peakHeight;
      float rayHeight=baseHeight+distance*light.z/lateral;
      occlusion=max(occlusion,smoothstep(0.005,0.08,blocker-rayHeight));
    }
    return occlusion*0.55;
  }

  // xy: height gradient in the rotated print field, z: height, w: coverage.
  vec4 powderReliefField(vec2 cells,float footprint,vec3 view,vec3 windowLight,vec3 sunLight,out float shadow,out float sheen) {
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
    float angle=printHash(chosen+53.0)*6.28318530718;
    vec2 axis=vec2(cos(angle),sin(angle)),crossAxis=vec2(-axis.y,axis.x);
    vec2 inverseRadiiSquared=1.0/(radius*radius*vec2(1.12*1.12,0.88*0.88));
    vec2 basePoint=vec2(dot(nearestDelta,axis),dot(nearestDelta,crossAxis));
    vec3 localView=vec3(dot(view.xy,axis),dot(view.xy,crossAxis),view.z);
    float resolved=1.0/(1.0+max(footprint-0.65,0.0)*0.55);
    float peakHeight=0.26*lab_powderSlope*resolved*occupied;
    vec2 point=basePoint;
    // Two bounded ray/height iterations give shallow view parallax. No time or
    // camera-space random seed is used, and the artwork/mask coordinates stay put.
    for(int step=0;step<2;step++) {
      float height=powderCapHeight(point,inverseRadiiSquared)*peakHeight;
      point=basePoint+powderViewOffset(localView,height);
    }
    float q=dot(point*point,inverseRadiiSquared);
    float shoulder=max(1.0-q,0.0),height=shoulder*shoulder;
    float edge=clamp(footprint*0.32,0.025,0.5);
    float coverage=(1.0-smoothstep(1.0-edge,1.0+edge,q))*occupied;
    vec2 localGradient=-4.0*0.26*shoulder*point*inverseRadiiSquared*occupied*resolved;
    vec2 gradient=axis*localGradient.x+crossAxis*localGradient.y;
    vec3 localWindow=vec3(dot(windowLight.xy,axis),dot(windowLight.xy,crossAxis),windowLight.z);
    vec3 localSun=vec3(dot(sunLight.xy,axis),dot(sunLight.xy,crossAxis),sunLight.z);
    float windowWeight=max(windowLight.z,0.0)*0.75,sunWeight=max(sunLight.z,0.0)*0.25;
    shadow=(powderHorizonShadow(point,inverseRadiiSquared,radius,peakHeight,localWindow)*windowWeight
      +powderHorizonShadow(point,inverseRadiiSquared,radius,peakHeight,localSun)*sunWeight)
      /max(windowWeight+sunWeight,0.001)*coverage;
    // Each raised grain carries a stable, independently tilted reflecting face.
    // Keep the cap gradient as well, so its lit shoulder moves instead of the
    // whole grain acting like an unshaded painted dot.
    vec3 facet=grainFacet(printHash(chosen+113.0),printHash(chosen+191.0),1.35);
    facet=normalize(facet+vec3(-gradient*lab_powderSlope*0.38,0.0));
    float response=grainReflection(facet,view,windowLight,lab_powderSharpness)*0.78
      +grainReflection(facet,view,sunLight,lab_powderSharpness)*0.22;
    sheen=coverage*(0.35+height*0.65)*(1.0-exp(-response*3.6));
    return vec4(gradient,height*occupied,coverage);
  }

  vec4 powderMicrorelief(vec2 printPosition,float printFootprint,vec3 view,vec3 windowLight,vec3 sunLight,out float shadow,out float sheen) {
    mat2 rotation=mat2(0.932,-0.362,0.362,0.932);
    vec2 field=rotation*printPosition;
    view.xy=rotation*view.xy;windowLight.xy=rotation*windowLight.xy;sunLight.xy=rotation*sunLight.xy;
    vec2 fineCells=field*(${POWDER_LEVELS[0]}.0/11.91);
    float footprint=printFootprint*(${POWDER_LEVELS[0]}.0/11.91);
    float fineWeight=1.0-smoothstep(0.7,1.6,footprint);
    float middleWeight=(1.0-fineWeight)*(1.0-smoothstep(0.7,1.6,footprint*(${POWDER_LEVELS[1]}.0/${POWDER_LEVELS[0]}.0)));
    float clusterWeight=1.0-fineWeight-middleWeight;
    float fineShadow,middleShadow,clusterShadow,fineSheen,middleSheen,clusterSheen;
    vec4 fine=powderReliefField(fineCells,footprint,view,windowLight,sunLight,fineShadow,fineSheen);
    vec4 middle=powderReliefField(field*(${POWDER_LEVELS[1]}.0/11.91)+vec2(41.7,19.2),footprint*(${POWDER_LEVELS[1]}.0/${POWDER_LEVELS[0]}.0),view,windowLight,sunLight,middleShadow,middleSheen);
    vec4 cluster=powderReliefField(field*(${POWDER_LEVELS[2]}.0/11.91)+vec2(23.1,67.3),footprint*(${POWDER_LEVELS[2]}.0/${POWDER_LEVELS[0]}.0),view,windowLight,sunLight,clusterShadow,clusterSheen);
    vec4 surface=fine*fineWeight+middle*middleWeight+cluster*clusterWeight;
    // Chain rule: move the field-space gradient back to the print tangent frame.
    surface.xy=mat2(0.932,0.362,-0.362,0.932)*surface.xy;
    shadow=fineShadow*fineWeight+middleShadow*middleWeight+clusterShadow*clusterWeight;
    sheen=fineSheen*fineWeight+middleSheen*middleWeight+clusterSheen*clusterWeight;
    return surface;
  }
`;

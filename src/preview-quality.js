// GPU benchmark tiers choose cost, never change artwork or finish coverage.
export function previewQuality(result={},snapshot=false) {
  if(snapshot)return {name:'snapshot',pixelRatio:1,shadowSize:512,samples:2,anisotropy:4};
  const tier=['BLOCKLISTED','WEBGL_UNSUPPORTED'].includes(result.type)?0:result.type==='BENCHMARK'?result.tier:result.isMobile?1:2;
  if(tier<=1)return {name:'balanced',pixelRatio:1,shadowSize:1024,samples:2,anisotropy:4};
  if(tier===2)return {name:'high',pixelRatio:1.5,shadowSize:1024,samples:3,anisotropy:8};
  return {name:'ultra',pixelRatio:2,shadowSize:2048,samples:4,anisotropy:16};
}

import { createAcrylicPreview } from './acrylic-preview.js';

export function createConfigurationImages(source,finishMaps) {
  const host=document.createElement('div');
  host.setAttribute('aria-hidden','true');
  Object.assign(host.style,{position:'fixed',left:'-10000px',top:'0',width:'560px',height:'340px',pointerEvents:'none',visibility:'hidden'});
  document.body.append(host);
  const viewer=createAcrylicPreview(host,{snapshot:true});viewer.setDesign(source,finishMaps);
  const cache=new Map();
  return {
    render(config) {
      const key=JSON.stringify([config.variant,config.quantity>0,config.cardQuantity>0,config.shikishiQuantity>0,config.accessory]);
      if(!cache.has(key))cache.set(key,viewer.captureConfiguration(config));
      return cache.get(key);
    },
    dispose(){viewer.dispose();host.remove();cache.clear();},
  };
}

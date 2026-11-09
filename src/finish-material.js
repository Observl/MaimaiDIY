import { uniforms } from './finish-settings.js';
import * as THREE from '../vendor/three.module.js';
import { CustomShaderMaterial } from '../vendor/render-extensions.js';

// Local varnish changes the physical roughness before lighting is evaluated.
export function createFinishMaterial(parameters,mask,{paper=false}={}) {
  return new CustomShaderMaterial({
    baseMaterial:THREE.MeshPhysicalMaterial,
    ...parameters,
    uniforms:{finishUvStrength:uniforms.lab_uvStrength,finishEnabled:uniforms.lab_enabled,finishSurfaceMask:{value:mask},finishBaseRoughness:{value:parameters.roughness},finishVarnishRoughness:{value:paper?0.22:0.16}},
    vertexShader:`varying vec2 vFinishSurfaceUV;
      void main(){vFinishSurfaceUV=uv;}`,
    fragmentShader:`varying vec2 vFinishSurfaceUV;
      uniform sampler2D finishSurfaceMask;
      uniform float finishUvStrength; uniform float finishEnabled; uniform float finishBaseRoughness;
      uniform float finishVarnishRoughness;
      void main(){
        vec3 coating=texture2D(finishSurfaceMask,vFinishSurfaceUV).rgb;
        float coverage=clamp(coating.r*(1.0-coating.b)*finishEnabled*step(0.005,finishUvStrength),0.0,1.0);
        csm_Roughness=mix(finishBaseRoughness,finishVarnishRoughness,coverage);
      }`,
  });
}

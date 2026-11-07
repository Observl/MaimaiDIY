import { uniforms as labUniforms } from './finish-settings.js';
import { POWDER_MICRORELIEF_GLSL } from './powder-microrelief.js';
import { GRANULAR_REFLECTION_GLSL } from './granular-reflection.js';
import * as THREE from '../vendor/three.module.js';

// Ray/print-plane intersection preserves the source resolution rather than
// resampling the design through Three's screen-space transmission buffer.
export function applyPrintOptics(material, mesh, { design, mask, components, badges, depth, variant, keyPosition, windowPosition, card=false, paper=false }) {
  const inverse = new THREE.Matrix4();
  const eye=new THREE.Vector3();
  const liveUniforms={printPixelRatio:{value:1},printEye:{value:eye},printSun:{value:keyPosition.clone()},printWindow:{value:windowPosition.clone()}};
  const previousRender=mesh.onBeforeRender;
  mesh.onBeforeRender = (renderer,scene,camera,...args) => {
    previousRender.call(mesh,renderer,scene,camera,...args);
    inverse.copy(mesh.matrixWorld).invert();
    liveUniforms.printPixelRatio.value=renderer.getPixelRatio();
    camera.getWorldPosition(eye);
    liveUniforms.printSun.value.copy(keyPosition);
    liveUniforms.printWindow.value.copy(windowPosition);
  };
  const previousCompile=material.onBeforeCompile.bind(material);
  const previousCacheKey=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader,renderer) => {
    Object.assign(shader.uniforms,labUniforms);
    Object.assign(shader.uniforms,liveUniforms);
    Object.assign(shader.uniforms, {
      printArtwork: { value: design }, printMask: { value: mask },
      printCard: { value: card ? 1 : 0 },
      printPaper: { value: paper ? 1 : 0 },
      printComponents: { value:components },
      printBadgePearl: { value:badges },
      printInverse: { value: inverse }, printDepth: { value: depth },
      printWorld: { value:mesh.matrixWorld },
      printFinish: { value: variant === 'basic' ? 0 : 2 },
    });
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      varying vec3 vPrintWorldPosition;
      varying vec3 vPrintLocalPosition;
    `).replace('#include <begin_vertex>',`#include <begin_vertex>
      vPrintLocalPosition=position;
      vPrintWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec3 vPrintWorldPosition;
      varying vec3 vPrintLocalPosition;
      uniform float lab_enabled;
      uniform float lab_powderDensity;
      uniform float lab_powderSize;
      uniform float lab_powderStrength;
      uniform float lab_powderSlope;
      uniform float lab_powderSharpness;
      uniform float lab_powderContrast;
      uniform float lab_glitterDensity;
      uniform float lab_glitterSize;
      uniform float lab_glitterStrength;
      uniform float lab_pearlStrength;
      uniform float lab_titlePearlStrength;
      uniform float lab_avatarPearlStrength;
      uniform float lab_rankPearlStrength;
      uniform float lab_battlePearlStrength;
      uniform float lab_pearlSpread;
      uniform float lab_uvStrength;
      uniform float lab_uvSharpness;
      uniform float lab_laserStrength;
      uniform float lab_randomness;
      uniform float lab_seed;
      uniform sampler2D printArtwork;
      uniform sampler2D printMask;
      uniform float printCard;
      uniform float printPaper;
      uniform sampler2D printComponents;
      uniform sampler2D printBadgePearl;
      uniform mat4 printInverse;
      uniform mat4 printWorld;
      uniform float printDepth;
      uniform float printFinish;
      uniform float printPixelRatio;
      uniform vec3 printSun;
      uniform vec3 printWindow;
      uniform vec3 printEye;
      float printHash(vec2 p) {
        vec3 h=fract(vec3((p+lab_seed*17.13).xyx)*0.1031);
        h+=dot(h,h.yzx+33.33);
        return fract((h.x+h.y)*h.z);
      }
      ${GRANULAR_REFLECTION_GLSL}
      ${POWDER_MICRORELIEF_GLSL}
      // Nearest fully-jittered particle: distance, brightness seed, and two facet seeds.
      vec4 printParticle(vec2 p) {
        vec2 base=floor(p),local=fract(p),chosen=base;
        float nearest=10.0;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++) {
          vec2 offset=vec2(float(x),float(y)),id=base+offset;
          vec2 center=mix(vec2(0.5),vec2(printHash(id+7.0),printHash(id+31.0)),lab_randomness);
          vec2 delta=offset+center-local;
          float distanceSquared=dot(delta,delta);
          if(distanceSquared<nearest){nearest=distanceSquared;chosen=id;}
        }
        return vec4(sqrt(nearest),printHash(chosen+73.0),printHash(chosen+19.0),printHash(chosen+53.0));
      }
    `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      // Printed pigment has microrelief; the clear acrylic surface stays optically smooth.
      #ifndef USE_TRANSMISSION
      vec2 pigmentUV=vPrintLocalPosition.xy/vec2(11.91,4.91)+0.5;
      vec2 pigmentTexel=1.0/vec2(textureSize(printArtwork,0));
      vec3 lum=vec3(0.2126,0.7152,0.0722);
      float pigmentX=dot(texture2D(printArtwork,pigmentUV+vec2(pigmentTexel.x,0.0)).rgb-texture2D(printArtwork,pigmentUV-vec2(pigmentTexel.x,0.0)).rgb,lum);
      float pigmentY=dot(texture2D(printArtwork,pigmentUV+vec2(0.0,pigmentTexel.y)).rgb-texture2D(printArtwork,pigmentUV-vec2(0.0,pigmentTexel.y)).rgb,lum);
      float grain=printHash(floor(pigmentUV*vec2(1800.0,750.0)))-0.5;
      normal=normalize(normal+vec3(pigmentX,pigmentY,0.0)*(printCard>0.5?0.3:0.12)+vec3(grain,-grain,0.0)*0.035);
      #endif
    `).replace('#include <transmission_fragment>', `
      #include <transmission_fragment>
        vec3 pPos=vPrintWorldPosition;
        vec3 pV=normalize(printEye-pPos);
        vec3 pN=inverseTransformDirection(normal,viewMatrix);
        vec3 localPosition = vPrintLocalPosition;
        #ifdef USE_TRANSMISSION
        vec3 internalRay=refract(-pV,pN,1.0/material.ior);
        vec3 localRay = mat3(printInverse) * internalRay;
        float safeRayZ = (localRay.z<0.0?-1.0:1.0)*max(abs(localRay.z),0.00001);
        float rayDistance = (-printDepth * 0.5 + 0.004 - localPosition.z) / safeRayZ;
        vec3 printHit = localPosition + localRay * rayDistance;
        vec2 printUV = printHit.xy / vec2(11.91, 4.91) + 0.5;
        #else
        float rayDistance=0.0;
        vec2 printUV=localPosition.xy/vec2(11.91,4.91)+0.5;
        #endif
        float insidePrint = step(0.001, printUV.x) * step(printUV.x, 0.999)
          * step(0.001, printUV.y) * step(printUV.y, 0.999)
          * step(0.0, rayDistance);
        #ifdef USE_TRANSMISSION
        // Rear-facing rays see the opaque beige backing, never a mirrored design.
        insidePrint*=step(localRay.z,-0.00001);
        #endif
        vec3 artwork = texture2D(printArtwork, printUV).rgb;
        vec3 finishPosition=pPos,finishNormal=pN,finishView=pV;
        #ifdef USE_TRANSMISSION
        // Powder and white-outline varnish share the single innermost artwork plane.
        finishPosition=(printWorld*vec4(printHit,1.0)).xyz;
        finishNormal=normalize(mat3(printWorld)*vec3(0.0,0.0,1.0));
        finishView=normalize(-internalRay);
        #endif
        vec4 componentRegions=texture2D(printComponents,printUV);
        float componentPrint=componentRegions.a;
        vec3 finish = texture2D(printMask, printUV).rgb;
        float inkPeak=max(max(artwork.r,artwork.g),artwork.b);
        vec3 imageTint=max(artwork/max(inkPeak,0.12)*(0.45+0.4*inkPeak),vec3(0.09));
        // Bound the colored response: large HDR values tone-map saturated inks to white.
        #ifdef USE_TRANSMISSION
        // Clear surface reflections are neutral; colored finish reflections belong to the rear ink plane.
        totalSpecular=min(totalSpecular,vec3(0.22));
        #else
        totalSpecular=mix(totalSpecular,min(totalSpecular,vec3(0.12))*imageTint*(1.0-componentPrint),insidePrint)*(1.0-finish.b*insidePrint);
        #endif
        #ifdef USE_TRANSMISSION
        float f0=pow((material.ior-1.0)/(material.ior+1.0),2.0);
        float fresnel = f0 + (1.0-f0) * pow(1.0 - max(dot(pN, pV), 0.0), 5.0);
        vec3 transmissionTint = pow(max(material.attenuationColor,vec3(0.0001)),vec3(max(rayDistance,0.0)/max(material.attenuationDistance,0.0001)));
        totalDiffuse = mix(totalDiffuse, artwork * transmissionTint * (1.0 - fresnel), insidePrint);
        #else
          float pigmentLight=0.72+0.28*max(dot(pN,normalize(printWindow-pPos)),0.0);
          totalDiffuse=mix(totalDiffuse,artwork*pigmentLight,insidePrint);
        #endif
        vec3 windowLight = normalize(printWindow - finishPosition);
        vec3 sunLight = normalize(printSun - finishPosition);
        #ifdef USE_TRANSMISSION
        if(dot(finishNormal,windowLight)>0.0)windowLight=-refract(-windowLight,finishNormal,1.0/material.ior);
        if(dot(finishNormal,sunLight)>0.0)sunLight=-refract(-sunLight,finishNormal,1.0/material.ior);
        #endif
        vec3 halfWindow = normalize(finishView + windowLight);
        vec3 halfSun = normalize(finishView + sunLight);
        vec3 finishTangent=normalize(mat3(printWorld)*vec3(1.0,0.0,0.0));
        vec3 finishBitangent=normalize(mat3(printWorld)*vec3(0.0,1.0,0.0));
        // The pigment bump normal is not perpendicular to the mesh tangent on
        // opaque paper. Grain transport uses one orthonormal print-space frame.
        vec3 grainNormal=normalize(mat3(printWorld)*vec3(0.0,0.0,1.0));
        vec3 grainView=vec3(dot(finishView,finishTangent),dot(finishView,finishBitangent),dot(finishView,grainNormal));
        vec3 grainWindow=vec3(dot(windowLight,finishTangent),dot(windowLight,finishBitangent),dot(windowLight,grainNormal));
        vec3 grainSun=vec3(dot(sunLight,finishTangent),dot(sunLight,finishBitangent),dot(sunLight,grainNormal));
        float viewFacing=clamp(dot(finishNormal,finishView),0.0,1.0);
        // Derivatives must run before fragment-varying artwork/mask branches.
        // Use displayed pixels, not high-DPI buffer pixels that disappear when
        // the browser downsamples the canvas back to its CSS dimensions.
        vec2 printPosition=printUV*vec2(11.91,4.91);
        float printFootprint=max(length(dFdx(printPosition)),length(dFdy(printPosition)))*printPixelRatio;
        // A flake reflects some neutral incident light even over dark pigment.
        // Limit this to isolated grains so the artwork is not globally whitened.
        vec3 grainTint=mix(imageTint,vec3(1.0),0.24);
        // A broad, source-colored pigment luster on the rear background print.
        // It does not add a clearcoat or a white reflection to the acrylic surface.
        if(printCard<0.5 && printFinish>0.5 && lab_enabled>0.5 && insidePrint>0.5 && (lab_pearlStrength+lab_titlePearlStrength+lab_avatarPearlStrength+lab_rankPearlStrength+lab_battlePearlStrength)>0.001) {
          vec4 badgeRegions=texture2D(printBadgePearl,printUV);
          float pearlAmount=(lab_pearlStrength*(1.0-componentPrint)
            +lab_titlePearlStrength*componentRegions.r*componentPrint
            +lab_avatarPearlStrength*componentRegions.g*componentPrint
            +lab_rankPearlStrength*badgeRegions.r*badgeRegions.a
            +lab_battlePearlStrength*badgeRegions.g*badgeRegions.a)*(1.0-finish.b);
          float pearlWindow=pow(max(dot(finishNormal,halfWindow),0.0),8.0/lab_pearlSpread);
          float pearlSun=pow(max(dot(finishNormal,halfSun),0.0),14.0/lab_pearlSpread);
          float pearlLighting=max(dot(finishNormal,windowLight),0.0)*0.75+max(dot(finishNormal,sunLight),0.0)*0.25;
          // Pigment platelets have a directional luster, not a clipped constant sheen.
          float pearlResponse=0.22*(1.0-exp(-pearlAmount*(pearlWindow*0.8+pearlSun*0.2)*pearlLighting*1.4));
          float pearlPhase=(1.0-viewFacing)*15.0+dot(finishTangent,halfWindow)*3.0;
          vec3 pearlTint=imageTint*(0.82+0.18*cos(pearlPhase+vec3(0.0,2.1,4.2)));
          totalSpecular+=pearlTint*pearlResponse;
        }
        if(printCard<0.5 && printFinish>0.5 && lab_enabled>0.5 && insidePrint>0.5 && finish.g>0.005 && lab_powderDensity>0.001 && lab_powderStrength>0.001) {
          // Powder is a shallow granular surface: each grain has a continuous
          // height gradient, a light-facing side and directional local shadow.
          // It is not the broad uniform brightness used by the previous draft.
          float powderShadow,powderSheen;
          vec4 micro=powderMicrorelief(printPosition,printFootprint,grainView,grainWindow,grainSun,powderShadow,powderSheen);
          float powderMask=finish.g*(1.0-finish.b);
          vec3 powderNormal=normalize(grainNormal
            -finishTangent*micro.x*lab_powderSlope
            -finishBitangent*micro.y*lab_powderSlope);
          float powderLight=max(dot(powderNormal,windowLight),0.0)*step(0.001,grainWindow.z)*0.75
            +max(dot(powderNormal,sunLight),0.0)*step(0.001,grainSun.z)*0.25;
          float flatLight=max(dot(grainNormal,windowLight),0.0)*0.75
            +max(dot(grainNormal,sunLight),0.0)*0.25;
          // Shade the light-opposed side and actual local horizon, not every rim.
          // This preserves relief without turning each grain into a dark dot.
          float reliefDiffuse=clamp(1.0+(powderLight-flatLight)*2.35-powderShadow*0.28,0.34,1.55);
          totalDiffuse*=mix(1.0,reliefDiffuse,powderMask*lab_powderContrast);
          // Compress highlights per grain, never globally whiten the print.
          totalSpecular+=grainTint*(1.0-exp(-powderSheen*lab_powderStrength))*powderMask*1.25;
        }
        if(printCard>0.5) {
          // Diffractive color modulation without a white mirror/varnish highlight.
          totalSpecular=vec3(0.0);
          vec3 laserLight=normalize(printWindow-pPos);
          float grooves=sin(printUV.x*1100.0+printUV.y*180.0)*0.12;
          float phase=printUV.x*14.0+printUV.y*3.0+dot(pN,pV)*24.0+dot(pN,laserLight)*12.0+grooves;
          vec3 spectral=0.5+0.5*cos(vec3(0.0,2.1,4.2)+phase);
          float band=pow(0.5+0.5*sin(phase*0.65),2.0);
          vec3 hologram=artwork*(vec3(0.55)+spectral*0.9)+spectral*0.08;
          totalDiffuse=mix(totalDiffuse,hologram,insidePrint*clamp((0.55+band*0.35)*lab_laserStrength*lab_enabled,0.0,1.0));
        }

        if (printCard<0.5 && printFinish > 0.5 && lab_enabled>0.5 && insidePrint > 0.5) {
          float spot = finish.r*lab_uvStrength;
          if(spot>0.005 && finish.b<0.995) {
          vec2 texel = 1.0 / vec2(textureSize(printMask, 0));
          vec2 gradient = vec2(
            texture2D(printMask, printUV + vec2(texel.x, 0.0)).r - texture2D(printMask, printUV - vec2(texel.x, 0.0)).r,
            texture2D(printMask, printUV + vec2(0.0, texel.y)).r - texture2D(printMask, printUV - vec2(0.0, texel.y)).r);
          vec3 raisedNormal = normalize(finishNormal + (finishTangent*(-gradient.x)+finishBitangent*(0.14-gradient.y)) * 0.2);
          float highlight = pow(max(dot(raisedNormal, halfWindow), 0.0), (printPaper>0.5?12.0:18.0)*lab_uvSharpness)
            + pow(max(dot(raisedNormal, halfSun), 0.0), (printPaper>0.5?20.0:30.0)*lab_uvSharpness);
          // A varnish lobe over the selected artwork, never a white paint overlay.
          float uvResponse=(1.0-exp(-highlight*spot*3.0))*0.72*(1.0-finish.b);
          totalSpecular += imageTint * uvResponse;
          }

          {
            // Existing background glitter stays separate from diffuse component powder.
            float density=printFinish>1.5?1.0:0.7;
            float finishCoverage=1.0-componentPrint;
            if(finishCoverage>0.005 && lab_glitterDensity>0.001 && lab_glitterStrength>0.001) {
              vec2 fineCells=mat2(0.956,-0.292,0.292,0.956)*printPosition*(420.0/11.91);
              float footprint=printFootprint*(420.0/11.91);
              float fineWeight=1.0-smoothstep(0.7,1.6,footprint);
              float middleWeight=(1.0-fineWeight)*(1.0-smoothstep(0.7,1.6,footprint*180.0/420.0));
              float glitterResponse=0.0;
              for(int layer=0;layer<3;layer++) {
                float weight=layer==0?fineWeight:layer==1?middleWeight:1.0-fineWeight-middleWeight;
                // Coarser representative flakes retain discrete glints in a
                // narrow preview, instead of subpixel noise or a uniform sheen.
                vec2 cells=layer==0?fineCells:layer==1?
                  mat2(0.819,0.574,-0.574,0.819)*printPosition*(180.0/11.91)+vec2(23.1,67.3):
                  mat2(0.643,-0.766,0.766,0.643)*printPosition*(72.0/11.91)+vec2(71.3,11.9);
                vec4 particle=printParticle(cells);
                float radius=mix(0.23,0.41,particle.z)*lab_glitterSize;
                float cellFootprint=footprint*(layer==0?1.0:layer==1?180.0/420.0:72.0/420.0);
                float edge=clamp(cellFootprint*0.35,0.035,0.48);
                float flake=(1.0-smoothstep(radius-edge,radius+edge,particle.x))*step(1.0-lab_glitterDensity,particle.y)*density;
                vec3 facet=grainFacet(particle.z,particle.w,1.6);
                float sparkle=grainReflection(facet,grainView,grainWindow,0.85)*0.78
                  +grainReflection(facet,grainView,grainSun,0.85)*0.22;
                glitterResponse+=weight*flake*(1.0-exp(-sparkle*5.0));
              }
              totalSpecular+=grainTint*(1.0-exp(-glitterResponse*lab_glitterStrength))*1.45*(1.0-finish.b)*finishCoverage;
            }
          }
        }
    `);
    // Run helper patches last, after preserving the physical shader's include hooks.
    previousCompile(shader,renderer);
  };
  material.customProgramCacheKey = () => 'visible-grain-facets-safe-lod-v3-'+Number(card)+'-'+Number(paper)+'-'+previousCacheKey();
}

import * as THREE from '../vendor/three.module.js';

// Ray/print-plane intersection preserves the source resolution rather than
// resampling the design through Three's screen-space transmission buffer.
export function applyPrintOptics(material, mesh, { design, mask, glitterTint, depth, variant, keyPosition, windowPosition, card=false, paper=false, layers=[] }) {
  const inverse = new THREE.Matrix4();
  mesh.onBeforeRender = () => inverse.copy(mesh.matrixWorld).invert();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      printArtwork: { value: design }, printMask: { value: mask },
      printGlitterTint: { value: glitterTint },
      printCard: { value: card ? 1 : 0 },
      printPaper: { value: paper ? 1 : 0 },
      ...Object.fromEntries([0,1,2,3].map(i=>['printLayer'+i,{value:layers[i]||design}])),
      printInverse: { value: inverse }, printDepth: { value: depth },
      printFinish: { value: variant === 'premium' ? 2 : variant === 'light' ? 1 : 0 },
      printSun: { value: keyPosition },
      printWindow: { value: windowPosition },
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
      uniform sampler2D printArtwork;
      uniform sampler2D printMask;
      uniform sampler2D printGlitterTint;
      uniform float printCard;
      uniform float printPaper;
      uniform sampler2D printLayer0;
      uniform sampler2D printLayer1;
      uniform sampler2D printLayer2;
      uniform sampler2D printLayer3;
      uniform mat4 printInverse;
      uniform float printDepth;
      uniform float printFinish;
      uniform vec3 printSun;
      uniform vec3 printWindow;
      float printHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      // Pigment and foil microrelief change the lighting, rather than painting highlights into an image.
      vec2 pigmentUV=vPrintLocalPosition.xy/vec2(11.91,4.91)+0.5;
      vec2 pigmentTexel=1.0/vec2(textureSize(printArtwork,0));
      vec3 lum=vec3(0.2126,0.7152,0.0722);
      float pigmentX=dot(texture2D(printArtwork,pigmentUV+vec2(pigmentTexel.x,0.0)).rgb-texture2D(printArtwork,pigmentUV-vec2(pigmentTexel.x,0.0)).rgb,lum);
      float pigmentY=dot(texture2D(printArtwork,pigmentUV+vec2(0.0,pigmentTexel.y)).rgb-texture2D(printArtwork,pigmentUV-vec2(0.0,pigmentTexel.y)).rgb,lum);
      float grain=printHash(floor(pigmentUV*vec2(1800.0,750.0)))-0.5;
      normal=normalize(normal+vec3(pigmentX,pigmentY,0.0)*(printCard>0.5?0.3:0.12)+vec3(grain,-grain,0.0)*0.035);
    `).replace('#include <transmission_fragment>', `
      #include <transmission_fragment>
        vec3 pPos=vPrintWorldPosition;
        vec3 pV=normalize(cameraPosition-pPos);
        vec3 pN=inverseTransformDirection(normal,viewMatrix);
        vec3 localPosition = vPrintLocalPosition;
        #ifdef USE_TRANSMISSION
        vec3 localRay = mat3(printInverse) * refract(-pV, pN, 1.0 / material.ior);
        float safeRayZ = abs(localRay.z) < 0.00001 ? -0.00001 : localRay.z;
        float rayDistance = (-printDepth * 0.5 + 0.004 - localPosition.z) / safeRayZ;
        vec3 printHit = localPosition + localRay * rayDistance;
        vec2 printUV = printHit.xy / vec2(11.91, 4.91) + 0.5;
        #else
        float rayDistance=0.0;
        vec2 printUV=localPosition.xy/vec2(11.91,4.91)+0.5;
        #endif
        vec3 localNormal = normalize(mat3(printInverse) * pN);
        float insidePrint = step(0.001, printUV.x) * step(printUV.x, 0.999)
          * step(0.001, printUV.y) * step(printUV.y, 0.999)
          * step(0.0, rayDistance) * (printCard>0.5 ? 1.0 : smoothstep(0.3, 0.9, localNormal.z));
        vec3 artwork = texture2D(printArtwork, printUV).rgb;
        float componentPrint=0.0;
        #ifdef USE_TRANSMISSION
        if(printFinish>0.5) {
          // Four physical print depths: background, identity, badges, friend battle.
          vec2 uv0=(localPosition+localRay*((-printDepth*0.43-localPosition.z)/safeRayZ)).xy/vec2(11.91,4.91)+0.5;
          vec2 uv1=(localPosition+localRay*((-printDepth*0.15-localPosition.z)/safeRayZ)).xy/vec2(11.91,4.91)+0.5;
          vec2 uv2=(localPosition+localRay*((printDepth*0.15-localPosition.z)/safeRayZ)).xy/vec2(11.91,4.91)+0.5;
          vec2 uv3=(localPosition+localRay*((printDepth*0.36-localPosition.z)/safeRayZ)).xy/vec2(11.91,4.91)+0.5;
          vec4 l0=texture2D(printLayer0,uv0),l1=texture2D(printLayer1,uv1),l2=texture2D(printLayer2,uv2),l3=texture2D(printLayer3,uv3);
          artwork=mix(vec3(1.0),l0.rgb,l0.a);
          artwork=mix(artwork,l1.rgb,l1.a);artwork=mix(artwork,l2.rgb,l2.a);artwork=mix(artwork,l3.rgb,l3.a);
          componentPrint=max(l1.a,max(l2.a,l3.a));
          // Finish maps belong to their own print plane, so they follow the same parallax.
          printUV=l3.a>0.5?uv3:l2.a>0.5?uv2:l1.a>0.5?uv1:uv0;
        }
        #endif
        vec3 finish = texture2D(printMask, printUV).rgb;
        vec3 imageTint=artwork;
        // Bound the colored response: large HDR values tone-map saturated inks to white.
        totalSpecular=mix(totalSpecular,min(totalSpecular,vec3(0.12))*imageTint,insidePrint)*(1.0-finish.b*insidePrint);
        #ifdef USE_TRANSMISSION
        float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(pN, pV), 0.0), 5.0);
        vec3 transmissionTint = volumeAttenuation(max(rayDistance, 0.0), material.attenuationColor, material.attenuationDistance);
        totalDiffuse = mix(totalDiffuse, artwork * transmissionTint * (1.0 - fresnel), insidePrint);
        #else
          float pigmentLight=0.72+0.28*max(dot(pN,normalize(printWindow-pPos)),0.0);
          totalDiffuse=mix(totalDiffuse,artwork*pigmentLight,insidePrint);
        #endif
        if(printCard>0.5) {
          // Diffractive color modulation without a white mirror/varnish highlight.
          totalSpecular=vec3(0.0);
          vec3 laserLight=normalize(printWindow-pPos);
          float grooves=sin(printUV.x*1100.0+printUV.y*180.0)*0.12;
          float phase=printUV.x*14.0+printUV.y*3.0+dot(pN,pV)*24.0+dot(pN,laserLight)*12.0+grooves;
          vec3 spectral=0.5+0.5*cos(vec3(0.0,2.1,4.2)+phase);
          float band=pow(0.5+0.5*sin(phase*0.65),2.0);
          totalDiffuse=mix(totalDiffuse,artwork*mix(vec3(0.92),vec3(0.65)+spectral*0.5,0.35+band*0.4),insidePrint);
        }

        if (printCard<0.5 && printFinish > 0.5 && insidePrint > 0.5) {
          float spot = finish.r;
          vec2 texel = 1.0 / vec2(textureSize(printMask, 0));
          vec2 gradient = vec2(
            texture2D(printMask, printUV + vec2(texel.x, 0.0)).r - texture2D(printMask, printUV - vec2(texel.x, 0.0)).r,
            texture2D(printMask, printUV + vec2(0.0, texel.y)).r - texture2D(printMask, printUV - vec2(0.0, texel.y)).r);
          vec3 raisedNormal = normalize(pN + vec3(-gradient.x, 0.14-gradient.y, 0.0) * 0.2);
          vec3 windowLight = normalize(printWindow - pPos);
          vec3 sunLight = normalize(printSun - pPos);
          vec3 halfWindow = normalize(pV + windowLight);
          vec3 halfSun = normalize(pV + sunLight);
          float highlight = pow(max(dot(raisedNormal, halfWindow), 0.0), 105.0)
            + pow(max(dot(raisedNormal, halfSun), 0.0), 140.0);
          // A varnish lobe over the selected artwork, never a white paint overlay.
          float uvResponse=min(highlight*spot*0.65,0.3)*(1.0-finish.b);
          totalSpecular += imageTint * uvResponse;

          {
            vec2 cells = printUV * vec2(560.0, 234.0);
            vec2 cell = floor(cells);
            float seed = printHash(cell);
            vec2 center = vec2(printHash(cell + 7.0), printHash(cell + 31.0)) * 0.6 + 0.2;
            float distanceToFlake = length(fract(cells) - center);
            float footprint = max(length(fwidth(cells)), 0.04);
            // Global glitter on effect products; authored masks only boost special collectibles.
            float density=printFinish>1.5?1.0:0.7;
            float flake = (1.0 - smoothstep(0.29, 0.29 + min(footprint,0.3), distanceToFlake)) * step(0.08, seed) * density * (1.0-finish.b);
            vec3 flakeNormal = normalize(pN + vec3(
              (printHash(cell + 19.0) - 0.5) * 0.65,
              (printHash(cell + 53.0) - 0.5) * 0.65, 0.0));
            float sparkle = pow(max(dot(flakeNormal, halfWindow), 0.0), 125.0)
              + pow(max(dot(flakeNormal, halfSun), 0.0), 170.0);
            float angularGate=0.16+pow(max(dot(pN,halfWindow),0.0),24.0)+pow(max(dot(pN,halfSun),0.0),36.0);
            float componentBoost=1.0+componentPrint*0.6;
            float glitterResponse=min((sparkle*angularGate*0.9+0.005)*flake*(1.0+finish.g*1.3)*componentBoost,0.22);
            totalSpecular += imageTint * glitterResponse;
          }
        }
    `);
  };
  material.customProgramCacheKey = () => 'pigment-layered-global-glitter-v7-'+Number(card)+'-'+Number(paper);
}

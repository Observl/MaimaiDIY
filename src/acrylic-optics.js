import * as THREE from '../vendor/three.module.js';

// Ray/print-plane intersection preserves the source resolution rather than
// resampling the design through Three's screen-space transmission buffer.
export function applyPrintOptics(material, mesh, { design, mask, glitterTint, depth, variant, keyPosition, windowPosition, card=false }) {
  const inverse = new THREE.Matrix4();
  mesh.onBeforeRender = () => inverse.copy(mesh.matrixWorld).invert();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      printArtwork: { value: design }, printMask: { value: mask },
      printGlitterTint: { value: glitterTint },
      printCard: { value: card ? 1 : 0 },
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
      uniform mat4 printInverse;
      uniform float printDepth;
      uniform float printFinish;
      uniform vec3 printSun;
      uniform vec3 printWindow;
      float printHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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
        #ifdef USE_TRANSMISSION
        float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(pN, pV), 0.0), 5.0);
        vec3 transmissionTint = volumeAttenuation(max(rayDistance, 0.0), material.attenuationColor, material.attenuationDistance);
        totalDiffuse = mix(totalDiffuse, artwork * transmissionTint * (1.0 - fresnel), insidePrint);
        #else
        totalDiffuse=mix(totalDiffuse,artwork*0.9,insidePrint);
        #endif

        if (printFinish > 0.5 && insidePrint > 0.5) {
          vec3 finish = texture2D(printMask, printUV).rgb;
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
          vec3 foilTint=texture2D(printGlitterTint, printUV).rgb;
          totalSpecular += mix(vec3(1.0),foilTint,0.2) * highlight * spot * 4.5;
          if(printCard>0.5) {
            float laserPeak=pow(max(dot(pN,halfWindow),0.0),85.0)+pow(max(dot(pN,halfSun),0.0),120.0);
            vec3 laserColor=0.5+0.5*cos(vec3(0.0,2.1,4.2)+printUV.x*11.0+dot(pN,pV)*22.0);
            totalSpecular+=laserColor*laserPeak*0.9;
          }

          if (printFinish > 1.5) {
            vec2 cells = printUV * vec2(720.0, 300.0);
            vec2 cell = floor(cells);
            float seed = printHash(cell);
            vec2 center = vec2(printHash(cell + 7.0), printHash(cell + 31.0)) * 0.6 + 0.2;
            float distanceToFlake = length(fract(cells) - center);
            float footprint = max(length(fwidth(cells)), 0.04);
            float flake = (1.0 - smoothstep(0.34, 0.34 + min(footprint,0.4), distanceToFlake)) * step(0.01, seed) * finish.g;
            vec3 flakeNormal = normalize(pN + vec3(
              (printHash(cell + 19.0) - 0.5) * 0.65,
              (printHash(cell + 53.0) - 0.5) * 0.65, 0.0));
            float sparkle = pow(max(dot(flakeNormal, halfWindow), 0.0), 125.0)
              + pow(max(dot(flakeNormal, halfSun), 0.0), 170.0);
            float angularGate=pow(max(dot(pN,halfWindow),0.0),55.0)+pow(max(dot(pN,halfSun),0.0),70.0);
            float strongest=max(max(artwork.r,artwork.g),max(artwork.b,0.04));
            vec3 imageTint=mix(artwork,artwork/strongest,0.7);
            totalSpecular += imageTint * sparkle * angularGate * flake * 55.0;
          }
        }
    `);
  };
  material.customProgramCacheKey = () => 'collectible-angle-color-v5-'+Number(card);
}

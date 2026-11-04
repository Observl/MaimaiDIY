import * as THREE from '../vendor/three.module.js';

// Ray/print-plane intersection preserves the source resolution rather than
// resampling the design through Three's screen-space transmission buffer.
export function applyPrintOptics(material, mesh, { design, mask, glitterTint, depth, variant, keyPosition, windowPosition }) {
  const inverse = new THREE.Matrix4();
  mesh.onBeforeRender = () => inverse.copy(mesh.matrixWorld).invert();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      printArtwork: { value: design }, printMask: { value: mask },
      printGlitterTint: { value: glitterTint },
      printInverse: { value: inverse }, printDepth: { value: depth },
      printFinish: { value: variant === 'premium' ? 2 : variant === 'light' ? 1 : 0 },
      printSun: { value: keyPosition },
      printWindow: { value: windowPosition },
    });
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      uniform sampler2D printArtwork;
      uniform sampler2D printMask;
      uniform sampler2D printGlitterTint;
      uniform mat4 printInverse;
      uniform float printDepth;
      uniform float printFinish;
      uniform vec3 printSun;
      uniform vec3 printWindow;
      float printHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    `).replace('#include <transmission_fragment>', `
      #include <transmission_fragment>
      #ifdef USE_TRANSMISSION
        vec3 localPosition = (printInverse * vec4(pos, 1.0)).xyz;
        vec3 localRay = mat3(printInverse) * refract(-v, n, 1.0 / material.ior);
        float safeRayZ = abs(localRay.z) < 0.00001 ? -0.00001 : localRay.z;
        float rayDistance = (-printDepth * 0.5 + 0.004 - localPosition.z) / safeRayZ;
        vec3 printHit = localPosition + localRay * rayDistance;
        vec2 printUV = printHit.xy / vec2(11.91, 4.91) + 0.5;
        vec3 localNormal = normalize(mat3(printInverse) * n);
        float insidePrint = step(0.001, printUV.x) * step(printUV.x, 0.999)
          * step(0.001, printUV.y) * step(printUV.y, 0.999)
          * step(0.0, rayDistance) * smoothstep(0.3, 0.9, localNormal.z);
        vec3 artwork = texture2D(printArtwork, printUV).rgb;
        float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 transmissionTint = volumeAttenuation(max(rayDistance, 0.0), material.attenuationColor, material.attenuationDistance);
        totalDiffuse = mix(totalDiffuse, artwork * transmissionTint * (1.0 - fresnel), insidePrint);

        if (printFinish > 0.5 && insidePrint > 0.5) {
          vec3 finish = texture2D(printMask, printUV).rgb;
          float spot = finish.r;
          vec2 texel = 1.0 / vec2(textureSize(printMask, 0));
          vec2 gradient = vec2(
            texture2D(printMask, printUV + vec2(texel.x, 0.0)).r - texture2D(printMask, printUV - vec2(texel.x, 0.0)).r,
            texture2D(printMask, printUV + vec2(0.0, texel.y)).r - texture2D(printMask, printUV - vec2(0.0, texel.y)).r);
          vec3 raisedNormal = normalize(n + vec3(-gradient.x, -gradient.y, 0.0) * 0.2);
          vec3 windowLight = normalize(printWindow - pos);
          vec3 sunLight = normalize(printSun - pos);
          vec3 halfWindow = normalize(v + windowLight);
          vec3 halfSun = normalize(v + sunLight);
          float highlight = pow(max(dot(raisedNormal, halfWindow), 0.0), 28.0)
            + pow(max(dot(raisedNormal, halfSun), 0.0), 42.0);
          // A varnish lobe over the selected artwork, never a white paint overlay.
          vec3 foilTint=texture2D(printGlitterTint, printUV).rgb;
          totalSpecular += mix(vec3(1.0),foilTint,0.35) * highlight * spot * 3.0;

          if (printFinish > 1.5) {
            vec2 cells = printUV * vec2(640.0, 267.0);
            vec2 cell = floor(cells);
            float seed = printHash(cell);
            vec2 center = vec2(printHash(cell + 7.0), printHash(cell + 31.0)) * 0.6 + 0.2;
            float distanceToFlake = length(fract(cells) - center);
            float footprint = max(length(fwidth(cells)), 0.04);
            float flake = (1.0 - smoothstep(0.16, 0.16 + min(footprint,0.5), distanceToFlake)) * step(0.32, seed) * finish.g;
            vec3 flakeNormal = normalize(n + vec3(
              (printHash(cell + 19.0) - 0.5) * 1.5,
              (printHash(cell + 53.0) - 0.5) * 1.5, 0.0));
            float sparkle = pow(max(dot(flakeNormal, halfWindow), 0.0), 42.0)
              + pow(max(dot(flakeNormal, halfSun), 0.0), 65.0);
            vec3 filmColor = 0.65 + 0.35 * cos(vec3(0.0, 2.1, 4.2) + seed * 6.28 + dot(flakeNormal, v) * 12.0);
            vec3 collectibleTint = texture2D(printGlitterTint, printUV).rgb;
            totalSpecular += mix(collectibleTint, filmColor, finish.b) * sparkle * flake * 18.0;
          }
        }
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'acrylic-independent-masks-v4';
}

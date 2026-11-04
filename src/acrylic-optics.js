import * as THREE from '../vendor/three.module.js';

// Ray/print-plane intersection preserves the source resolution rather than
// resampling the design through Three's screen-space transmission buffer.
export function applyPrintOptics(material, mesh, { design, mask, components, depth, variant, keyPosition, windowPosition, card=false, paper=false }) {
  const inverse = new THREE.Matrix4();
  let compiledShader;
  mesh.onBeforeRender = () => {
    inverse.copy(mesh.matrixWorld).invert();
    if(compiledShader) {
      compiledShader.uniforms.printSun.value.copy(keyPosition);
      compiledShader.uniforms.printWindow.value.copy(windowPosition);
      // Keep live light values synchronized without rebuilding geometry or materials.
    }
  };
  const previousCompile=material.onBeforeCompile.bind(material);
  const previousCacheKey=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader,renderer) => {
    compiledShader=shader;
    Object.assign(shader.uniforms, {
      printArtwork: { value: design }, printMask: { value: mask },
      printCard: { value: card ? 1 : 0 },
      printPaper: { value: paper ? 1 : 0 },
      printComponents: { value:components },
      printInverse: { value: inverse }, printDepth: { value: depth },
      printWorld: { value:mesh.matrixWorld },
      printFinish: { value: variant === 'premium' ? 2 : variant === 'light' ? 1 : 0 },
      printSun: { value: keyPosition.clone() },
      printWindow: { value: windowPosition.clone() },
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
      uniform float printCard;
      uniform float printPaper;
      uniform sampler2D printComponents;
      uniform mat4 printInverse;
      uniform mat4 printWorld;
      uniform float printDepth;
      uniform float printFinish;
      uniform vec3 printSun;
      uniform vec3 printWindow;
      float printHash(vec2 p) {
        vec3 h=fract(vec3(p.xyx)*0.1031);
        h+=dot(h,h.yzx+33.33);
        return fract((h.x+h.y)*h.z);
      }
      // Nearest fully-jittered particle: distance, brightness seed, and two facet seeds.
      vec4 printParticle(vec2 p) {
        vec2 base=floor(p),local=fract(p),chosen=base;
        float nearest=10.0;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++) {
          vec2 offset=vec2(float(x),float(y)),id=base+offset;
          vec2 center=vec2(printHash(id+7.0),printHash(id+31.0));
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
        vec3 pV=normalize(cameraPosition-pPos);
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
        vec3 artwork = texture2D(printArtwork, printUV).rgb;
        vec3 finishPosition=pPos,finishNormal=pN,finishView=pV;
        #ifdef USE_TRANSMISSION
        // Powder and white-outline varnish share the single innermost artwork plane.
        finishPosition=(printWorld*vec4(printHit,1.0)).xyz;
        finishNormal=normalize(mat3(printWorld)*vec3(0.0,0.0,1.0));
        finishView=normalize(-internalRay);
        #endif
        float componentPrint=texture2D(printComponents,printUV).a;
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
        if(printCard<0.5 && printFinish>0.5 && insidePrint>0.5 && finish.g>0.005) {
          // Dense colored pigment grains with soft light-dependent metallic luster.
          vec2 powderUV=mat2(0.932,-0.362,0.362,0.932)*printUV;
          vec2 powderCells=powderUV*vec2(980.0,409.0);
          vec4 fineParticle=printParticle(powderCells);
          // Preserve a stable pigment-grain signal when individual grains are subpixel.
          // Averaging everything to 0.5 erased the visible effect at normal zoom.
          vec4 aggregateParticle=printParticle(powderUV*vec2(390.0,163.0)+vec2(41.7,19.2));
          float powderFootprint=max(fwidth(powderCells.x),fwidth(powderCells.y));
          float grainLOD=smoothstep(0.8,2.0,powderFootprint);
          float fineCoverage=1.0-smoothstep(0.16+fineParticle.y*0.12,0.38+fineParticle.y*0.18,fineParticle.x);
          float aggregateCoverage=1.0-smoothstep(0.16+aggregateParticle.y*0.12,0.38+aggregateParticle.y*0.18,aggregateParticle.x);
          float powderGrain=mix(fineCoverage,aggregateCoverage,grainLOD);
          vec4 facet=mix(fineParticle,aggregateParticle,grainLOD);
          vec3 colorGrain=vec3(facet.z,facet.w,facet.y)-0.5;
          vec3 powderModulation=vec3(0.80+powderGrain*0.38+facet.y*0.06)+colorGrain*0.04;
          float powderAmount=finish.g*(printFinish>1.5?1.0:0.72)*(1.0-finish.b);
          totalDiffuse*=mix(vec3(1.0),powderModulation,powderAmount);
          // Grain facets are attached to the print plane, rather than camera-space noise.
          vec3 powderTangent=normalize(mat3(printWorld)*vec3(1.0,0.0,0.0));
          vec3 powderBitangent=normalize(mat3(printWorld)*vec3(0.0,1.0,0.0));
          vec3 powderNormal=normalize(finishNormal
            +powderTangent*(facet.z-0.5)*(0.9+facet.y*0.9)
            +powderBitangent*(facet.w-0.5)*(0.9+facet.y*0.9));
          float powderLobe=pow(max(dot(powderNormal,halfWindow),0.0),28.0)*0.8
            +pow(max(dot(powderNormal,halfSun),0.0),40.0)*0.2;
          float powderIllumination=max(dot(powderNormal,windowLight),0.0)*0.7
            +max(dot(powderNormal,sunLight),0.0)*0.3;
          float powderSheen=powderAmount*(0.15+0.85*powderGrain)*min(0.65,powderLobe*powderIllumination*2.8);
          totalSpecular+=imageTint*powderSheen;
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
          totalDiffuse=mix(totalDiffuse,hologram,insidePrint*(0.55+band*0.35));
        }

        if (printCard<0.5 && printFinish > 0.5 && insidePrint > 0.5) {
          float spot = finish.r;
          if(spot>0.005 && finish.b<0.995) {
          vec2 texel = 1.0 / vec2(textureSize(printMask, 0));
          vec2 gradient = vec2(
            texture2D(printMask, printUV + vec2(texel.x, 0.0)).r - texture2D(printMask, printUV - vec2(texel.x, 0.0)).r,
            texture2D(printMask, printUV + vec2(0.0, texel.y)).r - texture2D(printMask, printUV - vec2(0.0, texel.y)).r);
          vec3 raisedNormal = normalize(finishNormal + vec3(-gradient.x, 0.14-gradient.y, 0.0) * 0.2);
          float highlight = pow(max(dot(raisedNormal, halfWindow), 0.0), printPaper>0.5?12.0:18.0)
            + pow(max(dot(raisedNormal, halfSun), 0.0), printPaper>0.5?20.0:30.0);
          // A varnish lobe over the selected artwork, never a white paint overlay.
          float uvResponse=(1.0-exp(-highlight*spot*3.0))*0.72*(1.0-finish.b);
          totalSpecular += imageTint * uvResponse;
          }

          {
            // Existing background glitter stays separate from diffuse component powder.
            float density=printFinish>1.5?1.0:0.7;
            float finishCoverage=1.0-componentPrint;
            if(finishCoverage>0.005) {
              vec3 tangent=normalize(mat3(printWorld)*vec3(1.0,0.0,0.0));
              vec3 bitangent=normalize(mat3(printWorld)*vec3(0.0,1.0,0.0));
              float glitterResponse=0.0;
              for(int layer=0;layer<2;layer++) {
                vec2 cells=layer==0?mat2(0.956,-0.292,0.292,0.956)*printUV*vec2(520.0,217.0)
                  :mat2(0.819,0.574,-0.574,0.819)*printUV*vec2(770.0,322.0)+vec2(23.1,67.3);
                vec4 particle=printParticle(cells);
                float radius=layer==0?mix(0.25,0.45,particle.y):mix(0.18,0.34,particle.y);
                float edge=clamp(length(fwidth(cells))*0.15,0.03,0.16);
                float flake=(1.0-smoothstep(radius-edge,radius+edge,particle.x))*step(0.22,particle.y)*density;
                vec3 flakeNormal=normalize(finishNormal+tangent*(particle.z-0.5)*1.5+bitangent*(particle.w-0.5)*1.5);
                float sparkle=pow(max(dot(flakeNormal,halfWindow),0.0),32.0)
                  +pow(max(dot(flakeNormal,halfSun),0.0),50.0);
                float angularGate=0.05+pow(max(dot(finishNormal,halfWindow),0.0),8.0)+pow(max(dot(finishNormal,halfSun),0.0),12.0);
                glitterResponse+=min(sparkle*angularGate*1.7*flake,0.4);
              }
              totalSpecular+=imageTint*min(glitterResponse,0.5)*(1.0-finish.b)*finishCoverage;
            }
          }
        }
    `);
    // Run helper patches last, after preserving the physical shader's include hooks.
    previousCompile(shader,renderer);
  };
  material.customProgramCacheKey = () => 'snell-rear-ink-live-light-v17-'+Number(card)+'-'+Number(paper)+'-'+previousCacheKey();
}

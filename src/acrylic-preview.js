import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { applyPrintOptics } from './acrylic-optics.js';
import { createPaperTexture } from './paper-texture.js';
import { MeshTransmissionMaterial, getGPUTier } from '../vendor/render-extensions.js';
import { createFinishMaterial } from './finish-material.js';
import { previewQuality } from './preview-quality.js';
import { DEFAULT_LIGHT_ANGLE } from './finish-settings.js';
import { captureProductImage } from './transparent-capture.js';

export function createAcrylicPreview(host,{snapshot=false}={}) {
  let quality=previewQuality({isMobile:window.matchMedia('(pointer: coarse)').matches},snapshot);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: snapshot });
  if(snapshot)renderer.setClearColor(0xffffff,0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,quality.pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '3D 产品预览，拖动旋转，滚轮或双指缩放，方向键调整视角');
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = snapshot?null:new THREE.Color('#f3eee4');
  scene.fog = snapshot?null:new THREE.Fog('#f3eee4', 55, 110);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 7;
  controls.maxDistance = 70;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.minPolarAngle = Math.PI * 0.16;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.target.set(0, 2.65, 0);
  // Own gestures inside the model viewport so browser pinch-zoom cannot steal them.
  renderer.domElement.style.touchAction = 'none';
  // Drawing-buffer pixels must not become CSS pixels on high-DPI displays.
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  const object = new THREE.Group();
  scene.add(object);
  const environment = new THREE.Scene();
  environment.background = new THREE.Color('#c8c4bb');
  const lightCard = (x, y, z, width, height, intensity, rotation = 0) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide }));
    panel.position.set(x, y, z);
    panel.rotation.y = rotation;
    environment.add(panel);
  };
  lightCard(-8, 5, 5, 4, 13, 6, Math.PI / 3);
  lightCard(8, 3, 1, 2, 12, 4, -Math.PI / 3);
  lightCard(0, 10, -3, 14, 4, 5);
  lightCard(0, 2, -9, 18, 10, 0.15);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentMap = pmrem.fromScene(environment, 0.04);
  scene.environment = environmentMap.texture;
  pmrem.dispose();
  environment.traverse((item) => { item.geometry?.dispose(); item.material?.dispose(); });
  scene.add(new THREE.HemisphereLight(0xfffbf1, 0xb7ac94, 1.1));
  const key = new THREE.DirectionalLight(0xfff6e5, 3.2);
  key.position.set(-8, 12, -6);
  key.castShadow = true;
  key.shadow.mapSize.set(quality.shadowSize,quality.shadowSize);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 5;
  scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshStandardMaterial({ color: '#f3eee4', roughness: 0.85, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.06;
  floor.receiveShadow = true;
  if(!snapshot)scene.add(floor);
  // Soft contact shadow under clear material, which shadow maps cannot transmit accurately.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  const gradient = shadowContext.createRadialGradient(64, 64, 6, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(25,27,34,.36)');
  gradient.addColorStop(1, 'rgba(25,27,34,0)');
  shadowContext.fillStyle = gradient;
  shadowContext.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(16, 5),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -0.045;
  scene.add(contact);
  let designTexture;
  let spotTexture;
  let componentTexture;
  let badgeTexture;
  const paperSurface=createPaperTexture(),cardSurface=createPaperTexture(true);
  const windowPosition = new THREE.Vector3(-8, 7, 6);
  let selection = { variant: 'effect', cardOnly: false, accessory: 'none' };
  let disposed = false;
  let pendingFrame=0;
  const draw = () => {
    host.dataset.cameraDistance=controls.getDistance().toFixed(3);
    host.dataset.orbitTarget=controls.target.toArray().map(value=>value.toFixed(3)).join(',');
    if(disposed||pendingFrame)return;
    pendingFrame=window.requestAnimationFrame(()=>{
      pendingFrame=0;
      host.dataset.cameraDistance=controls.getDistance().toFixed(3);
      if(!disposed&&host.clientWidth)renderer.render(scene,camera);
    });
  };
  controls.addEventListener('change', draw);
  let compactView=host.clientWidth<500;
  let nearView=false;
  function frameView(close) {
    nearView=close;
    controls.minDistance=7;
    if(close) {
      camera.position.set(6, 5.4, 12.5);
      controls.target.set(0, 2.65, 0);
      if(compactView)camera.position.sub(controls.target).multiplyScalar(1.45).add(controls.target);
    } else {
      // Orbit the product's geometry, excluding the floor and contact shadow.
      const bounds=new THREE.Box3().setFromObject(object);
      const center=bounds.isEmpty()?new THREE.Vector3(0,2.5,0):bounds.getCenter(new THREE.Vector3());
      const radius=bounds.isEmpty()?6.6:bounds.getBoundingSphere(new THREE.Sphere()).radius;
      const halfFov=THREE.MathUtils.degToRad(camera.fov/2);
      const limitingHalfFov=Math.min(halfFov,Math.atan(Math.tan(halfFov)*camera.aspect));
      const distance=Math.max(33,radius/Math.sin(limitingHalfFov)*1.35);
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(6,2.75,12.5).normalize().multiplyScalar(Math.min(distance,65)));
    }
    controls.update();
    draw();
  }
  function reset(){frameView(false);}
  function resize() {
    const width = host.clientWidth;
    if (!width) return;
    const height = host.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep the brick within the viewport on narrow screens.
    camera.fov = width < 500 ? 48 : 34;
    if(compactView!==(width<500)){compactView=width<500;frameView(nearView);}
    camera.updateProjectionMatrix();
    draw();
  }
  const observer = new window.ResizeObserver(resize);
  observer.observe(host);
  function clearObject() {
    for (const mesh of [...object.children]) {
      object.remove(mesh);
      mesh.traverse(item=>{
        item.geometry?.dispose();
        for(const material of Array.isArray(item.material)?item.material:[item.material])material?.dispose();
      });
    }
  }
  function rebuild() {
    clearObject();
    if (!designTexture) return;
    const { cardOnly, accessory, shikishi=false } = selection;
    const variant=cardOnly||shikishi?'effect':selection.variant==='basic'?'basic':'effect';
    contact.scale.set(1,cardOnly?0.3:shikishi?0.5:1,1);
    const depth = cardOnly ? 0.035 : shikishi ? 0.12 : 1.5;
    const acrylic = cardOnly||shikishi?new THREE.MeshPhysicalMaterial():new MeshTransmissionMaterial({
      samples:quality.samples,transmissionSampler:true,transmission:1,
      chromaticAberration:0,anisotropicBlur:0,distortion:0,temporalDistortion:0,
    });
    acrylic.setValues({
      color: '#ffffff', metalness: 0, roughness: 0.018,
      transmission: 1, thickness: depth, ior: 1.49,
      attenuationColor: new THREE.Color('#e3f5f5'), attenuationDistance: 55,
      clearcoat: 0, clearcoatRoughness: 0.025, envMapIntensity: 0.65,
    });
    const brick = new THREE.Mesh(new RoundedBoxGeometry(12, 5, depth, 5, cardOnly ? 0.012 : shikishi?0.035:0.065), acrylic);
    if(cardOnly||shikishi) {
      acrylic.transmission=0; acrylic.color.set(shikishi?'#f3eee4':'#171717'); acrylic.metalness=0; acrylic.roughness=0.95; acrylic.clearcoat=0; acrylic.envMapIntensity=0.1;
    }
    brick.position.y = 2.5;
    object.add(brick);
    if (!cardOnly&&!shikishi) applyPrintOptics(acrylic, brick, { design: designTexture, mask: spotTexture, components:componentTexture,badges:badgeTexture, depth, variant, keyPosition: key.position, windowPosition });
    const print = createFinishMaterial({ map: designTexture, roughness: shikishi?0.62:cardOnly?0.42:0.38,
      clearcoat: 0,
      clearcoatMap: null,
      clearcoatRoughness: 0.06,
      iridescence: 0, iridescenceIOR: 1.45,
      iridescenceThicknessRange: [180, 500], metalness: cardOnly ? 0.2 : 0,
    },spotTexture,{paper:shikishi});
    if(cardOnly||shikishi) { print.clearcoat=0;print.clearcoatMap=null;print.metalness=0;print.roughness=shikishi?0.62:0.42;print.envMapIntensity=0;print.specularIntensity=0; }
    const art = new THREE.Mesh(new THREE.PlaneGeometry(11.91, 4.91), print);
    art.name='single-composited-design';
    art.position.set(0, 2.5, cardOnly||shikishi ? depth/2+0.004 : -depth / 2 + 0.004);
    art.castShadow = true;
    print.side=cardOnly||shikishi?THREE.DoubleSide:THREE.FrontSide;
    object.add(art);
    if(cardOnly||shikishi)applyPrintOptics(print,art,{design:designTexture,mask:spotTexture,components:componentTexture,badges:badgeTexture,depth,variant:'effect',keyPosition:key.position,windowPosition,card:cardOnly,paper:shikishi});
    if(shikishi) {
      // Folded paper binding, matching the uncoated warm-white reverse.
      const borderMaterial=new THREE.MeshStandardMaterial({color:'#e8dfce',metalness:0,roughness:0.95,map:paperSurface.color,bumpMap:paperSurface.bump,bumpScale:0.045,roughnessMap:paperSurface.roughness});
      for(const [w,h,x,y] of [[12.12,0.075,0,0.015],[12.12,0.075,0,4.985],[0.075,5.0,-6.02,2.5],[0.075,5.0,6.02,2.5]]) {
        const edge=new THREE.Mesh(new THREE.BoxGeometry(w,h,0.17),borderMaterial.clone());edge.position.set(x,y,0);object.add(edge);
      }
      borderMaterial.dispose();
    }
    {
    const reverseMaterial = cardOnly||shikishi
      ? new THREE.MeshStandardMaterial({color:cardOnly?'#080808':'#f3eee4',roughness:cardOnly?0.85:0.96,metalness:0,envMapIntensity:cardOnly?0.2:0.1,
        map:cardOnly?cardSurface.color:paperSurface.color,bumpMap:cardOnly?cardSurface.bump:paperSurface.bump,bumpScale:cardOnly?0.018:0.07,roughnessMap:cardOnly?cardSurface.roughness:paperSurface.roughness})
      : new THREE.MeshStandardMaterial({ color: '#e8ddc5', roughness: 0.88, metalness:0, transparent:false });
    const reverse = new THREE.Mesh(new THREE.PlaneGeometry(11.91, 4.91), reverseMaterial);
    reverse.rotation.y = Math.PI;
    reverse.position.set(0, 2.5, -depth / 2 - 0.004);
    reverse.name=cardOnly?'card-reverse':shikishi?'paper-reverse':'opaque-ivory-acrylic-reverse';
    object.add(reverse);
    }
    if(shikishi) {
      const stand=new THREE.Group();stand.name='shikishi-paper-stand';
      const material=new THREE.MeshStandardMaterial({color:'#e6ddcb',roughness:0.98,metalness:0,
        map:paperSurface.color,bumpMap:paperSurface.bump,bumpScale:0.045,roughnessMap:paperSurface.roughness});
      const support=new THREE.Mesh(new THREE.BoxGeometry(2.4,Math.hypot(3.2,1.95),0.045),material);
      support.position.set(0,1.64,-1.045);support.rotation.x=Math.atan2(1.95,3.2);stand.add(support);
      const foot=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.045,1.98),material.clone());foot.position.set(0,0.045,-1.06);stand.add(foot);
      const hinge=new THREE.Mesh(new THREE.BoxGeometry(2.45,0.13,0.065),material.clone());hinge.position.set(0,3.24,-0.085);stand.add(hinge);
      stand.traverse(item=>{if(item.isMesh)item.castShadow=true;});object.add(stand);
    }
    host.dataset.paperStand=shikishi?'folded-cardstock':'none';
    host.dataset.reverseMaterial=cardOnly?'black-cardstock':shikishi?'ivory-paper':'opaque-ivory';
    if (accessory === 'clearStand' && !cardOnly&&!shikishi) {
      // Helper material clones lose constructor-only sampler options; construct explicitly.
      const standMaterial=new MeshTransmissionMaterial({samples:quality.samples,transmissionSampler:true,transmission:1,
        thickness:0.25,roughness:0.018,chromaticAberration:0,anisotropicBlur:0});
      standMaterial.ior=1.49;standMaterial.envMapIntensity=0.65;
      const stand = new THREE.Mesh(new RoundedBoxGeometry(8, 0.25, 4, 3, 0.07), standMaterial);
      stand.position.set(0, 0.13, 0);
      object.add(stand);
      // Lift the brick onto the clear base.
      for (const item of object.children) if (item !== stand) item.position.y += 0.25;
    }
    host.dataset.variant = cardOnly ? 'card' : shikishi?'shikishi':variant;
    host.dataset.product = cardOnly ? 'card' : shikishi?'shikishi':'acrylic';
    host.dataset.printLayers='1';
    host.dataset.printPlacement=cardOnly||shikishi?'surface':'innermost';
    host.dataset.printPlaneZ=String(art.position.z);
    host.dataset.reverseTexture=cardOnly?'fine-card-grain':shikishi?'paper-fibers':'none';
    if(!nearView) {
      const center=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
      camera.position.add(center.clone().sub(controls.target));
      controls.target.copy(center);controls.update();
    }
    renderer.shadowMap.needsUpdate=true;
    draw();
  }
  function setDesign(source, finishMaps) {
    designTexture?.dispose(); spotTexture?.dispose();componentTexture?.dispose();badgeTexture?.dispose();
    const image = document.createElement('canvas');
    const limit = Math.min(renderer.capabilities.maxTextureSize, 4096);
    const scale = Math.min(1, limit / source.width, limit / source.height);
    image.width = Math.round(source.width * scale);
    image.height = Math.round(source.height * scale);
    const context = image.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, image.width, image.height);
    context.drawImage(source, 0, 0, image.width, image.height);
    designTexture = new THREE.CanvasTexture(image);
    designTexture.colorSpace = THREE.SRGBColorSpace;
    designTexture.anisotropy = Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy());
    designTexture.minFilter = THREE.LinearMipmapLinearFilter;
    designTexture.magFilter = THREE.LinearFilter;
    componentTexture=new THREE.CanvasTexture(finishMaps.componentCoverage);
    componentTexture.anisotropy=designTexture.anisotropy;
    badgeTexture=new THREE.CanvasTexture(finishMaps.badgeCoverage||document.createElement('canvas'));
    badgeTexture.anisotropy=designTexture.anisotropy;
    // Only authored collectible shapes receive a finish. Ordinary artwork stays matte.
    spotTexture = new THREE.CanvasTexture(finishMaps.packed);
    for (const texture of [spotTexture]) {
      texture.anisotropy = designTexture.anisotropy;
      texture.magFilter = THREE.LinearFilter;
    }
    rebuild();
  }
  renderer.domElement.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += event.key === 'ArrowLeft' ? 0.12 : event.key === 'ArrowRight' ? -0.12 : 0;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + (event.key === 'ArrowUp' ? -0.1 : event.key === 'ArrowDown' ? 0.1 : 0), controls.minPolarAngle, controls.maxPolarAngle);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update(); draw();
  });
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    host.dispatchEvent(new window.Event('preview-unavailable'));
  });
  setLightAngle(DEFAULT_LIGHT_ANGLE);
  reset(); resize();
  host.dataset.quality=quality.name;
  host.dataset.materialEngine='custom-shader-material+mesh-transmission';
  if(!snapshot) {
    // Local benchmark data; detection does not contact an external analytics service.
    getGPUTier({glContext:renderer.getContext(),benchmarksURL:new URL('../vendor/gpu-benchmarks',import.meta.url).href}).then(result=>{
      if(disposed)return;
      // Apple detection may issue its own GL commands on the shared context.
      renderer.resetState();
      const next=previewQuality(result);
      host.dataset.gpuTier=String(result.tier);
      host.dataset.quality=next.name;
      if(next.name===quality.name)return;
      quality=next;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,quality.pixelRatio));
      key.shadow.mapSize.set(quality.shadowSize,quality.shadowSize);
      key.shadow.map?.dispose();key.shadow.map=null;
      for(const texture of [designTexture,spotTexture,componentTexture,badgeTexture])if(texture){
        texture.anisotropy=Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;
      }
      resize();rebuild();
    }).catch(()=>{if(!disposed){renderer.resetState();host.dataset.gpuTier='fallback';draw();}});
  }
  function setLightAngle(degrees) {
    const angle = THREE.MathUtils.degToRad(degrees);
    key.position.set(-8, 12, -6).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    windowPosition.set(-8, 7, 6).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    scene.environmentRotation.set(0, angle, 0);
    renderer.shadowMap.needsUpdate=true;
    draw();
  }
  function capture(options = {}) {
    window.cancelAnimationFrame(pendingFrame); pendingFrame=0;
    return captureProductImage({ renderer, scene, camera, floor, backgroundColor: new THREE.Color(), ...options });
  }
  return {
    setDesign,
    setFinishMaps(maps) {
      if(!spotTexture||!componentTexture)return;
      spotTexture.image=maps.packed;spotTexture.needsUpdate=true;
      componentTexture.image=maps.componentCoverage;componentTexture.needsUpdate=true;
      badgeTexture.image=maps.badgeCoverage||document.createElement('canvas');badgeTexture.needsUpdate=true;
      draw();
    },
    redraw:draw,
    setSelection(next) {
      const same=['variant','cardOnly','shikishi','accessory'].every(key=>(selection[key]??false)===(next[key]??false));
      selection=next;if(!same)rebuild();
    },
    captureConfiguration(config, options = {}) {
      // Render the actual configured product meshes together, then freeze the frame as a PNG.
      const items=[...(config.quantity>0?[{cardOnly:false,shikishi:false,accessory:config.accessory}]:[]),
        ...(config.cardQuantity>0?[{cardOnly:true,shikishi:false,accessory:'none'}]:[]),
        ...(config.shikishiQuantity>0?[{cardOnly:false,shikishi:true,accessory:'none'}]:[])];
      clearObject();
      const groups=[];
      for(const [index,item] of items.entries()) {
        selection={variant:config.variant,...item};rebuild();
        const group=new THREE.Group();group.add(...[...object.children]);
        if(items.length>1) {
          group.scale.setScalar(0.82);
          group.position.x=items.length===2?[-2.2,2.3][index]:[-3.2,0,3.3][index];
          group.position.y=items.length===2?[0,0.7][index]:[0,0.8,0.2][index];
          group.position.z=items.length===2?[0.25,-0.35][index]:[0,-0.65,0.5][index];
          group.rotation.y=items.length===2?[-0.12,0.14][index]:[-0.13,0.07,0.16][index];
          group.rotation.z=items.length===2?[-0.04,0.06][index]:[-0.045,0.045,-0.03][index];
        }
        groups.push(group);
      }
      object.add(...groups);
      const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      const distance=Math.max(size.y/(2*tangent),size.x/(2*tangent*camera.aspect))*1.35+size.z;
      camera.position.copy(center).add(new THREE.Vector3(0.22,0.18,1).normalize().multiplyScalar(distance));camera.lookAt(center);
      window.cancelAnimationFrame(pendingFrame);pendingFrame=0;
      renderer.shadowMap.needsUpdate=true;
      return capture(options);
    },
    captureFrame: capture,
    reset,
    focusCollectibles() {frameView(true);},
    setLightAngle,
    dispose() {
      disposed = true;window.cancelAnimationFrame(pendingFrame);observer.disconnect(); controls.dispose(); clearObject();
      designTexture?.dispose(); spotTexture?.dispose();componentTexture?.dispose();badgeTexture?.dispose();paperSurface.dispose();cardSurface.dispose();
      environmentMap.dispose(); shadowTexture.dispose();
      floor.geometry.dispose(); floor.material.dispose(); contact.geometry.dispose(); contact.material.dispose();
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}

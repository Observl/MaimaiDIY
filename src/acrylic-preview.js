import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { applyPrintOptics } from './acrylic-optics.js';

export function createAcrylicPreview(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '3D 亚克力预览，拖动旋转，滚轮或双指缩放，方向键调整视角');
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3eee4');
  scene.fog = new THREE.Fog('#f3eee4', 55, 110);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 7;
  controls.maxDistance = 24;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.minPolarAngle = Math.PI * 0.16;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.target.set(0, 2.65, 0);
  // Own gestures inside the model viewport so browser pinch-zoom cannot steal them.
  renderer.domElement.style.touchAction = 'none';
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
  key.shadow.mapSize.set(2048, 2048);
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
  scene.add(floor);
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
  let glitterTintTexture;
  const windowPosition = new THREE.Vector3(-8, 7, 6);
  let selection = { variant: 'premium', cardOnly: false, accessory: 'none' };
  let disposed = false;
  const draw = () => {
    host.dataset.cameraDistance=controls.getDistance().toFixed(3);
    if (!disposed && host.clientWidth) renderer.render(scene, camera);
  };
  controls.addEventListener('change', draw);
  function reset() {
    controls.minDistance=7;
    camera.position.set(6, 5.4, 12.5);
    controls.target.set(0, 2.65, 0);
    controls.update();
    draw();
  }
  function resize() {
    const width = host.clientWidth;
    if (!width) return;
    const height = host.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep the brick within the viewport on narrow screens.
    camera.fov = width < 500 ? 48 : 34;
    camera.updateProjectionMatrix();
    draw();
  }
  const observer = new window.ResizeObserver(resize);
  observer.observe(host);
  function clearObject() {
    for (const mesh of [...object.children]) {
      object.remove(mesh);
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
    }
  }
  function rebuild() {
    clearObject();
    if (!designTexture) return;
    const { variant, cardOnly, accessory } = selection;
    const depth = cardOnly ? 0.035 : 1.5;
    const acrylic = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', metalness: 0, roughness: 0.018,
      transmission: 1, thickness: depth, ior: 1.49,
      attenuationColor: new THREE.Color('#e3f5f5'), attenuationDistance: 55,
      clearcoat: 1, clearcoatRoughness: 0.025, envMapIntensity: 1.2,
    });
    const brick = new THREE.Mesh(new RoundedBoxGeometry(12, 5, depth, 5, cardOnly ? 0.012 : 0.065), acrylic);
    brick.position.y = 2.5;
    object.add(brick);
    if (!cardOnly) applyPrintOptics(acrylic, brick, { design: designTexture, mask: spotTexture, glitterTint: glitterTintTexture, depth, variant, keyPosition: key.position, windowPosition });
    const print = new THREE.MeshPhysicalMaterial({ map: designTexture, roughness: 0.38,
      clearcoat: variant === 'basic' ? 0.15 : 1,
      clearcoatMap: variant === 'basic' ? null : spotTexture,
      clearcoatRoughness: 0.06,
      iridescence: cardOnly ? 0.75 : 0, iridescenceIOR: 1.45,
      iridescenceThicknessRange: [180, 500], metalness: cardOnly ? 0.45 : 0,
    });
    const art = new THREE.Mesh(new THREE.PlaneGeometry(11.91, 4.91), print);
    art.position.set(0, 2.5, -depth / 2 + 0.004);
    art.castShadow = true;
    object.add(art);
    const reverseMaterial = variant === 'premium' || cardOnly
      ? print.clone() : new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: 0.5 });
    const reverse = new THREE.Mesh(new THREE.PlaneGeometry(11.91, 4.91), reverseMaterial);
    reverse.rotation.y = Math.PI;
    reverse.position.set(0, 2.5, -depth / 2 - 0.004);
    object.add(reverse);
    if (accessory === 'clearStand' && !cardOnly) {
      const stand = new THREE.Mesh(new RoundedBoxGeometry(8, 0.25, 4, 3, 0.07), acrylic.clone());
      stand.position.set(0, 0.13, 0);
      object.add(stand);
      // Lift the brick onto the clear base.
      for (const item of object.children) if (item !== stand) item.position.y += 0.25;
    }
    host.dataset.variant = cardOnly ? 'card' : variant;
    draw();
  }
  function setDesign(source, finishMaps) {
    designTexture?.dispose(); spotTexture?.dispose(); glitterTintTexture?.dispose();
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
    designTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    designTexture.minFilter = THREE.LinearMipmapLinearFilter;
    designTexture.magFilter = THREE.LinearFilter;
    // Only authored collectible shapes receive a finish. Ordinary artwork stays matte.
    spotTexture = new THREE.CanvasTexture(finishMaps.packed);
    glitterTintTexture = new THREE.CanvasTexture(finishMaps.tint);
    glitterTintTexture.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [spotTexture, glitterTintTexture]) {
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
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
  reset(); resize();
  return {
    setDesign,
    setSelection(next) { selection = next; rebuild(); },
    reset,
    focusCollectibles() {
      controls.minDistance=9;
      controls.target.set(host.clientWidth<500 ? -0.5 : -1.8,4.1,0);
      camera.position.copy(controls.target).add(new THREE.Vector3(2.5,1.2,6.8));
      controls.update(); draw();
    },
    setLightAngle(degrees) {
      const angle = THREE.MathUtils.degToRad(degrees);
      key.position.set(-8, 12, -6).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      windowPosition.set(-8, 7, 6).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      scene.environmentRotation.set(0, angle, 0);
      draw();
    },
    dispose() {
      disposed = true; observer.disconnect(); controls.dispose(); clearObject();
      designTexture?.dispose(); spotTexture?.dispose(); glitterTintTexture?.dispose();
      environmentMap.dispose(); shadowTexture.dispose();
      floor.geometry.dispose(); floor.material.dispose(); contact.geometry.dispose(); contact.material.dispose();
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}

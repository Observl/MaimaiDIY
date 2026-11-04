import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';

export function createAcrylicPreview(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '3D 亚克力预览，可拖动旋转，方向键调整视角');
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3eee4');
  scene.fog = new THREE.Fog('#f3eee4', 55, 110);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = Math.PI * 0.16;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.target.set(0, 2.65, 0);
  // Horizontal drag rotates; vertical gestures remain available for page scrolling.
  renderer.domElement.style.touchAction = 'pan-y';
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
  let glitterTexture;
  let selection = { variant: 'basic', cardOnly: false, accessory: 'none' };
  let disposed = false;
  const draw = () => { if (!disposed && host.clientWidth) renderer.render(scene, camera); };
  controls.addEventListener('change', draw);
  function reset() {
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
    if (variant !== 'basic' && !cardOnly) {
      const varnish = new THREE.Mesh(new THREE.PlaneGeometry(11.91, 4.91),
        new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.13,
          alphaMap: spotTexture, metalness: 0, roughness: 0.1, clearcoat: 1,
          clearcoatRoughness: 0.025, depthWrite: false }));
      varnish.position.set(0, 2.5, depth / 2 + 0.003);
      object.add(varnish);
    }
    if (variant === 'premium' && !cardOnly) {
      const glitter = new THREE.Mesh(new THREE.PlaneGeometry(11.9, 4.9),
        new THREE.MeshPhysicalMaterial({ map: glitterTexture, alphaMap: glitterTexture,
          transparent: true, opacity: 0.6, metalness: 0.85, roughness: 0.2,
          iridescence: 0.8, iridescenceThicknessRange: [180, 450], depthWrite: false }));
      glitter.position.set(0, 2.5, -depth / 2 + 0.012);
      object.add(glitter);
    }
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
  function setDesign(source) {
    designTexture?.dispose(); spotTexture?.dispose(); glitterTexture?.dispose();
    const image = document.createElement('canvas');
    image.width = 2160; image.height = 904;
    const context = image.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, image.width, image.height);
    context.drawImage(source, 0, 0, image.width, image.height);
    designTexture = new THREE.CanvasTexture(image);
    designTexture.colorSpace = THREE.SRGBColorSpace;
    designTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const mask = document.createElement('canvas');
    mask.width = 540; mask.height = 226;
    const ctx = mask.getContext('2d');
    ctx.drawImage(image, 0, 0, mask.width, mask.height);
    const pixels = ctx.getImageData(0, 0, mask.width, mask.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      const value = saturation > 55 && (r + g + b) / 3 > 75 ? 220 : 0;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    }
    ctx.putImageData(pixels, 0, 0);
    spotTexture = new THREE.CanvasTexture(mask);
    const flecks = document.createElement('canvas');
    flecks.width = 1024; flecks.height = 428;
    const f = flecks.getContext('2d');
    f.fillStyle = '#000'; f.fillRect(0, 0, 1024, 428);
    let seed = 37;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 1800; i++) {
      f.fillStyle = i % 3 ? '#909080' : '#fff4cf';
      f.fillRect(random() * 1024, random() * 428, 0.5 + random(), 0.5 + random());
    }
    glitterTexture = new THREE.CanvasTexture(flecks);
    glitterTexture.colorSpace = THREE.SRGBColorSpace;
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
    dispose() {
      disposed = true; observer.disconnect(); controls.dispose(); clearObject();
      designTexture?.dispose(); spotTexture?.dispose(); glitterTexture?.dispose();
      environmentMap.dispose(); shadowTexture.dispose();
      floor.geometry.dispose(); floor.material.dispose(); contact.geometry.dispose(); contact.material.dispose();
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}

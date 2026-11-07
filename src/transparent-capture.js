// A PNG cannot refract a background added later. Recover a compositable glass
// layer from the same scene on black and white; use a supplied background when
// the final scene needs background-aware transmission/refraction.
export function unmatteTransmission(black, white) {
  if (black.length !== white.length || black.length % 4) throw new RangeError('Mismatched RGBA captures');
  const result = new Uint8ClampedArray(black.length);
  for (let i = 0; i < black.length; i += 4) {
    // Use the least transmissive channel so tinted edges remain representable.
    // Keep enough coverage for bright reflected light without clipping RGB.
    const alpha = Math.min(255, Math.max(0, black[i], black[i + 1], black[i + 2],
      255 - Math.min(white[i] - black[i], white[i + 1] - black[i + 1], white[i + 2] - black[i + 2])));
    result[i + 3] = alpha;
    if (!alpha) continue;
    for (let channel = 0; channel < 3; channel++) result[i + channel] = black[i + channel] * 255 / alpha;
  }
  return result;
}

export function captureProductImage({ renderer, scene, camera, floor, backgroundColor, transparent = true, background, width }) {
  if (renderer.getContext().isContextLost()) throw new Error('WebGL context unavailable');
  const oldSize = renderer.getSize({ set(x, y) { this.x = x; this.y = y; return this; } });
  const oldRatio = renderer.getPixelRatio(), oldAspect = camera.aspect;
  const oldBackground = scene.background, oldFog = scene.fog, oldFloorVisible = floor.visible;
  let resized = false;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  try {
    if (width !== undefined) {
      if (!Number.isSafeInteger(width) || width < 1 || width > Math.min(4096, renderer.capabilities.maxTextureSize)) throw new RangeError('Unsupported export width');
      const height = Math.max(1, Math.round(width * oldSize.y / oldSize.x));
      if (height > Math.min(4096, renderer.capabilities.maxTextureSize)) throw new RangeError('Unsupported export height');
      resized = true;
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    canvas.width = renderer.domElement.width;
    canvas.height = renderer.domElement.height;
    const read = () => {
      renderer.render(scene, camera);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(renderer.domElement, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    // No opaque studio floor or fog may be baked into a transparent cutout.
    floor.visible = false;
    scene.fog = null;
    if (transparent && background === undefined) {
      const color = backgroundColor.clone();
      scene.background = color.set('#000000');
      const black = read();
      scene.background = color.clone().set('#ffffff');
      const white = read();
      black.data.set(unmatteTransmission(black.data, white.data));
      context.putImageData(black, 0, 0);
    } else {
      scene.background = backgroundColor.clone().set(background ?? oldBackground ?? '#f3eee4');
      read();
    }
    return canvas.toDataURL('image/png');
  } finally {
    scene.background = oldBackground; scene.fog = oldFog; floor.visible = oldFloorVisible;
    if (resized) {
      renderer.setPixelRatio(oldRatio);
      renderer.setSize(oldSize.x, oldSize.y, false);
      camera.aspect = oldAspect; camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
  }
}

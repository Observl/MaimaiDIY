import {
  instantiate, TYPE_RGB_8, TYPE_CMYK_8,
  INTENT_RELATIVE_COLORIMETRIC, cmsFLAGS_BLACKPOINTCOMPENSATION,
} from '../vendor/lcms.js';

export async function exportCmykTiff(canvas, profileFile) {
  if (profileFile.size > 16 * 1024 * 1024)
    throw new Error('ICC 配置文件应小于 16 MB。');
  const profile = new Uint8Array(await profileFile.arrayBuffer());
  const header = new DataView(profile.buffer);
  const text = (offset, length) => String.fromCharCode(...profile.subarray(offset, offset + length));
  if (profile.length < 132 || header.getUint32(0) !== profile.length ||
      text(36, 4) !== 'acsp' || text(16, 4) !== 'CMYK' || text(12, 4) !== 'prtr')
    throw new Error('请选择厂家提供的 CMYK 印刷 ICC 配置文件（.icc 或 .icm）。');

  const lcms = await instantiate({
    locateFile: () => new URL('../vendor/lcms.wasm', import.meta.url).href,
  });
  const outputProfile = lcms.cmsOpenProfileFromMem(profile, profile.length);
  if (!outputProfile) throw new Error('无法读取此 ICC 配置，请检查文件是否完整。');
  const inputProfile = lcms.cmsCreate_sRGBProfile();
  let transform;
  try {
    transform = lcms.cmsCreateTransform(
      inputProfile, TYPE_RGB_8, outputProfile, TYPE_CMYK_8,
      INTENT_RELATIVE_COLORIMETRIC, cmsFLAGS_BLACKPOINTCOMPENSATION,
    );
    if (!transform) throw new Error('该 ICC 配置不支持从 sRGB 转为 CMYK。');
    const { width, height } = canvas;
    const pixels = new Uint8Array(width * height * 4);
    // Match the approved vivid print sample without changing the source PNG.
    const vivid = document.createElement('canvas');
    vivid.width = width;
    vivid.height = height;
    const context = vivid.getContext('2d');
    context.filter = 'saturate(125%) contrast(103%)';
    context.drawImage(canvas, 0, 0);
    // Process a few rows at a time to keep temporary WASM allocations small.
    for (let y = 0; y < height; y += 32) {
      const rows = Math.min(32, height - y);
      const rgba = context.getImageData(0, y, width, rows).data;
      const rgb = new Uint8Array(width * rows * 3);
      for (let pixel = 0; pixel < width * rows; pixel++) {
        const alpha = rgba[pixel * 4 + 3] / 255;
        for (let channel = 0; channel < 3; channel++)
          rgb[pixel * 3 + channel] = Math.round(rgba[pixel * 4 + channel] * alpha + 255 * (1 - alpha));
      }
      pixels.set(lcms.cmsDoTransform(transform, rgb, width * rows), y * width * 4);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return encodeCmykTiff(width, height, pixels, profile);
  } finally {
    if (transform) lcms.cmsDeleteTransform(transform);
    lcms.cmsCloseProfile(inputProfile);
    lcms.cmsCloseProfile(outputProfile);
  }
}

export function encodeCmykTiff(width, height, pixels, profile) {
  const tags = [
    [256, 4, 1, width], [257, 4, 1, height],
    [258, 3, 4, 0], // Four 8-bit samples.
    [259, 3, 1, 1], // Uncompressed, lossless.
    [262, 3, 1, 5], // Separated CMYK.
    [273, 4, 1, 0], [274, 3, 1, 1],
    [277, 3, 1, 4], [278, 4, 1, height], [279, 4, 1, pixels.length],
    [282, 5, 1, 0], [283, 5, 1, 0],
    [284, 3, 1, 1], [296, 3, 1, 1], // Square pixels, physical size unspecified.
    [332, 3, 1, 1], [334, 3, 1, 4],
    [34675, 7, profile.length, 0], // Embedded destination ICC.
  ];
  const bitsOffset = 8 + 2 + tags.length * 12 + 4;
  const resolutionOffset = bitsOffset + 8;
  const profileOffset = resolutionOffset + 8;
  const pixelOffset = (profileOffset + profile.length + 3) & ~3;
  const output = new Uint8Array(pixelOffset + pixels.length);
  const view = new DataView(output.buffer);
  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, tags.length, true);
  for (const [index, [tag, type, count, value]] of tags.entries()) {
    const offset = 10 + index * 12;
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    const payload = tag === 258 ? bitsOffset :
      tag === 273 ? pixelOffset :
      tag === 282 || tag === 283 ? resolutionOffset :
      tag === 34675 ? profileOffset : value;
    view.setUint32(offset + 8, payload, true);
  }
  for (let channel = 0; channel < 4; channel++) view.setUint16(bitsOffset + channel * 2, 8, true);
  view.setUint32(resolutionOffset, 1, true);
  view.setUint32(resolutionOffset + 4, 1, true);
  output.set(profile, profileOffset);
  output.set(pixels, pixelOffset);
  return new Blob([output], { type: 'image/tiff' });
}

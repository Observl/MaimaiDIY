import { createPngBlob } from './image-export.js';
import { createZip } from './zip.js';

async function encodeFinishMasks({ packed, componentCoverage }, width, height) {
  const mask = document.createElement('canvas');
  mask.width = packed.width;
  mask.height = packed.height;
  const ctx = mask.getContext('2d');
  const finish = packed.getContext('2d').getImageData(0, 0, mask.width, mask.height).data;
  const components = componentCoverage.getContext('2d').getImageData(0, 0, mask.width, mask.height).data;
  const output = ctx.createImageData(mask.width, mask.height);
  const files = [];
  // Match the effect coverage in acrylic-optics.js, before lighting and particle noise.
  const layers = [
    ['glitter-mask.png', i => (255 - components[i + 3]) * (1 - finish[i + 2] / 255)],
    ['fine-powder-mask.png', i => finish[i + 1] * (1 - finish[i + 2] / 255)],
  ];
  try {
    for (const [name, coverage] of layers) {
      for (let i = 0; i < output.data.length; i += 4) {
        output.data[i] = output.data[i + 1] = output.data[i + 2] = coverage(i);
        output.data[i + 3] = 255;
      }
      ctx.putImageData(output, 0, 0);
      const blob = await createPngBlob(mask, width, height);
      files.push({ name, blob });
    }
    return files;
  } finally {
    mask.width = 0;
  }
}

export async function createOrderArtworkZip({ draft, artwork, finishMaps }) {
  // Match the full 120 × 50 mm brick face, without cropping the artwork.
  const printWidthMm = 120;
  const printHeightMm = 50;
  const pixelsPerMm = 20;
  const width = printWidthMm * pixelsPerMm;
  const height = printHeightMm * pixelsPerMm;
  const [original, masks] = await Promise.all([
    Promise.resolve().then(() => createPngBlob(artwork, width, height)),
    finishMaps.then(maps => encodeFinishMasks(maps, width, height)),
  ]);
  const config = {
    ...draft,
    artwork: {
      width,
      height,
      printWidthMm,
      printHeightMm,
      original: 'design.png',
      glitterMask: 'glitter-mask.png',
      finePowderMask: 'fine-powder-mask.png',
      maskEncoding: 'grayscale: black = no effect, white = full coverage',
    },
  };
  return createZip([
    { name: config.artwork.original, blob: original },
    ...masks,
    { name: 'maimaidiy-custom-draft.json', blob: new Blob([JSON.stringify(config, null, 2)]) },
  ]);
}

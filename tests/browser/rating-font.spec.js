import { test, expect } from '@playwright/test';

test('Rating uses the bundled ExtraBold digit font for preview and PNG output', async ({ page }, testInfo) => {
  await page.route('**/rating-font-test', route => route.fulfill({
    contentType: 'text/html', body: '<link rel="stylesheet" href="/styles.css">',
  }));
  await page.goto('/rating-font-test');
  const result = await page.evaluate(async () => {
    const { createRenderer } = await import('/src/renderer.js');
    const { createDefaultState } = await import('/src/model.js');
    const { CANVAS, OUTPUT } = await import('/src/config.js');
    const canvas = (width, height) => {
      const result = document.createElement('canvas');
      result.width = width; result.height = height; return result;
    };
    const preview = canvas(CANVAS.width, CANVAS.height), renderer = createRenderer(preview);
    const state = createDefaultState();
    Object.keys(state.visible).forEach(id => { state.visible[id] = id === 'ratingDigits'; });
    const samples = [];
    for (const value of [0, 9, 1024, 16411, 99999]) {
      state.ratingValue = value;
      await renderer.render(state, { strict: true });
      const exportCanvas = canvas(OUTPUT.width, OUTPUT.height), ctx = exportCanvas.getContext('2d');
      ctx.drawImage(renderer.renderCanvas, 0, 0, OUTPUT.width, OUTPUT.height);
      const image = new Image(); image.src = exportCanvas.toDataURL('image/png'); await image.decode();
      const pixels = ctx.getImageData(0, 0, OUTPUT.width, OUTPUT.height).data;
      let ink = 0, outside = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]) {
        ink++;
        const x = (i / 4) % OUTPUT.width, y = Math.floor(i / 4 / OUTPUT.width);
        if (x < 444 || x >= 602 || y < 72 || y >= 122) outside++;
      }
      samples.push({ value, ink, outside, width: image.naturalWidth, height: image.naturalHeight });
    }
    return {
      loaded: [...document.fonts].some(font => font.family.includes('Maimai Rating Digits') && font.status === 'loaded'),
      samples, png: renderer.renderCanvas.toDataURL('image/png'),
    };
  });
  expect(result.loaded).toBe(true);
  for (const sample of result.samples) {
    expect(sample.ink, String(sample.value)).toBeGreaterThan(20);
    expect(sample.outside, String(sample.value)).toBe(0);
    expect([sample.width, sample.height]).toEqual([2160, 904]);
  }
  await testInfo.attach('rating-digits-extrabold', {
    body: Buffer.from(result.png.split(',')[1], 'base64'), contentType: 'image/png',
  });
});

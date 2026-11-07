import { test, expect } from '@playwright/test';

test('real-font names use eight fixed cells without stretching or compression', async ({ page }, testInfo) => {
  // Exercise the production renderer without unrelated material manifest requests.
  await page.route('**/name-layout-test', (route) => route.fulfill({
    contentType: 'text/html', body: '<link rel="stylesheet" href="/styles.css">',
  }));
  await page.route('https://*.myqcloud.com/**', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.goto('/name-layout-test');
  const result = await page.evaluate(async () => {
    const { createRenderer } = await import('/src/renderer.js');
    const { createDefaultState } = await import('/src/model.js');
    const { layoutPlayerName } = await import('/src/player-name.js');
    const { CANVAS, DISPLAY_FONT, slots } = await import('/src/config.js');
    await document.fonts.load(`23px ${DISPLAY_FONT}`);
    const fontLoaded = [...document.fonts].some(font => font.family.includes('SEGA Maru Gothic DB') && font.status === 'loaded');
    const names = ['', 'A', 'ABC', 'ABCDEF', 'ＡＢＣＤＥＦ', 'ABCDEFG', 'ABCDEFGH',
      '舞萌玩家测试', '舞萌玩家名称测试', '中A文b字C', 'A.B1中。',
      'e\u0301か\u3099𠮷👨‍👩‍👧🇨🇳👍🏽', '﷽﷽﷽﷽﷽﷽﷽﷽', 'A\u0301\u0301\u0301\u0301\u0301\u0301\u0301\u0301'];
    const sheet = document.createElement('canvas');
    sheet.width = 960; sheet.height = names.length * 96;
    const sheetCtx = sheet.getContext('2d');
    sheetCtx.fillStyle = '#fff'; sheetCtx.fillRect(0, 0, sheet.width, sheet.height);
    const samples = [];
    for (const scale of [2, 4]) {
      const preview = document.createElement('canvas');
      preview.width = CANVAS.width; preview.height = CANVAS.height;
      const renderer = createRenderer(preview, { scale });
      for (const [index, name] of names.entries()) {
        const state = createDefaultState(); state.playerName = name;
        Object.keys(state.visible).forEach(id => { state.visible[id] = id === 'playerName'; });
        await renderer.render(state, { strict: true });
        const ctx = renderer.renderCanvas.getContext('2d');
        const pixels = ctx.getImageData(0, 0, renderer.renderCanvas.width, renderer.renderCanvas.height).data;
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (let p = 0; p < pixels.length; p += 4) if (pixels[p + 3]) {
          const x = (p / 4) % renderer.renderCanvas.width;
          const y = Math.floor(p / 4 / renderer.renderCanvas.width);
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        const layout = layoutPlayerName(name, slots.rank.x - slots.nameBase.x);
        // The prefix must be pixel-identical regardless of the name's length.
        const prefix = [...ctx.getImageData(142 * scale, 67 * scale, 23 * scale, 40 * scale).data];
        samples.push({ name, scale, left, right, top, bottom,
          width: layout.width, cellWidth: layout.cellWidth, count: layout.glyphs.length, prefix,
          unmodified: state.playerName === name,
          png: ['ABCDEF', 'ＡＢＣＤＥＦ'].includes(name) ? renderer.renderCanvas.toDataURL() : null });
        if (scale === 2) {
          sheetCtx.fillStyle = '#333'; sheetCtx.font = '18px sans-serif';
          sheetCtx.fillText(name || '(empty)', 16, index * 96 + 48, 360);
          sheetCtx.drawImage(renderer.renderCanvas, 284, 134, 368, 80, 410, index * 96 + 8, 368, 80);
          sheetCtx.strokeStyle = '#d22';
          sheetCtx.strokeRect(410, index * 96 + 8, 368, 80);
        }
      }
    }
    return { fontLoaded, samples, sheet: sheet.toDataURL() };
  });
  expect(result.fontLoaded).toBe(true);
  for (const sample of result.samples) {
    expect(sample.unmodified).toBe(true);
    expect(sample.cellWidth).toBe(23);
    expect(sample.width).toBe(sample.count * 23);
    if (!sample.count) continue;
    expect(sample.left).toBeGreaterThanOrEqual(142 * sample.scale);
    expect(sample.right).toBeLessThan((142 + sample.count * 23) * sample.scale);
    expect(sample.top).toBeGreaterThanOrEqual(67 * sample.scale);
    expect(sample.bottom).toBeLessThan(107 * sample.scale);
  }
  for (const scale of [2, 4]) {
    const sample = name => result.samples.find(value => value.name === name && value.scale === scale);
    const short = sample('ABC'), six = sample('ABCDEF'), eight = sample('ABCDEFGH');
    expect(short.left).toBe(six.left);
    expect(short.right).toBeLessThan(six.right);
    for (const name of ['A', 'ABC', 'ABCDEF', 'ABCDEFG', 'ABCDEFGH']) {
      expect(sample(name).prefix).toEqual(eight.prefix);
    }
    expect(six.png).toBe(sample('ＡＢＣＤＥＦ').png);
  }
  await testInfo.attach('name-eight-fixed-real-font', {
    body: Buffer.from(result.sheet.split(',')[1], 'base64'), contentType: 'image/png',
  });
});

test('preview, PNG export and finish masks share the same fixed name geometry', async ({ page }) => {
  await page.route('**/name-layout-test', route => route.fulfill({
    contentType: 'text/html', body: '<link rel="stylesheet" href="/styles.css">',
  }));
  await page.route('https://*.myqcloud.com/**', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.goto('/name-layout-test');
  const results = await page.evaluate(async () => {
    const { createRenderer } = await import('/src/renderer.js');
    const { createCollectibleMasks } = await import('/src/collectible-masks.js');
    const { createDefaultState } = await import('/src/model.js');
    const { CANVAS, DISPLAY_FONT, OUTPUT } = await import('/src/config.js');
    await document.fonts.load(`23px ${DISPLAY_FONT}`);
    const canvas = (width, height) => {
      const result = document.createElement('canvas');
      result.width = width; result.height = height; return result;
    };
    const results = [];
    for (const name of ['ABC', 'ABCDEFGH', '舞萌玩家名称测试', '﷽e\u0301𠮷👨‍👩‍👧🇨🇳👍🏽中A']) {
      const preview = canvas(CANVAS.width, CANVAS.height);
      const renderer = createRenderer(preview);
      const state = createDefaultState(); state.playerName = name;
      Object.keys(state.visible).forEach(id => { state.visible[id] = id === 'playerName'; });
      await renderer.render(state, { strict: true });
      const output = canvas(OUTPUT.width, OUTPUT.height), ctx = output.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(renderer.renderCanvas, 0, 0, OUTPUT.width, OUTPUT.height);
      // Round-trip actual PNG bytes, then compare their geometry with the mask.
      const image = new Image(); image.src = output.toDataURL('image/png'); await image.decode();
      ctx.clearRect(0, 0, output.width, output.height); ctx.drawImage(image, 0, 0);
      const { packed, componentCoverage } = await createCollectibleMasks(state);
      const namePixels = ctx.getImageData(0, 0, output.width, output.height).data;
      const maskPixels = packed.getContext('2d').getImageData(0, 0, output.width, output.height).data;
      const coveragePixels = componentCoverage.getContext('2d').getImageData(0, 0, output.width, output.height).data;
      let maskDifference = 0, coverageDifference = 0, outsideName = 0;
      for (let p = 0; p < namePixels.length; p += 4) {
        maskDifference = Math.max(maskDifference, Math.abs(namePixels[p + 3] - maskPixels[p + 2]));
        coverageDifference = Math.max(coverageDifference, Math.abs(namePixels[p + 3] - coveragePixels[p + 3]));
        const x = (p / 4) % output.width;
        if ((namePixels[p + 3] || maskPixels[p + 2]) && (x < 284 || x >= 652)) outsideName++;
      }
      // Preview is produced directly from the same high-resolution render.
      const expectedPreview = canvas(CANVAS.width, CANVAS.height);
      const previewCtx = expectedPreview.getContext('2d');
      previewCtx.imageSmoothingQuality = 'high';
      previewCtx.drawImage(renderer.renderCanvas, 0, 0, CANVAS.width, CANVAS.height);
      results.push({ name, maskDifference, coverageDifference, outsideName,
        previewMatches: expectedPreview.toDataURL() === preview.toDataURL(),
        width: image.naturalWidth, height: image.naturalHeight });
    }
    return results;
  });
  for (const result of results) {
    expect(result.maskDifference, result.name).toBeLessThanOrEqual(1);
    expect(result.coverageDifference, result.name).toBeLessThanOrEqual(1);
    expect(result.outsideName, result.name).toBe(0);
    expect(result.previewMatches, result.name).toBe(true);
    expect([result.width, result.height]).toEqual([2160, 904]);
  }
});

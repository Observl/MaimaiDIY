import { test, expect } from '@playwright/test';

test('real-font names use six cells, full-width English and horizontal-only compression', async ({ page }, testInfo) => {
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
    await document.fonts.load(`21.33333px ${DISPLAY_FONT}`);
    const fontLoaded = [...document.fonts].some(font => font.family.includes('SEGA Maru Gothic DB') && font.status === 'loaded');
    const names = ['', 'ABC', 'ABCDEF', 'ＡＢＣＤＥＦ', 'Abcdefg', 'ABCDEFGH',
      '舞萌玩家测试', '舞萌玩家名称测试', '中A文b字C', 'A.B1中。', 'e\u0301か\u3099𠮷👨‍👩‍👧🇨🇳👍🏽'];
    const sheet = document.createElement('canvas');
    sheet.width = 960; sheet.height = names.length * 72;
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
        ctx.font = `400 21.33333px ${DISPLAY_FONT}, sans-serif`;
        const layout = layoutPlayerName(name, slots.rank.x - slots.nameBase.x, text => ctx.measureText(text));
        samples.push({ name, scale, left, right, top, bottom,
          width: layout.width, cellWidth: layout.cellWidth, count: layout.glyphs.length,
          unmodified: state.playerName === name,
          png: ['ABCDEF', 'ＡＢＣＤＥＦ'].includes(name) ? renderer.renderCanvas.toDataURL() : null });
        if (scale === 2) {
          sheetCtx.fillStyle = '#333'; sheetCtx.font = '18px sans-serif';
          sheetCtx.fillText(name || '(empty)', 16, index * 72 + 42);
          sheetCtx.drawImage(renderer.renderCanvas, 280, 130, 380, 88, 410, index * 72, 380, 88);
          sheetCtx.strokeStyle = '#d22';
          sheetCtx.strokeRect(414, index * 72 + 4, 368, 80);
        }
      }
    }
    return { fontLoaded, samples, sheet: sheet.toDataURL() };
  });
  expect(result.fontLoaded).toBe(true);
  for (const sample of result.samples) {
    expect(sample.unmodified).toBe(true);
    expect(sample.width).toBe(sample.count >= 6 ? 184 : sample.count * 184 / 6);
    if (!sample.count) continue;
    expect(sample.left).toBeGreaterThanOrEqual(142 * sample.scale);
    expect(sample.right).toBeLessThan(326 * sample.scale);
    // Fallback emoji fonts have their own ascenders; this change preserves the
    // existing font size and baseline rather than resizing glyphs vertically.
    if (!sample.name.includes('👨')) {
      expect(sample.top).toBeGreaterThanOrEqual(67 * sample.scale);
      expect(sample.bottom).toBeLessThan(107 * sample.scale);
    }
  }
  for (const scale of [2, 4]) {
    const sample = name => result.samples.find(value => value.name === name && value.scale === scale);
    const short = sample('ABC'), six = sample('ABCDEF'), eight = sample('ABCDEFGH');
    expect(short.cellWidth).toBe(six.cellWidth);
    expect(short.left).toBe(six.left);
    expect(short.right).toBeLessThan(six.right);
    expect(eight.cellWidth / six.cellWidth).toBeCloseTo(6 / 8, 12);
    expect(Math.abs((eight.bottom - eight.top) - (six.bottom - six.top))).toBeLessThanOrEqual(1);
    expect(six.png).toBe(sample('ＡＢＣＤＥＦ').png);
  }
  await testInfo.attach('name-width-real-font', {
    body: Buffer.from(result.sheet.split(',')[1], 'base64'), contentType: 'image/png',
  });
});

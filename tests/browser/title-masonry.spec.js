import { test, expect } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
for (const width of [320, 390, 1440]) {
  test(`title masonry wraps and reflows without hidden right-side content at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/app.js*', route => route.abort());
    await page.route('https://**/*', route => route.request().resourceType() === 'image'
      ? route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="536" height="50"><rect width="536" height="50" fill="gold"/></svg>' })
      : route.abort());
    await page.goto('/');
    await page.evaluate(async () => {
      const { initializePicker } = await import('/src/picker.js');
      const { createDefaultState } = await import('/src/model.js');
      const { controls } = await import('/src/config.js');
      const existing = document.querySelector('#asset-picker').outerHTML;
      document.body.innerHTML = existing + '<div data-control="title" hidden><span class="control-file"></span></div>';
      const items = Array.from({ length: 110 }, (_, i) => ({
        id: `title-${i}`, name: `${i}: ${i % 4 === 0 ? 'VeryLongUnbrokenTitle'.repeat(12) : '短称号'.repeat(i % 5 + 1)}`,
        color: 'Gold', group: i % 2 ? '测试分类' : 'LongUnbrokenCategory'.repeat(8),
      }));
      window.testPicker = initializePicker({ state: createDefaultState(), recordHistory() {}, render() {}, onSelection() {},
        resolveCategory: () => ({ id: 'titles', items }),
      });
      await window.testPicker.open(controls.find(c => c.id === 'title'));
    });
    const grid = page.locator('#picker-grid');
    await expect(grid).toHaveAttribute('data-masonry', 'true');
    const check = async () => page.evaluate(() => {
      const grid = document.querySelector('#picker-grid');
      const scroll = document.querySelector('#picker-scroll');
      const dialog = document.querySelector('#asset-picker');
      const box = grid.getBoundingClientRect();
      const items = [...grid.children].map(x => x.getBoundingClientRect());
      return { overflow: scroll.scrollWidth > scroll.clientWidth + 1 || dialog.scrollWidth > dialog.clientWidth + 1,
        out: items.some(x => x.left < box.left - 1 || x.right > box.right + 1),
        backwards: items.some((x, i) => i && x.top < items[i - 1].top - 1),
        overlap: items.some((x, i) => items.slice(i + 1).some(y => x.left < y.right - 1 && x.right > y.left + 1 && x.top < y.bottom - 1 && x.bottom > y.top + 1)),
      };
    });
    expect(await check()).toEqual({ overflow: false, out: false, backwards: false, overlap: false });
    await page.locator('#picker-search').fill('0: VeryLongUnbrokenTitle');
    await grid.locator('[data-asset-id="title-0"]').click();
    await expect(page.locator('#picker-message')).toHaveText('已选择称号');
    await page.locator('#picker-search').fill('');
    await page.locator('#picker-scroll').evaluate(node => { node.scrollTop = 0; });
    await expect(grid.locator('button').first()).toBeInViewport();
    expect(await check()).toEqual({ overflow: false, out: false, backwards: false, overlap: false });
    await page.screenshot({ path: info.outputPath(`titles-${width}.png`) });
    await page.locator('#picker-search').fill('no such title');
    await expect(grid.locator('button')).toHaveCount(0);
    await expect(grid).toHaveCSS('height', '0px');
    await page.locator('#picker-search').fill('短称号');
    await expect(grid.locator('button').first()).toBeVisible();
    expect(await check()).toEqual({ overflow: false, out: false, backwards: false, overlap: false });
    await page.setViewportSize({ width: width === 320 ? 390 : 320, height: 900 });
    await page.waitForTimeout(100);
    expect(await check()).toEqual({ overflow: false, out: false, backwards: false, overlap: false });
  });
}

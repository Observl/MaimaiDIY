import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { installCosFixtures, readReleaseFixture, RELEASE_URL } from './regional-index-fixtures.js';

test.use({ serviceWorkers: 'block' });
test.skip(!process.env.MAIMAI_TEST_INDEX_ROOT, 'Requires the byte-verified regional v2 fixture release');
const categories = ['frames', 'plates', 'icons', 'charas', 'songs'];
const playerName = page => page.locator('[data-control="playerName"] .name-input');
const refFor = body => ({ sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length });

async function setup(page, options) {
  const fixtures = await installCosFixtures(page.context(), options);
  const legacyRequests = [];
  await page.route('**/data/regions/*.json', async route => {
    legacyRequests.push(route.request().url());
    await route.abort();
  });
  const rawRequests = [];
  await page.route('https://raw.githubusercontent.com/**', async route => {
    rawRequests.push(route.request().url());
    await route.abort();
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#region-status')).toContainText('COS v2');
  return { ...fixtures, legacyRequests, rawRequests, errors };
}

async function switchRegion(page, region) {
  await page.locator('#region-select').selectOption(region);
  await expect(page.locator('#region-select')).toBeEnabled();
  await expect(page.locator('#region-select')).toHaveValue(region);
  await expect(page.locator('#loading')).toBeHidden();
}

async function exported(page) {
  const download = page.waitForEvent('download');
  await page.locator('#template-export').click();
  return JSON.parse(await readFile(await (await download).path(), 'utf8'));
}

async function requireBothCatalogs(page) {
  return page.evaluate(async () => {
    // The production build versions every module URL. Reuse that module instance
    // so the test itself does not create a second independent loader.
    const appScript = [...document.scripts].find(script => new URL(script.src || location.href).pathname === '/app.js');
    const appSource = await (await fetch(appScript.src)).text();
    const catalogImport = appSource.match(/from\s+['"]([^'"]*\/src\/region-catalog\.js[^'"]*)['"]/)[1];
    const api = await import(new URL(catalogImport, appScript.src).href);
    const [cn, jp, sameJp, frames] = await Promise.all([
      api.loadRegionCatalog('cn'), api.loadRegionCatalog('jp'),
      api.loadRegionCatalog('jp'), api.loadRegionCategoryIndex('jp', 'frames'),
    ]);
    return {
      sameJp: jp === sameJp,
      sources: [cn.sourceStatus.kind, jp.sourceStatus.kind, frames.sourceStatus.kind],
      regions: [cn.region, jp.region],
      counts: Object.fromEntries(['frames', 'plates', 'icons', 'charas', 'songs'].map(key => [key, jp[key].length])),
      cnArtCounts: ['frames', 'plates', 'icons', 'charas'].map(key => cn[key].length),
      mapped: Object.values(jp.indexes).every(index =>
        index.order.every(id => String(index.byId[id].id) === id) &&
        index.groups.reduce((sum, group) => sum + group.count, 0) === index.order.length),
      imageUrls: [jp.frames[0].image, jp.charas[0].image, jp.songs[0].image, cn.songs[0].image],
      frameGroups: jp.indexes.frames.groups,
    };
  });
}

test('v2 network indexes deduplicate, preserve counts and drive grouped picker pagination', async ({ page }) => {
  const log = await setup(page);
  const result = await requireBothCatalogs(page);
  expect(result.sameJp).toBe(true);
  expect(result.sources).toEqual(['v2-network', 'v2-network', 'v2-network']);
  expect(result.regions).toEqual(['cn', 'jp']);
  expect(result.cnArtCounts).toEqual([0, 0, 0, 0]);
  expect(result.mapped).toBe(true);
  for (const category of categories) {
    const shard = JSON.parse(await readReleaseFixture(`catalogs/v2/jp/${category}.json`));
    expect(result.counts[category]).toBe(shard.count);
  }
  expect(result.imageUrls.every(url => url.startsWith(RELEASE_URL))).toBe(true);
  const jsonRequests = log.requests.filter(url => url.startsWith(RELEASE_URL) && url.endsWith('.json'));
  expect(jsonRequests).toHaveLength(13);
  expect(new Set(jsonRequests).size).toBe(13);

  await switchRegion(page, 'jp');
  await page.locator('[data-control="background"] .library-button').click();
  await expect(page.locator('#picker-meta')).toHaveText(`找到 ${result.counts.frames} / ${result.counts.frames} 个素材`);
  await expect(page.locator('#picker-filter option')).toHaveCount(result.frameGroups.length + 1);
  const largest = [...result.frameGroups].sort((a, b) => b.count - a.count)[0];
  expect(largest.count).toBeGreaterThan(36);
  await expect(page.locator('#picker-filter')).toContainText(`${largest.label}（${largest.count}）`);
  await page.locator('#picker-filter').selectOption(largest.label);
  await expect(page.locator('#picker-meta')).toHaveText(`找到 ${largest.count} / ${result.counts.frames} 个素材`);
  await expect(page.locator('#picker-grid .asset-item')).toHaveCount(18);
  expect(await page.locator('#picker-grid .asset-item small').allTextContents()).toEqual(Array(18).fill(largest.label));
  await page.locator('#picker-more').click();
  await expect(page.locator('#picker-grid .asset-item')).toHaveCount(36);
  const ids = await page.locator('#picker-grid .asset-item').evaluateAll(items => items.map(item => item.dataset.assetId));
  expect(new Set(ids).size).toBe(36);
  await page.locator('#picker-close').click();
  await page.locator('[data-control="background"] .library-button').click();
  await expect(page.locator('#picker-filter')).toHaveValue(largest.label);
  await expect(page.locator('#picker-grid .asset-item')).toHaveCount(36);
  await page.locator('#picker-search').fill('no-such-material-qa-987654321');
  await expect(page.locator('#picker-grid .asset-item')).toHaveCount(0);
  await expect(page.locator('#picker-meta')).toHaveText(`找到 0 / ${result.counts.frames} 个素材`);
  await page.locator('#picker-search').fill('');
  await expect(page.locator('#picker-grid .asset-item')).toHaveCount(18);
  expect(log.legacyRequests).toEqual([]);
  expect(log.rawRequests).toEqual([]);
  expect(log.missing).toEqual([]);
  expect(log.errors).toEqual([]);
});

test('validated same-release indexes survive reload and a regional JSON network outage', async ({ page }) => {
  let offline = false;
  const log = await setup(page, { offline: path => offline && path.endsWith('.json') });
  await requireBothCatalogs(page);
  await switchRegion(page, 'jp');
  await playerName(page).fill('CACHE JP');
  await playerName(page).press('Tab');
  const stored = await page.evaluate(async () => {
    const cache = await caches.open('maimai-regional-index-v2:20261108');
    return (await cache.keys()).map(request => request.url);
  });
  expect(stored).toHaveLength(13);
  expect(stored.every(url => url.startsWith(RELEASE_URL))).toBe(true);
  offline = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loading')).toBeHidden();
  await expect(playerName(page)).toHaveValue('CACHE JP');
  await expect(page.locator('#region-status')).toContainText('离线索引');
  const result = await requireBothCatalogs(page);
  expect(result.sources).toEqual(['v2-cache', 'v2-cache', 'v2-cache']);
  await page.locator('[data-control="background"] .library-button').click();
  await expect(page.locator('#picker-grid .asset-item').first()).toBeVisible();
  await page.locator('#picker-close').click();
  await switchRegion(page, 'cn');
  await expect(playerName(page)).not.toHaveValue('CACHE JP');
  await switchRegion(page, 'jp');
  await expect(playerName(page)).toHaveValue('CACHE JP');
  expect(log.legacyRequests).toEqual([]);
  expect(log.rawRequests).toEqual([]);
  expect(log.missing).toEqual([]);
  expect(log.errors).toEqual([]);
});

for (const failure of ['corrupt digest', 'wrong region']) {
  test(`${failure} is rejected without fallback, partial caching or changing the current design`, async ({ page }) => {
    let wrongIndex;
    if (failure === 'wrong region') {
      const data = JSON.parse(await readReleaseFixture('catalogs/v2/jp/index.json'));
      data.region = 'cn';
      wrongIndex = Buffer.from(JSON.stringify(data));
    }
    const log = await setup(page, {
      transform({ path, body }) {
        if (failure === 'corrupt digest' && path === 'catalogs/v2/jp/frames.json') {
          const corrupt = Buffer.from(body);
          corrupt[0] = 91;
          return corrupt;
        }
        if (wrongIndex && path === 'catalogs/v2/jp/index.json') return wrongIndex;
        if (wrongIndex && path === 'index-v2.json') {
          const root = JSON.parse(body);
          Object.assign(root.regions.jp, refFor(wrongIndex));
          return Buffer.from(JSON.stringify(root));
        }
        return body;
      },
    });
    await playerName(page).fill('KEEP CN');
    await playerName(page).press('Tab');
    await expect(page.locator('#loading')).toBeHidden();
    const before = (await exported(page)).state;
    const pixels = await page.locator('#preview').evaluate(canvas => canvas.toDataURL());
    await page.locator('#region-select').selectOption('jp');
    await expect(page.locator('#region-select')).toBeEnabled();
    await expect(page.locator('#region-select')).toHaveValue('cn');
    await expect(page.locator('#region-status')).toContainText('已保留原搭配');
    await expect(page.locator('#region-status')).toContainText(failure === 'wrong region' ? '区服不匹配' : '摘要不匹配');
    expect((await exported(page)).state).toEqual(before);
    expect(await page.locator('#preview').evaluate(canvas => canvas.toDataURL())).toBe(pixels);
    const cacheUrls = await page.evaluate(async () => (await (await caches.open('maimai-regional-index-v2:20261108')).keys()).map(request => request.url));
    expect(cacheUrls.filter(url => url.includes('/jp/'))).toEqual([]);
    expect(log.legacyRequests).toEqual([]);
    expect(log.missing).toEqual([]);
    expect(log.errors).toEqual([]);
  });
}

test('legacy CN templates load and pinned GitHub JP templates migrate to COS without mixing scopes', async ({ page }) => {
  const oldCnPlate = 'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com/materials/nameplates/UI_Plate_450001%20%282%29.png';
  const legacy = JSON.stringify([{ id: 'old-cn', name: 'LEGACY CN', state: { playerName: 'OLD CN', ratingValue: 12345, files: { nameplate: oldCnPlate } } }]);
  await page.addInitScript(value => localStorage.setItem('maimai-diy-templates-v1', value), legacy);
  const log = await setup(page);
  await page.locator('#template-list').selectOption('legacy:old-cn');
  await page.locator('#template-load').click();
  await expect(playerName(page)).toHaveValue('OLD CN');
  const cn = (await exported(page)).state;
  expect(cn.files.nameplate).toBe(oldCnPlate);
  await switchRegion(page, 'jp');
  await expect(page.locator('#template-list')).not.toContainText('LEGACY CN');
  const jp = await exported(page);
  const oldArtRoot = 'https://raw.githubusercontent.com/basilomorireal/maimai-asset-browser/0ebcd319585af286bce5c31cc416fcf245e28428/assets/';
  const oldRatingRoot = 'https://raw.githubusercontent.com/saltcute/maidraw/a3a5027940519b6ff52831185177d58b71c404d2/assets/themes/maimai/best50/versionless/dxRating/jp/';
  jp.name = 'PINNED JP IMPORT';
  jp.state.playerName = 'MIGRATE';
  for (const key of ['background', 'nameplate', 'avatar'])
    jp.state.files[key] = jp.state.files[key].replace(`${RELEASE_URL}jp/collection/`, oldArtRoot);
  jp.state.files.ratingFrame = jp.state.files.ratingFrame.replace(`${RELEASE_URL}ui/maidraw/dxRating/jp/`, oldRatingRoot);
  await page.locator('#template-import').setInputFiles({ name: 'old-jp.maimai.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(jp)) });
  await expect(page.locator('#template-status')).toContainText('已导入并保存');
  await expect(playerName(page)).toHaveValue('MIGRATE');
  const migrated = (await exported(page)).state;
  for (const key of ['background', 'nameplate', 'avatar', 'ratingFrame'])
    expect(migrated.files[key].startsWith(RELEASE_URL)).toBe(true);
  await switchRegion(page, 'cn');
  expect((await exported(page)).state).toEqual(cn);
  await expect(page.locator('#template-list')).toContainText('LEGACY CN');
  await expect(page.locator('#template-list')).not.toContainText('PINNED JP IMPORT');
  await switchRegion(page, 'jp');
  await expect(playerName(page)).toHaveValue('MIGRATE');
  await expect(page.locator('#template-list')).toContainText('PINNED JP IMPORT');
  expect(await page.evaluate(() => localStorage.getItem('maimai-diy-templates-v1'))).toBe(legacy);
  expect(log.legacyRequests).toEqual([]);
  expect(log.rawRequests).toEqual([]);
  expect(log.missing).toEqual([]);
  expect(log.errors).toEqual([]);
});

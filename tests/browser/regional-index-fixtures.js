import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export const RELEASE_URL =
  'https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com/materials/regions/releases/20261108/';

function contentType(path) {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

export async function readReleaseFixture(path) {
  const base = path === 'index-v2.json' || path.startsWith('catalogs/v2/')
    ? process.env.MAIMAI_TEST_INDEX_ROOT
    : process.env.MAIMAI_TEST_RELEASE_ROOT;
  if (!base) throw new Error('Regional fixture directory is not configured');
  const root = resolve(base);
  const file = resolve(root, path);
  if (!file.startsWith(root + sep)) throw new Error('Invalid regional fixture path');
  return readFile(file);
}

// Mirrors contain source-identical public assets only. These routes do not prove
// the corresponding objects have been uploaded or are publicly reachable.
export async function installCosFixtures(context, { transform, offline = () => false } = {}) {
  const requests = [];
  const missing = [];
  await context.route('https://maimai-diy-assets-1517578456.cos.ap-shanghai.myqcloud.com/**', async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (!process.env.MAIMAI_TEST_COS_ROOT) {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
      return;
    }
    try {
      const path = new URL(url).pathname;
      const releasePath = url.startsWith(RELEASE_URL) ? url.slice(RELEASE_URL.length) : null;
      if (releasePath !== null && offline(releasePath)) {
        await route.abort('internetdisconnected');
        return;
      }
      const body = releasePath !== null && process.env.MAIMAI_TEST_RELEASE_ROOT
        ? await readReleaseFixture(releasePath)
        : await readFile(resolve(process.env.MAIMAI_TEST_COS_ROOT, '.' + path));
      const result = transform ? await transform({ path: releasePath, body }) : body;
      await route.fulfill({
        body: result,
        contentType: contentType(path),
        headers: { 'access-control-allow-origin': '*' },
      });
    } catch (error) {
      missing.push({ url, error: error.message });
      await route.abort();
    }
  });
  return { requests, missing };
}

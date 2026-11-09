import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REGION_BASE_URL, REGION_CATEGORIES, REGION_RELEASE_ID, REGION_RELEASE_ROOT,
  makeCategoryIndex, validateLegacyCatalog, validateRegionIndex, validateReleaseIndex, validateReleaseLocation,
} from '../src/region-index.js';

export const encodeIndex = data => Buffer.from(`${JSON.stringify(data, null, 2)}\n`, 'utf8');
export function indexReference(path, bytes, count) {
  return { path, ...(count === undefined ? {} : { count }), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
export function buildRegionalIndex({ catalogs, releaseId = REGION_RELEASE_ID, baseUrl = REGION_BASE_URL }) {
  validateReleaseLocation(releaseId, baseUrl);
  const files = new Map();
  const regions = {};
  const counts = {};
  for (const region of ['cn', 'jp']) {
    const source = catalogs[region];
    // Validates source metadata, IDs and charts before producing any output.
    validateLegacyCatalog(source, { region, releaseId, baseUrl });
    const categories = {};
    counts[region] = {};
    for (const category of REGION_CATEGORIES) {
      // Unlike the explicit browser fallback, the release builder accepts only
      // staging's exact COS URLs, never old/raw or foreign-origin artwork.
      const shard = makeCategoryIndex(source[category], { releaseId, region, category, baseUrl });
      const path = `catalogs/v2/${region}/${category}.json`;
      const bytes = encodeIndex(shard);
      files.set(path, bytes);
      categories[category] = indexReference(path, bytes, shard.count);
      counts[region][category] = shard.count;
    }
    const index = validateRegionIndex({
      schemaVersion: 2, kind: 'region-index', releaseId, region,
      version: source.version, generatedAt: source.generatedAt, sources: source.sources,
      availability: source.availability,
      ...(source.classification ? { classification: source.classification } : {}), categories,
    }, { releaseId, region });
    const path = `catalogs/v2/${region}/index.json`;
    const bytes = encodeIndex(index);
    files.set(path, bytes);
    regions[region] = indexReference(path, bytes);
  }
  const root = validateReleaseIndex({ schemaVersion: 2, kind: 'regional-release', releaseId, baseUrl, regions }, { releaseId, baseUrl });
  files.set('index-v2.json', encodeIndex(root));
  return { root, counts, files };
}
const schemaReadme = `# Regional index v2\n\nAll paths are relative to the immutable release root. No images are copied or transformed.\n\n- index-v2.json: schemaVersion=2, kind=regional-release, releaseId, baseUrl, and cn/jp region references.\n- catalogs/v2/{region}/index.json: kind=region-index, releaseId, region, version, generatedAt, sources, availability, optional classification provenance, and five category references.\n- catalogs/v2/{region}/{category}.json: kind=region-category, releaseId, region, category, count, order, byId, groups.\n- Each reference is {path, sha256, bytes}; category references also contain count. Digests and sizes cover the entire UTF-8 file, including its final newline.\n- Each item keeps its original id and all metadata except image, replaced by a safe release-relative path. order contains string lookup keys (the original id type is retained in the item).\n- groups is [{label, ids}]. Each item appears exactly once in order and exactly once across groups; labels come from the original group, genre, category, or 来源未分类. Classification provenance and charts are unchanged.\n- JP artwork is confined to jp/collection/{frames,plates,icons,charas}/. Regional songs use shared/saltmeta/covers/ but their regional chart metadata is never merged. CN artwork categories remain empty.\n- The browser verifies bytes and SHA-256 before parsing referenced JSON, then validates schema, IDs, groups, paths, region and release before use. Root is pinned by its immutable HTTPS release URL.\n- CacheStorage uses maimai-regional-index-v2:<releaseId>. Only validated chains are written. Offline loading reads and validates the complete chain from this release; missing cache uses the complete bundled v1 catalog, never a mixture. Invalid v2 content is an error, not a successful fallback.\n- Returned sourceStatus distinguishes v2-network, v2-cache and v1-fallback. No large catalogs are written to localStorage.\n\nPublish category files first, then region indexes, then index-v2.json last. Do not overwrite an existing published release with different bytes. Original v1 catalogs remain available for explicit compatibility.\n`;
export async function generateRegionalIndex({ inputDir, outputDir, releaseId = REGION_RELEASE_ID, baseUrl = `${REGION_RELEASE_ROOT}${releaseId}/` }) {
  const catalogs = {};
  for (const region of ['cn', 'jp']) catalogs[region] = JSON.parse(await readFile(join(inputDir, `${region}.json`), 'utf8'));
  const result = buildRegionalIndex({ catalogs, releaseId, baseUrl });
  const prefix = `regions/releases/${releaseId}/`;
  const manifest = { schemaVersion: 2, releaseId, baseUrl, counts: result.counts, files: [] };
  result.files.set('catalogs/v2/README.md', Buffer.from(schemaReadme, 'utf8'));
  for (const [path, bytes] of result.files) {
    const relativePath = `${prefix}${path}`;
    const destination = join(outputDir, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    manifest.files.push({ ...indexReference(relativePath, bytes), cosKey: `materials/${relativePath}`, contentType: path.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8' });
  }
  await writeFile(join(outputDir, 'manifest.json'), encodeIndex(manifest));
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!['--input', '--output', '--release', '--base-url'].includes(flag) || !args[i + 1])
      throw new Error('Usage: node tools/build-region-index.mjs --input CATALOG_DIR --output OUTPUT_DIR [--release YYYYMMDD] [--base-url URL]');
    options[flag] = args[i + 1];
  }
  if (!options['--input'] || !options['--output']) throw new Error('--input and --output are required');
  const manifest = await generateRegionalIndex({ inputDir: resolve(options['--input']), outputDir: resolve(options['--output']), releaseId: options['--release'] || REGION_RELEASE_ID, baseUrl: options['--base-url'] || `${REGION_RELEASE_ROOT}${options['--release'] || REGION_RELEASE_ID}/` });
  console.log(JSON.stringify({ output: resolve(options['--output']), counts: manifest.counts, files: manifest.files.length, bytes: manifest.files.reduce((total, file) => total + file.bytes, 0) }, null, 2));
}

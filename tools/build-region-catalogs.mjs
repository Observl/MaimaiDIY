#!/usr/bin/env node
// Offline, deterministic normalization of the inspected source snapshot.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = process.argv[2];
if (!sourceDir)
  throw new Error('Usage: node tools/build-region-catalogs.mjs <source-snapshot-directory>');
const outputDir = resolve(dirname(fileURLToPath(import.meta.url)), '../data/regions');
const read = async (path) => JSON.parse(await readFile(resolve(sourceDir, path), 'utf8'));
const [meta, manifest, saltTree, artTree, saltRef, artRef] = await Promise.all([
  read('SaltMeta/meta.next.unformatted.json'),
  read('maimai-asset-browser/manifest.json'),
  read('metadata/SaltMeta-files.json'),
  read('metadata/maimai-asset-browser-files.json'),
  read('metadata/SaltMeta-commit.json'),
  read('metadata/maimai-asset-browser-commit.json'),
]);
if (saltTree.truncated || artTree.truncated) throw new Error('Refusing incomplete source trees');
const snapshot = '2026-11-08';
const generatedAt = process.env.SOURCE_DATE_EPOCH
  ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : new Date().toISOString();
const commits = {
  salt: saltRef.commit,
  art: artRef.commit,
};
for (const commit of Object.values(commits)) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Source commit has not been verified');
}
const raw = (repo, commit, path) =>
  `https://raw.githubusercontent.com/${repo}/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
const saltPaths = new Set(saltTree.files.map((file) => file.path));
const manifestNames = new Map(manifest.assets.map((asset) => [asset.image, asset.name]));
const kinds = { frames: 'Frame', plates: 'Plate', icons: 'Icon', charas: 'Chara' };
const art = Object.fromEntries(
  Object.entries(kinds).map(([kind, singular]) => {
    const prefix = `assets/${kind}/`;
    return [
      kind,
      artTree.files
        .filter((file) => file.path.startsWith(prefix) && /\.png$/i.test(file.path))
        .sort((a, b) => a.path.localeCompare(b.path, 'en'))
        .map((file) => {
          const filename = file.path.slice(prefix.length).replace(/\.png$/i, '');
          const id = filename.replace(new RegExp(`^UI_${singular}_`), '');
          return {
            id,
            name: manifestNames.get(file.path)?.trim() || `${singular} ${id}`,
            image: raw(artTree.repo, commits.art, file.path),
          };
        }),
    ];
  })
);

function songsFor(region) {
  const songs = new Map();
  let missingCoverGroups = 0;
  for (const music of meta.musics) {
    if (!Number.isInteger(music.id) || music.id < 0) throw new Error('Invalid numeric music ID');
    // SaltMeta documents covers as the last four ID digits with a 00 prefix.
    const coverPath = `covers/00${String(music.id).padStart(6, '0').slice(-4)}.png`;
    const chartsByType = new Map();
    for (const chart of music.charts) {
      if (
        !['sd', 'dx'].includes(chart.type) ||
        !Number.isInteger(chart.difficulty) ||
        chart.difficulty < 0 ||
        chart.difficulty > 4
      )
        continue;
      // Next stores availability AND regional level/version together. Never fall back across regions.
      const data = chart.regions?.[region];
      if (data == null) continue;
      if (data.level == null) throw new Error(`Incomplete regional chart: ${music.id}, ${region}`);
      if (!chartsByType.has(chart.type)) chartsByType.set(chart.type, []);
      chartsByType
        .get(chart.type)
        .push({
          difficulty: chart.difficulty,
          level: String(data.level),
          version: data.version ?? null,
        });
    }
    for (const [type, charts] of chartsByType) {
      if (!saltPaths.has(coverPath)) {
        missingCoverGroups++;
        continue;
      }
      const id = `${music.id}:${type}`;
      if (songs.has(id)) throw new Error(`Duplicate song ID ${id}`);
      if (new Set(charts.map((chart) => chart.difficulty)).size !== charts.length)
        throw new Error(`Duplicate difficulty ${id}`);
      songs.set(id, {
        id,
        musicId: music.id,
        name: music.title,
        artist: music.artist,
        category: music.category,
        aliases: [
          ...new Set(
            Object.values(music.aliases || {})
              .flat()
              .filter((value) => typeof value === 'string')
          ),
        ],
        image: raw(saltTree.repo, commits.salt, coverPath),
        charts: charts.sort((a, b) => a.difficulty - b.difficulty),
      });
    }
  }
  return {
    songs: [...songs.values()].sort(
      (a, b) => a.musicId - b.musicId || a.id.localeCompare(b.id, 'en')
    ),
    missingCoverGroups,
  };
}

await mkdir(outputDir, { recursive: true });
for (const region of ['jp', 'cn']) {
  const { songs, missingCoverGroups } = songsFor(region);
  const sources = [
    {
      name: 'SaltMeta',
      url: `https://github.com/${saltTree.repo}`,
      commit: commits.salt,
      metadataPath: 'meta.next.unformatted.json',
      snapshotDate: snapshot,
      commitDate: saltRef.date,
      note: 'Regional chart metadata and original covers; snapshot counts are not a verified current playable song list.',
      excludedMissingCoverGroups: missingCoverGroups,
    },
  ];
  if (region === 'jp')
    sources.push({
      name: 'maimai-asset-browser',
      url: `https://github.com/${artTree.repo}`,
      commit: commits.art,
      snapshotDate: snapshot,
      commitDate: artRef.date,
      manifestGeneratedAt: manifest.generated,
      note: 'All actual PNG files in frames/plates/icons/charas; manifest names only where matched. Not proof of complete MAGiCAL art coverage.',
    });
  else
    sources.push({
      name: 'Resource CN1.55',
      snapshotDate: snapshot,
      status: 'unavailable',
      note: 'The supplied signed resource link returned HTTP 403. No CN artwork was imported and JP artwork is not substituted.',
    });
  const catalog = {
    schemaVersion: 1,
    region,
    version: region === 'jp' ? 'MAGiCAL' : '舞萌DX2026',
    generatedAt,
    sources,
    availability:
      region === 'jp'
        ? {
            art: 'partial',
            note: '已收录指定日服来源中全部实际 PNG；不代表 MAGiCAL 全量素材。曲目为来源地区标记快照，不保证当前均可游玩。',
          }
        : {
            art: 'unavailable',
            note: '国服 Resource CN1.55 链接返回 403，头像、名牌、背景及旅行伙伴暂缺，未混用日服素材。曲目按国服地区数据收录，不保证当前均可游玩。',
          },
    ...(region === 'jp' ? art : { frames: [], plates: [], icons: [], charas: [] }),
    songs,
  };
  for (const kind of [...Object.keys(kinds), 'songs']) {
    if (new Set(catalog[kind].map((item) => item.id)).size !== catalog[kind].length)
      throw new Error(`Duplicate ${kind} IDs`);
    for (const item of catalog[kind])
      if (!item.image.startsWith('https://')) throw new Error('Expected HTTPS image');
  }
  await writeFile(resolve(outputDir, `${region}.json`), JSON.stringify(catalog) + '\n');
  console.log(
    region,
    JSON.stringify(
      Object.fromEntries(
        [...Object.keys(kinds), 'songs'].map((kind) => [kind, catalog[kind].length])
      )
    ),
    `excluded without covers: ${missingCoverGroups}`
  );
}

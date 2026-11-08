// Build a small, reviewable picker policy from the inspected source evidence.
// This does not rewrite the immutable COS indexes or change saved-template rules.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateMaterialVisibility } from '../src/material-visibility.js';
const [input, output, genrePath] = process.argv.slice(2);
if (!input || !output || !genrePath) throw new Error('Usage: node tools/build-material-visibility.mjs <evidence.json> <output.json> <chara_genre_map.json>');
const evidence = JSON.parse(await readFile(input, 'utf8'));
const genreBytes = await readFile(genrePath);
const genreMap = JSON.parse(genreBytes).chara_map;
if (!genreMap || typeof genreMap !== 'object') throw new Error('Missing direct character-group records');
const groupedIds = Object.keys(genreMap);
if (groupedIds.some(id => !/^\d{6}$/.test(id))) throw new Error('Invalid direct character IDs');
const data = {
  schemaVersion: 1,
  snapshotDate: evidence.snapshotDate,
  sources: [...evidence.sources.map(({ id, url, sha256, basis, limitations }) => ({ id, url, sha256, basis, limitations })), {
    id: 'asset-browser-direct-character-groups',
    url: new URL('../chara_genre_map.json', evidence.sources.find(source => source.id === 'asset-browser-xml-charas').url).href,
    sha256: createHash('sha256').update(genreBytes).digest('hex'),
    basis: 'Direct character ID to named genre mapping, including four entries without XML names.',
    limitations: 'Identifies source records only; does not prove server availability or exclusivity.',
  }],
  cnReleased: Object.fromEntries(['frames', 'plates', 'icons', 'titles'].map(kind => [kind,
    Object.fromEntries(evidence.cn[kind].map(item => [item.id, item.release_date]))])),
  jpIdentified: { ...evidence.jpXmlNamed, charas: [...new Set([...evidence.jpXmlNamed.charas, ...groupedIds])].sort() },
  semantics: {
    cn: 'Positive dated distribution records; missing entries are unknown, not JP-exclusive.',
    jp: 'XML-named or directly genre-mapped source entries, including basic companions absent from the genre map. Not an official JP availability or exclusivity list.',
    shared: 'The same ID can remain selectable in both source-specific lists. IDs do not imply identical artwork; no images are substituted across regions.',
    compatibility: 'Only new picker choices are filtered. Saved designs and imported titles remain readable.',
  },
};
validateMaterialVisibility(data);
await writeFile(output, JSON.stringify(data) + '\n');
console.log('Wrote dated CN / identified-source JP picker policy; no exclusivity inferred.');

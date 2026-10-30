import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const dist = resolve(root, 'dist');
if (relative(root, dist) !== 'dist' || !dist.startsWith(root + sep))
  throw Error('Invalid build directory');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const publicFile = (path) =>
  /^(assets\/|materials\/|licenses\/|docs\/screenshots\/|BG\/Circle BG\/(?:live-assets\/|background.css$|preview.css$))/.test(
    path
  );
const files = new Set(tracked.filter(publicFile));
for (const file of [
  'index.html',
  'support.html',
  'styles.css',
  'ui-motion.css',
  'ui-motion.js',
  'app.js',
  'author-recommendations.js',
  'background-motion.js',
  'sw.js',
])
  files.add(file);
for (const file of await readdir('src')) if (file.endsWith('.js')) files.add(`src/${file}`);
const hash = createHash('sha256');
for (const file of [...files].filter((file) => /\.(js|css)$/.test(file)).sort()) {
  hash.update(file);
  hash.update(await readFile(file).catch(() => ''));
}
const revision = hash.digest('hex').slice(0, 12);
for (const file of files) {
  if (!(await stat(file).catch(() => null))?.isFile()) continue;
  const destination = resolve(dist, file);
  if (!destination.startsWith(dist + sep)) throw Error('Invalid public file');
  await mkdir(resolve(destination, '..'), { recursive: true });
  await cp(file, destination);
  if (file.endsWith('.js')) {
    const source = await readFile(destination, 'utf8');
    await writeFile(
      destination,
      source.replace(/(from\s+['"])(\.[^'"]+\.js)(?:\?[^'"]*)?(['"])/g, `$1$2?v=${revision}$3`)
    );
  } else if (file.endsWith('.html')) {
    const source = await readFile(destination, 'utf8');
    await writeFile(
      destination,
      source.replace(
        /((?:src|href)=")([^"?]+\.(?:js|css))(?:\?[^"\s]*)?(")/g,
        `$1$2?v=${revision}$3`
      )
    );
  }
}
await writeFile(resolve(dist, '.nojekyll'), '');
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (/^(?:https?:|data:)/.test(match[1])) continue;
  const path = decodeURIComponent(match[1].split('?')[0]);
  if (!(await stat(resolve(dist, path)).catch(() => null)))
    throw Error(`Missing public dependency: ${path}`);
}
console.log(
  `Built ${files.size} public files. Source tools, tests, raw captures and archived backgrounds stay out of the site.`
);

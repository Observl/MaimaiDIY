import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

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
  /^(licenses\/|BG\/Circle BG\/(?:live-assets\/|background.css$|preview.css$))/.test(
    path
  );
const files = new Set(tracked.filter(publicFile));
for (const file of [
  'index.html',
  'support.html',
  'custom-order.html',
  'checkout.html',
  'account.html',
  'orders.html',
  'after-sales.html',
  'orders-admin.html',
  'checkout.css',
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
hash.update(await readFile('package-lock.json'));
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
      source
        .replace(/(from\s+['"])(\.[^'"]+\.js)(?:\?[^'"]*)?(['"])/g, `$1$2?v=${revision}$3`)
        .replace(/(\bimport\(\s*['"])(\.[^'"]+\.js)(?:\?[^'"]*)?(['"]\s*\))/g, `$1$2?v=${revision}$3`)
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
// Ship the pinned 3D runtime on our own origin.
await mkdir(resolve(dist, 'vendor'), { recursive: true });
for (const [source, target] of [
  ['build/three.module.js', 'three.module.js'],
  ['build/three.core.js', 'three.core.js'],
  ['examples/jsm/controls/OrbitControls.js', 'OrbitControls.js'],
  ['examples/jsm/geometries/RoundedBoxGeometry.js', 'RoundedBoxGeometry.js'],
]) {
  const code = await readFile(resolve(root, 'node_modules/three', source), 'utf8');
  await writeFile(resolve(dist, 'vendor', target), code.replace(/from 'three'/g, "from './three.module.js'"));
}
await cp(resolve(root, 'node_modules/three/LICENSE'), resolve(dist, 'vendor/three-LICENSE.txt'));
// Bundle only the selected helpers, sharing exactly the site's Three.js instance.
await build({
  stdin:{contents:`export {default as CustomShaderMaterial} from 'three-custom-shader-material/vanilla';
    export {MeshTransmissionMaterial} from '@pmndrs/vanilla/materials/MeshTransmissionMaterial.js';
    export {getGPUTier} from '@pmndrs/detect-gpu';`,resolveDir:root,sourcefile:'render-extensions.js'},
  bundle:true,format:'esm',minify:true,target:'es2022',outfile:resolve(dist,'vendor/render-extensions.js'),
  plugins:[{name:'shared-three',setup(builder){builder.onResolve({filter:/^three$/},()=>({path:'./three.module.js',external:true}));}}],
});
await cp(resolve(root,'node_modules/@pmndrs/detect-gpu/dist/benchmarks'),resolve(dist,'vendor/gpu-benchmarks'),{recursive:true});
for(const [name,path] of [['custom-shader-material','three-custom-shader-material/LICENSE.md'],['drei-vanilla','@pmndrs/vanilla/LICENSE'],['detect-gpu','@pmndrs/detect-gpu/LICENSE']]) {
  const notice=await readFile(resolve(root,'node_modules',path),'utf8');
  await writeFile(resolve(dist,`vendor/${name}-LICENSE.txt`),notice);
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

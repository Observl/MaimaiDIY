import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='output/cloudbase-release/functions/commerce-api';
await mkdir(directory,{recursive:true});
await build({entryPoints:['cloudbase/commerce-api.mjs'],outfile:directory+'/index.js',platform:'node',target:'node20',format:'cjs',bundle:true,minify:false});
await writeFile(directory+'/package.json',JSON.stringify({name:'maimai-commerce-api',version:'1.0.0',private:true,main:'index.js'}));
console.log('Backend package built; no website or COS media included.');

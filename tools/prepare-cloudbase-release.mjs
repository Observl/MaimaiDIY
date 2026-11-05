import {readFile,writeFile} from 'node:fs/promises';
const secret=JSON.parse((await readFile('output/cloudbase-api-key.private.json','utf8')).replace(/^\uFEFF/,''));
if(!secret.data?.ApiKey)throw Error('Missing private server key');
const config={envId:'maimai-diy-d8go3owr74a7e260d',functionRoot:'functions',functions:[{name:'commerce-api',runtime:'Nodejs20.19',handler:'index.main',timeout:30,memorySize:512,installDependency:false,envVariables:{CLOUDBASE_ENV_ID:'maimai-diy-d8go3owr74a7e260d',CLOUDBASE_API_KEY:secret.data.ApiKey,ALLOWED_ORIGINS:'https://observl.github.io,http://127.0.0.1:9428'}}]};
await writeFile('output/cloudbase-release/cloudbaserc.json',JSON.stringify(config,null,2),{mode:0o600});
console.log('Private deployment configuration prepared; no secrets printed.');

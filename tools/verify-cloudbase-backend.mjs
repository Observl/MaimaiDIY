import {execFileSync} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createDefaultState} from '../src/model.js';
import {buildAcrylicDesignDraft} from '../src/product-catalog.js';
const env='maimai-diy-d8go3owr74a7e260d',origin='https://observl.github.io';
const cli=path.join(process.env.APPDATA,'npm/node_modules/@cloudbase/cli/bin/tcb');
const filename=path.resolve('output/cloudbase-qa-request.private.json');
const run=Date.now().toString(36),users=[],orderIds=[];
async function invoke(apiPath,body,session,extra={}){
  const event={httpMethod:body?'POST':'GET',path:apiPath,headers:{origin,'content-type':'application/json',...(session?{authorization:'Bearer '+session.token,'x-csrf-token':session.csrf}:{}),...extra},...(body?{body:JSON.stringify(body)}:{}),requestContext:{identity:{sourceIp:'qa-'+run}}};
  await writeFile(filename,JSON.stringify(event),{mode:0o600});
  const raw=execFileSync(process.execPath,[cli,'fn','invoke','commerce-api','-e',env,'-d','@'+filename,'--json'],{encoding:'utf8',maxBuffer:4*1024*1024,windowsHide:true});
  const value=JSON.parse(raw);const result=JSON.parse(value.data.RetMsg);return {status:result.statusCode,data:JSON.parse(result.body)};
}
const key=JSON.parse((await readFile('output/cloudbase-api-key.private.json','utf8')).replace(/^\uFEFF/,'')).data.ApiKey;
async function remove(table,query){const response=await fetch(`https://${env}.api.tcloudbasegateway.com/v1/rdb/rest/${table}?${query}`,{method:'DELETE',headers:{Authorization:'Bearer '+key}});if(!response.ok)throw Error('QA cleanup failed for '+table);}
try{
  assert.equal((await invoke('/api/health')).data.mode,'cloudbase');
  assert.equal((await invoke('/api/orders')).status,401);
  const register=async suffix=>{const result=await invoke('/api/auth/register',{username:'qa_'+run+'_'+suffix,password:'qa-only-'+run+'-password'});assert.equal(result.status,200,JSON.stringify(result.data));users.push(result.data.user.id);return result.data;};
  const a=await register('a'),b=await register('b');
  const draft=structuredClone(buildAcrylicDesignDraft({state:createDefaultState(),variant:'effect',quantity:1}));draft.quote.totalFen=1;
  const payload={requestId:'f'.repeat(64),draft,shipping:{name:'自动验收虚构用户',phone:'13800000000',address:'仅用于迁移验收的虚构地址'},rightsConfirmed:true};
  const created=await invoke('/api/orders',payload,a);assert.equal(created.status,201,JSON.stringify(created.data));const id=created.data.id;orderIds.push(id);assert.equal(created.data.draft.quote.totalFen,4990);
  assert.equal((await invoke('/api/orders',payload,a)).data.id,id);
  assert.equal((await invoke('/api/orders/'+id,undefined,b)).status,404);
  assert.deepEqual((await invoke('/api/orders',undefined,b)).data.orders,[]);
  assert.equal((await invoke('/api/orders/'+id+'/pack',undefined,b)).status,404);
  assert.equal((await invoke('/api/orders/'+id+'/actions',{action:'pay'},a)).status,503);
  assert.equal((await invoke('/api/auth/logout',{},a,{'x-csrf-token':'bad'})).status,403);
  assert.equal((await invoke('/api/orders/'+id+'/actions',{action:'cancel'},a)).data.status,'cancelled');
  assert.equal((await invoke('/api/auth/logout',{},a)).status,200);
  assert.equal((await invoke('/api/orders',undefined,a)).status,401);
  console.log('Cloud backend verified: registration, database persistence, owner isolation, idempotent order creation, server pricing, payment disabled, CSRF, cancellation, logout.');
}finally{
  for(const id of orderIds){await remove('commerce_order_items','order_id=eq.'+id);await remove('commerce_orders','id=eq.'+id);}
  for(const id of users){await remove('commerce_sessions','user_id=eq.'+id);await remove('commerce_users','id=eq.'+id);}
  await writeFile(filename,'{}');
  console.log('Only this run’s temporary QA users and orders removed; migrated data retained.');
}

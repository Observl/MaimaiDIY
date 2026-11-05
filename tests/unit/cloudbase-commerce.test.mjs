import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommerceApi} from '../../cloudbase/commerce-api.mjs';
import {createDefaultState} from '../../src/model.js';
import {buildAcrylicDesignDraft} from '../../src/product-catalog.js';
const origin='https://observl.github.io';
function fixture(){
  const users=new Map(),sessions=new Map(),orders=new Map();
  const rpc=async(op,a)=>{
    if(op==='throttle')return {allowed:true};
    if(op==='register'){const u={id:a.id,username:a.username,salt:a.salt,password_hash:a.passwordHash};users.set(a.username,u);return {id:u.id,username:u.username};}
    if(op==='user')return users.get(a.username)||null;
    if(op==='session_create'){const u=[...users.values()].find(u=>u.id===a.userId);sessions.set(a.hash,{user:{id:u.id,username:u.username},csrf:a.csrf});return {};}
    if(op==='session_get')return sessions.get(a.hash)||null;
    if(op==='logout'){sessions.delete(a.hash);return {};}
    if(op==='order_create'){orders.set(a.order.id,{...a.order,owner:a.userId});return a.order;}
    if(op==='orders_list')return [...orders.values()].filter(o=>o.owner===a.userId).map(({id,status})=>({id,status}));
    if(op==='order_get'){const o=orders.get(a.id);return o?.owner===a.userId?o:null;}
    throw Error('Unexpected RPC operation');
  };
  const api=createCommerceApi({rpc,origins:[origin]});
  const request=async(path,body,session,extra={})=>{const response=await api({httpMethod:body?'POST':'GET',path,headers:{origin,'content-type':'application/json',...(session?{authorization:'Bearer '+session.token,'x-csrf-token':session.csrf}:{}),...extra},body:body?JSON.stringify(body):undefined,requestContext:{identity:{sourceIp:'local-test'}}});return {status:response.statusCode,data:JSON.parse(response.body),headers:response.headers};};
  return {api,request};
}
test('CloudBase API verifies identity, isolates orders, recalculates totals and disables simulated pay',async()=>{
  const {request}=fixture();const one=(await request('/api/auth/register',{username:'buyer_one',password:'testing-password-123'})).data;
  const two=(await request('/api/auth/register',{username:'buyer_two',password:'testing-password-123'})).data;
  assert.equal((await request('/api/orders')).status,401);
  const draft=structuredClone(buildAcrylicDesignDraft({state:createDefaultState(),variant:'effect',quantity:1}));draft.quote.totalFen=1;
  const created=await request('/api/orders',{requestId:'b'.repeat(64),draft,shipping:{name:'测试姓名',phone:'13800000000',address:'虚构测试收货地址'},rightsConfirmed:true},one);
  assert.equal(created.status,201);assert.equal(created.data.draft.quote.totalFen,4990);
  assert.equal((await request('/api/orders/'+created.data.id,undefined,two)).status,404);
  assert.deepEqual((await request('/api/orders',undefined,two)).data.orders,[]);
  assert.equal((await request('/api/orders/'+created.data.id+'/actions',{action:'pay'},one)).status,503);
  assert.equal((await request('/api/orders/'+created.data.id+'/actions',{action:'approve'},one)).status,403);
  assert.equal((await request('/api/auth/logout',{},one,{'x-csrf-token':'bad'})).status,403);
  assert.equal((await request('/api/auth/logout',{},one)).status,200);assert.equal((await request('/api/orders',undefined,one)).status,401);
});
test('CloudBase API rejects unauthorized origins and never echoes gateway credentials',async()=>{
  const {api,request}=fixture();assert.equal((await request('/api/auth/register',{username:'buyer_x',password:'testing-password-123'},null,{origin:'https://evil.example'})).status,403);
  const r=await api({httpMethod:'GET',path:'/api/health',headers:{'x-cloudbase-context':'sensitive-value',origin}});assert.ok(!JSON.stringify(r).includes('sensitive-value'));assert.equal(r.headers['Access-Control-Allow-Origin'],origin);
});

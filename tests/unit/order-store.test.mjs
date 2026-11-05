import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderStore } from '../../server/order-store.mjs';
import { createDefaultState } from '../../src/model.js';
import { buildAcrylicDesignDraft } from '../../src/custom-order.js';
import {mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const token='a'.repeat(64);
function input(){return {draft:buildAcrylicDesignDraft({state:createDefaultState(),variant:'effect',quantity:1}),shipping:{name:'演示用户',phone:'13800000000',address:'仅用于本机演示的收货地址'},rightsConfirmed:true};}
test('orders freeze designs, recalculate totals, deduplicate retries and enforce ownership',()=>{
  const store=createOrderStore();try{
    const data=structuredClone(input());data.draft.quote.totalFen=1;const order=store.create(data,token);assert.equal(order.draft.quote.totalFen,4990);
    assert.equal(store.create(data,token).id,order.id);data.shipping.name='另一用户';assert.throws(()=>store.create(data,token),/其他订单/);
    assert.throws(()=>store.get(order.id,'b'.repeat(64)),/凭据/);assert.throws(()=>store.act(order.id,token,'ship'),/权限/);assert.throws(()=>store.pack(order.id,token),/审核/);
    assert.equal(store.act(order.id,token,'pay').payment.amountFen,4990);assert.equal(store.act(order.id,token,'pay').events.length,2);
    assert.throws(()=>store.act(order.id,token,'approve'),/权限/);
    assert.throws(()=>store.adminAct(order.id,'approve'),/审核/);store.adminAct(order.id,'approve',{reviewConfirmed:true});assert.equal(store.pack(order.id,token).productionReady,false);
    assert.throws(()=>store.createBatch({sku:'acrylic-brick:effect'}),/10 件/);assert.equal(store.batches().length,0);
    store.createBatch({sku:'acrylic-brick:effect',force:true,reason:'单件本地测试'});assert.throws(()=>store.adminAct(order.id,'ship',{tracking:'REAL-123'}),/DEMO/);
    store.adminAct(order.id,'ship',{tracking:'DEMO-123'});assert.equal(store.act(order.id,token,'complete').status,'completed');assert.throws(()=>store.act(order.id,token,'cancel'),/未付款/);
  }finally{store.close();}
});

test('batches separate specs, count units and wait for every item in a mixed order',()=>{
 const store=createOrderStore();try{
  const data=input();data.draft=buildAcrylicDesignDraft({state:createDefaultState(),variant:'effect',quantity:10,cardQuantity:10,shikishiQuantity:10,accessory:'clearStand'});
  const order=store.create(data,token);assert.equal(store.queue().length,0);store.act(order.id,token,'pay');assert.equal(store.queue().length,0);store.adminAct(order.id,'approve',{reviewConfirmed:true});
  assert.equal(store.queue().length,3);assert.ok(store.queue().every(g=>g.quantity===10&&g.ready));
  const batch=store.createBatch({sku:'acrylic-brick:effect'});assert.equal(store.get(order.id,token).status,'approved');assert.equal(store.queue().length,2);
  assert.throws(()=>store.createBatch({sku:'acrylic-brick:effect'}),/没有待生产/);
  assert.throws(()=>store.adminAct(order.id,'ship',{tracking:'DEMO-123'}),/状态/);
  const pack=store.batchPack(batch.id);assert.equal(pack.orders[0].shipping.name,data.shipping.name);assert.deepEqual(pack.orders[0].items.map(item=>item.type),['acrylic-brick','clear-stand']);assert.equal(pack.productionReady,false);
  store.createBatch({sku:'holographic-card'});store.createBatch({sku:'shikishi'});assert.equal(store.get(order.id,token).status,'producing');assert.equal(store.queue().length,0);
  assert.equal(store.batches().length,3);assert.equal(store.get(order.id,token).events.filter(e=>e.batchId).length,3);
 }finally{store.close();}
});

test('basic and effect bricks do not combine to meet the ten-unit threshold',()=>{
 const store=createOrderStore();try{for(const [i,variant]of ['basic','effect'].entries()){
  const data=input();data.draft=buildAcrylicDesignDraft({state:createDefaultState(),variant,quantity:5});const access=String(i+1).repeat(64);const order=store.create(data,access);store.act(order.id,access,'pay');store.adminAct(order.id,'approve',{reviewConfirmed:true});
 }assert.equal(store.queue().length,2);assert.ok(store.queue().every(g=>g.quantity===5&&!g.ready));assert.throws(()=>store.createBatch({sku:'acrylic-brick:basic',force:true,reason:''}),/原因/);assert.equal(store.batches().length,0);
 }finally{store.close();}
});

test('orders and reserved batches survive reopening the database',()=>{
 const directory=mkdtempSync(join(tmpdir(),'maimai-order-')),path=join(directory,'orders.sqlite');let store=createOrderStore(path);
 try{const order=store.create(input(),token);store.act(order.id,token,'pay');store.adminAct(order.id,'approve',{reviewConfirmed:true});const batch=store.createBatch({sku:'acrylic-brick:effect',force:true,reason:'持久化测试排产'});store.close();store=createOrderStore(path);
  assert.equal(store.get(order.id,token).status,'producing');assert.equal(store.batchPack(batch.id).orders[0].orderId,order.id);assert.equal(store.batches().length,1);assert.equal(store.queue().length,0);
 }finally{store.close();for(const suffix of ['', '-wal','-shm']){try{unlinkSync(path+suffix);}catch(error){if(error.code!=='ENOENT')throw error;}}rmdirSync(directory);}
});
test('rejects incomplete addresses, missing consent and invalid asset URLs',()=>{
  const store=createOrderStore();try{let data=input();data.rightsConfirmed=false;assert.throws(()=>store.create(data,token),/权限/);data=input();data.shipping.address='';assert.throws(()=>store.create(data,token),/完整/);data=input();data.draft.design.files.avatar='https://evil.example/steal.png';assert.throws(()=>store.create(data,token),/素材地址/);}finally{store.close();}
});

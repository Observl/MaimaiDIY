import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderStore } from '../../server/order-store.mjs';
import { createDefaultState } from '../../src/model.js';
import { buildAcrylicDesignDraft } from '../../src/custom-order.js';
const token='a'.repeat(64);
function input(){return {draft:buildAcrylicDesignDraft({state:createDefaultState(),variant:'effect',quantity:1}),shipping:{name:'演示用户',phone:'13800000000',address:'仅用于本机演示的收货地址'},rightsConfirmed:true};}
test('orders freeze designs, recalculate totals, deduplicate retries and enforce ownership',()=>{
  const store=createOrderStore();try{
    const data=structuredClone(input());data.draft.quote.totalFen=1;const order=store.create(data,token);assert.equal(order.draft.quote.totalFen,4990);
    assert.equal(store.create(data,token).id,order.id);data.shipping.name='另一用户';assert.throws(()=>store.create(data,token),/其他订单/);
    assert.throws(()=>store.get(order.id,'b'.repeat(64)),/凭据/);assert.throws(()=>store.act(order.id,token,'ship'),/状态/);assert.throws(()=>store.pack(order.id,token),/审核/);
    assert.equal(store.act(order.id,token,'pay').payment.amountFen,4990);assert.equal(store.act(order.id,token,'pay').events.length,2);
    store.act(order.id,token,'approve');assert.equal(store.pack(order.id,token).productionReady,false);store.act(order.id,token,'produce');assert.throws(()=>store.act(order.id,token,'ship',{tracking:'REAL-123'}),/DEMO/);
    store.act(order.id,token,'ship',{tracking:'DEMO-123'});assert.equal(store.act(order.id,token,'complete').status,'completed');assert.throws(()=>store.act(order.id,token,'cancel'),/未付款/);
  }finally{store.close();}
});
test('rejects incomplete addresses, missing consent and invalid asset URLs',()=>{
  const store=createOrderStore();try{let data=input();data.rightsConfirmed=false;assert.throws(()=>store.create(data,token),/权限/);data=input();data.shipping.address='';assert.throws(()=>store.create(data,token),/完整/);data=input();data.draft.design.files.avatar='https://evil.example/steal.png';assert.throws(()=>store.create(data,token),/素材地址/);}finally{store.close();}
});

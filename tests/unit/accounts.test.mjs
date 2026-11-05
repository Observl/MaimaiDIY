import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountStore } from '../../server/accounts.mjs';
import { createOrderStore } from '../../server/order-store.mjs';
import { createDefaultState } from '../../src/model.js';
import { buildAcrylicDesignDraft } from '../../src/custom-order.js';
test('accounts hash passwords, normalize usernames, reject duplicates and revoke sessions',async()=>{
  const a=createAccountStore();try{
    const first=await a.register({username:'Buyer_A',password:'correct-horse-12345'},'test-a');
    assert.equal(first.user.username,'buyer_a');assert.equal(a.session(first.token).user.id,first.user.id);assert.equal(first.token.length,64);assert.ok(!JSON.stringify(first.user).includes('password'));
    await assert.rejects(a.register({username:'buyer_a',password:'correct-horse-12345'},'test-b'),/不可用/);
    await assert.rejects(a.login({username:'buyer_a',password:'incorrect-password'},'test-a'),/不正确/);
    const second=await a.login({username:'BUYER_A',password:'correct-horse-12345'},'test-a');
    await assert.rejects(a.changePassword(first.user.id,{currentPassword:'incorrect-password',newPassword:'another-password-123'},'test-a'),/不正确/);
    const changed=await a.changePassword(first.user.id,{currentPassword:'correct-horse-12345',newPassword:'another-password-123'},'test-a');
    assert.equal(a.session(first.token),null);assert.equal(a.session(second.token),null);assert.ok(a.session(changed.token));
    await assert.rejects(a.login({username:'buyer_a',password:'correct-horse-12345'},'test-a'),/不正确/);
    a.logout(changed.token);assert.equal(a.session(changed.token),null);
  }finally{a.close();}
});
test('invalid accounts and credential guessing are rejected',async()=>{
  const a=createAccountStore();try{
    await assert.rejects(a.register({username:'x',password:'long-password-123'},'invalid'),/用户名/);
    await assert.rejects(a.register({username:'valid_name',password:'short'},'invalid'),/密码/);
    for(let n=0;n<10;n++)await assert.rejects(a.login({username:'not_a_user',password:'wrong-password-123'},'guess'),/不正确/);
    await assert.rejects(a.login({username:'not_a_user',password:'wrong-password-123'},'guess'),error=>error.status===429);
    assert.equal(a.session('f'.repeat(64)),null);
  }finally{a.close();}
});
test('account ownership protects list, details, actions and production pack; guest orders cannot be claimed',()=>{
  const s=createOrderStore();try{
    const data={draft:buildAcrylicDesignDraft({state:createDefaultState(),variant:'effect',quantity:1}),shipping:{name:'测试买家',phone:'13800000000',address:'只在本地测试的收货地址'},rightsConfirmed:true};
    const one=s.create(data,'c'.repeat(64),'user-a'),two=s.create(data,'d'.repeat(64),'user-b'),guest=s.create(data,'e'.repeat(64));
    assert.deepEqual(s.listForUser('user-a').map(o=>o.id),[one.id]);assert.ok(!JSON.stringify(s.listForUser('user-a')).includes('13800000000'));
    for(const o of [two,guest]){assert.throws(()=>s.getForUser(o.id,'user-a'),error=>error.status===404);assert.throws(()=>s.actForUser(o.id,'user-a','cancel'),error=>error.status===404);assert.throws(()=>s.packForUser(o.id,'user-a'),error=>error.status===404);}
    assert.throws(()=>s.create(data,'c'.repeat(64),'user-b'),/其他订单/);
    assert.equal(s.actForUser(one.id,'user-a','pay').status,'paid_review');assert.throws(()=>s.actForUser(one.id,'user-a','approve'),/权限/);
    s.adminAct(one.id,'approve',{reviewConfirmed:true});assert.equal(s.packForUser(one.id,'user-a').orderId,one.id);
  }finally{s.close();}
});

import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { buildAcrylicDesignDraft } from '../src/custom-order.js';
import { sanitizeImportedState } from '../src/model.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const transitions = {pay:['pending_payment','paid_review'],approve:['paid_review','approved'],produce:['approved','producing'],ship:['producing','shipped'],complete:['shipped','completed']};
export function createOrderStore(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL, payload TEXT NOT NULL)');
  function save(order) { db.prepare('UPDATE orders SET payload=? WHERE id=?').run(JSON.stringify(order),order.id); return order; }
  function get(id, token) {
    const row=db.prepare('SELECT * FROM orders WHERE id=? AND token_hash=?').get(id,hash(String(token||'')));
    if(!row)fail('订单不存在或访问凭据无效',404);
    return JSON.parse(row.payload);
  }
  return {
    close:()=>db.close(), get,
    create(input, token) {
      if(!/^[a-f0-9]{64}$/.test(token||''))fail('缺少安全的订单访问凭据');
      const {draft,shipping,rightsConfirmed}=input||{};
      if(rightsConfirmed!==true)fail('请确认设计稿使用权限和定制信息');
      if(!draft?.product||!draft.design)fail('缺少定制方案');
      const clean={};
      for(const [key,min,max] of [['name',1,40],['phone',6,30],['address',6,240]]) {
        const value=shipping?.[key];
        if(typeof value!=='string'||value.trim().length<min||value.length>max)fail('请填写完整的收货姓名、电话和地址');
        clean[key]=value.trim();
      }
      const p=draft.product;
      // Demo discounts are disabled until a real customer entitlement service exists.
      const frozen=buildAcrylicDesignDraft({state:sanitizeImportedState(draft.design),variant:p.variant||'effect',quantity:p.quantity,accessory:p.accessory,cardQuantity:p.cardQuantity,shikishiQuantity:p.shikishiQuantity,newCustomer:false});
      const fingerprint=hash(JSON.stringify({frozen,shipping:clean}));
      const old=db.prepare('SELECT * FROM orders WHERE token_hash=?').get(hash(token));
      if(old) {if(old.request_hash!==fingerprint)fail('该提交凭据已用于其他订单，请重新确认方案',409);return JSON.parse(old.payload);}
      const now=new Date().toISOString();
      const order={id:randomUUID(),mode:'demo',status:'pending_payment',createdAt:now,draft:frozen,shipping:clean,events:[{status:'pending_payment',at:now}],payment:null,tracking:null};
      db.prepare('INSERT INTO orders VALUES (?,?,?,?)').run(order.id,hash(token),fingerprint,JSON.stringify(order));
      return order;
    },
    act(id,token,action,input={}) {
      const order=get(id,token);
      if(action==='cancel') {if(order.status==='cancelled')return order;if(order.status!=='pending_payment')fail('仅未付款订单可取消',409);order.status='cancelled';}
      else {
        const step=transitions[action];if(!step)fail('未知订单操作');
        if(order.status===step[1])return order;
        if(order.status!==step[0])fail('当前订单状态不允许该操作',409);
        if(action==='ship') {
          if(typeof input.tracking!=='string'||!/^DEMO-[a-z0-9-]{3,60}$/i.test(input.tracking))fail('模拟运单须以 DEMO- 开头');
          order.tracking={carrier:'模拟物流',number:input.tracking};
        }
        if(action==='pay')order.payment={provider:'simulation',transactionId:'DEMO-'+randomBytes(8).toString('hex'),amountFen:order.draft.quote.totalFen};
        order.status=step[1];
      }
      order.events.push({status:order.status,at:new Date().toISOString()});return save(order);
    },
    pack(id,token) {
      const order=get(id,token);
      if(!['approved','producing','shipped','completed'].includes(order.status))fail('请先模拟付款并审核设计稿',409);
      return {format:'MaimaiDIY-demo-production-pack',version:1,orderId:id,mode:'demo',productionReady:false,warning:'仅供演示，出血、色彩、尺寸及工艺需与厂家确认；未发送至厂家。',draft:order.draft};
    }
  };
}

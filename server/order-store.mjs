import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { buildAcrylicDesignDraft } from '../src/custom-order.js';
import { sanitizeImportedState } from '../src/model.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const transitions = {pay:['pending_payment','paid_review'],approve:['paid_review','approved'],produce:['approved','producing'],ship:['producing','shipped'],complete:['shipped','completed']};
export function createOrderStore(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS production_batches (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  function save(order) { db.prepare('UPDATE orders SET payload=? WHERE id=?').run(JSON.stringify(order),order.id); return order; }
  function get(id, token) {
    const row=db.prepare('SELECT * FROM orders WHERE id=? AND token_hash=?').get(id,hash(String(token||'')));
    if(!row)fail('订单不存在或访问凭据无效',404);
    return JSON.parse(row.payload);
  }
  function all(){return db.prepare('SELECT payload FROM orders ORDER BY rowid DESC').all().map(row=>JSON.parse(row.payload));}
  function byId(id){const row=db.prepare('SELECT payload FROM orders WHERE id=?').get(id);if(!row)fail('订单不存在',404);return JSON.parse(row.payload);}
  const sku=item=>item.type==='acrylic-brick'?item.type+':'+item.variant:item.type;
  const productionItems=order=>order.draft.items.filter(item=>item.type!=='clear-stand');
  function transition(order,action,input={}) {
    if(action==='cancel'){if(order.status==='cancelled')return order;if(order.status!=='pending_payment')fail('仅未付款订单可取消',409);order.status='cancelled';}
    else {
      const step=transitions[action];if(!step)fail('未知订单操作');if(order.status===step[1])return order;
      if(order.status!==step[0])fail('当前订单状态不允许该操作',409);
      if(action==='approve'&&input.reviewConfirmed!==true)fail('请确认图稿、工艺及使用权限已审核');
      if(action==='produce')fail('请从按规格凑批队列建立生产批次',409);
      if(action==='ship'){
        if(typeof input.tracking!=='string'||!/^DEMO-[a-z0-9-]{3,60}$/i.test(input.tracking))fail('模拟运单须以 DEMO- 开头');
        order.tracking={carrier:'模拟物流',number:input.tracking};
      }
      if(action==='pay')order.payment={provider:'simulation',transactionId:'DEMO-'+randomBytes(8).toString('hex'),amountFen:order.draft.quote.totalFen};
      order.status=step[1];
    }
    order.events.push({status:order.status,at:new Date().toISOString(),actor:['pay','cancel','complete'].includes(action)?'customer':'operator'});return save(order);
  }
  return {
    close:()=>db.close(), get, list:all,
    queue(){
      const groups=new Map();for(const order of all().filter(o=>o.status==='approved'))for(const item of productionItems(order)){
        const key=sku(item);if(order.productionBatches?.[key])continue;
        const group=groups.get(key)||{sku:key,quantity:0,orderIds:[],oldestAt:order.createdAt,target:10};
        group.quantity+=item.quantity;group.orderIds.push(order.id);if(order.createdAt<group.oldestAt)group.oldestAt=order.createdAt;groups.set(key,group);
      }return [...groups.values()].map(group=>({...group,ready:group.quantity>=group.target}));
    },
    batches(){return db.prepare('SELECT payload FROM production_batches ORDER BY rowid DESC').all().map(row=>JSON.parse(row.payload));},
    adminAct(id,action,input={}){if(!['approve','ship'].includes(action))fail('不支持的运营操作');return transition(byId(id),action,input);},
    createBatch({sku:requested,force=false,reason=''}={}){
      if(typeof requested!=='string')fail('请选择生产规格');
      // Reserve whole order lines atomically; an order enters production only once all its SKUs are assigned.
      db.exec('BEGIN IMMEDIATE');try{
        const orders=all().filter(o=>o.status==='approved'&&!o.productionBatches?.[requested]&&productionItems(o).some(item=>sku(item)===requested));
        const quantity=orders.reduce((n,o)=>n+productionItems(o).filter(item=>sku(item)===requested).reduce((sum,item)=>sum+item.quantity,0),0);
        if(!quantity)fail('该规格没有待生产商品',409);
        if(quantity<10&&!(force===true&&typeof reason==='string'&&reason.trim().length>=4))fail('尚未凑满 10 件；提前生产须填写原因',409);
        const batch={id:randomUUID(),sku:requested,quantity,orderIds:orders.map(o=>o.id),createdAt:new Date().toISOString(),mode:'demo',overrideReason:quantity<10?reason.trim().slice(0,240):null};
        db.prepare('INSERT INTO production_batches VALUES (?,?)').run(batch.id,JSON.stringify(batch));
        for(const order of orders){order.productionBatches||={};order.productionBatches[requested]=batch.id;
          if(productionItems(order).every(item=>order.productionBatches[sku(item)]))order.status='producing';
          order.events.push({status:order.status,at:batch.createdAt,actor:'operator',batchId:batch.id,sku:requested});save(order);
        }db.exec('COMMIT');return batch;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    batchPack(id){
      const row=db.prepare('SELECT payload FROM production_batches WHERE id=?').get(id);if(!row)fail('生产批次不存在',404);
      const batch=JSON.parse(row.payload);return {format:'MaimaiDIY-factory-handoff',mode:'demo',productionReady:false,batch,
        warning:'仅供受授权厂家使用。包含收货信息，尚未实际发给厂家；印刷规格与样品需确认。',
        orders:batch.orderIds.map(orderId=>{const o=byId(orderId);return {orderId,shipping:o.shipping,design:o.draft.design,items:o.draft.items.filter(item=>sku(item)===batch.sku||(batch.sku.startsWith('acrylic-brick:')&&item.type==='clear-stand'))};})};
    },
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
      // Always recalculate the frozen order with the server's current unified catalog.
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
      const order=get(id,token);if(!['pay','cancel','complete'].includes(action))fail('该操作需要运营后台权限',403);return transition(order,action,input);
    },
    pack(id,token) {
      const order=get(id,token);
      if(!['approved','producing','shipped','completed'].includes(order.status))fail('请先模拟付款并审核设计稿',409);
      return {format:'MaimaiDIY-demo-production-pack',version:1,orderId:id,mode:'demo',productionReady:false,warning:'仅供演示，出血、色彩、尺寸及工艺需与厂家确认；未发送至厂家。',draft:order.draft};
    }
  };
}

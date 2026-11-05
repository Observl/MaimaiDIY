import { buildAcrylicDesignDraft } from './custom-order.js';
import { createRenderer } from './renderer.js';
import { createCollectibleMasks } from './collectible-masks.js';
import { FINISH_PARAMETERS, MASK_PARAMETERS } from './finish-settings.js';
import { customerRequest, customerSession, signInUrl, orderLabels } from './customer-api.js';

const $=id=>document.getElementById(id),storage=window.sessionStorage;
const labels={pending_payment:'待模拟付款',paid_review:'待审核设计',approved:'已审核，等待凑批',producing:'生产中（本地演示）',shipped:'已发货（本地演示）',completed:'订单已完成',cancelled:'已取消'};
const next={pending_payment:['pay','模拟付款'],shipped:['complete','确认收货（模拟）']};
const money=fen=>'¥'+(fen/100).toFixed(2);
let draft,order,credentials,account,cloudMode=false,previewVersion=0,busy=false;
const renderer=createRenderer($('design'));
function message(text,error=false){$('message').textContent=text;$('message').dataset.error=String(error);}
async function request(path,method='GET',data) {
  try{return await customerRequest(path,method,data);}catch(error){if(error.status===401)location.assign(signInUrl('checkout.html'+(order?'?id='+order.id:'')));throw error;}
}
function safe(action){return async()=>{if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await action();}catch(error){message(error.message,true);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}};}
async function renderDesign(state){const version=++previewVersion;try{await renderer.render(state,{strict:true});if(version===previewVersion)message('方案已载入。');}catch{message('部分素材无法载入，暂不能生成生产图。订单状态仍可演示。',true);}}
function displayDraft(value) {
  draft=value;$('items').replaceChildren();
  const names={'acrylic-brick':'亚克力砖','clear-stand':'透明底座','holographic-card':'镭射票',shikishi:'色纸'};
  for(const item of draft.items){const row=document.createElement('div');row.className='item';const name=document.createElement('span'),price=document.createElement('span');name.textContent=`${names[item.type]}${item.variant==='effect'?' · 特效款':item.variant==='basic'?' · 基础款':''} × ${item.quantity}`;price.textContent=money(item.totalFen);row.append(name,price);$('items').append(row);}
  const row=document.createElement('div');row.className='item';row.textContent='运费 '+money(draft.quote.shippingFen);$('items').append(row);
  if(draft.quote.comboDiscountFen){const discount=document.createElement('p');discount.textContent='组合优惠 −'+money(draft.quote.comboDiscountFen);$('items').append(discount);}
  $('total').textContent=money(draft.quote.totalFen);renderDesign(draft.design);
}
function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',safe(action));return b;}
function download(name,blob){const link=document.createElement('a');link.className='download';link.textContent=name;link.download=name;link.href=URL.createObjectURL(blob);$('downloads').append(link);}
async function productionPack(){
  const pack=await request(`/api/orders/${order.id}/pack`);message('正在计算生产图与白色蒙版…');
  await renderer.render(pack.draft.design,{strict:true});const masks=await createCollectibleMasks(pack.draft.design);
  const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('图片生成失败')),'image/png'));
  // Match all print/mask dimensions exactly so their registration stays aligned.
  const print=document.createElement('canvas');print.width=masks.uv.width;print.height=masks.uv.height;
  print.getContext('2d').drawImage(renderer.renderCanvas,0,0,print.width,print.height);
  const artifacts=await Promise.all([png(print),png(masks.uv),png(masks.powder)]);
  pack.finishParameters=structuredClone(FINISH_PARAMETERS);pack.maskParameters=structuredClone(MASK_PARAMETERS);
  pack.files=['print.png','uv-white-mask.png','powder-white-mask.png'];pack.maskConvention='white = effect, black = none';
  pack.imagePixels={width:print.width,height:print.height};
  pack.maskApplicability={basicAcrylic:false,effectAcrylic:true,shikishi:true,holographicCard:'reference-only; no mirror UV'};
  pack.note='蒙版与设计在本机实时生成，未上传厂家；背景闪粉与珠光使用参数映射，非独立印刷蒙版。';
  $('downloads').querySelectorAll('a').forEach(a=>URL.revokeObjectURL(a.href));$('downloads').replaceChildren();
  pack.files.forEach((name,i)=>download(name,artifacts[i]));download('production-manifest.json',new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}));message('演示生产文件已生成，请逐项下载。');
}
function displayOrder(value){
  order=value;displayDraft(order.draft);$('shipping-form').hidden=true;$('order').hidden=false;
  $('status').textContent=(cloudMode?orderLabels:labels)[order.status];$('order-id').textContent='订单 '+order.id;
  $('shipping-summary').textContent=[order.shipping.name,order.shipping.phone,order.shipping.address].join(' · ');
  $('timeline').replaceChildren();for(const event of order.events){const li=document.createElement('li');li.textContent=`${(cloudMode?orderLabels:labels)[event.status]} · ${new Date(event.at).toLocaleString()}`;$('timeline').append(li);}
  if(order.payment){const li=document.createElement('li');li.textContent='模拟交易号 '+order.payment.transactionId;$('timeline').append(li);}
  if(order.tracking){const li=document.createElement('li');li.textContent='模拟运单 '+order.tracking.number;$('timeline').append(li);}
  $('actions').replaceChildren();
  $('actions').append(button('刷新订单状态',async()=>displayOrder(await request(`/api/orders/${order.id}`))));
  if(next[order.status]&&!(cloudMode&&order.status==='pending_payment')){const [action,label]=next[order.status];$('actions').append(button(cloudMode?'确认收货':label,async()=>displayOrder(await request(`/api/orders/${order.id}/actions`,'POST',{action,...(action==='ship'?{tracking:'DEMO-'+order.id.slice(0,8)}:{})}))));}
  if(order.status==='pending_payment')$('actions').append(button('取消订单',async()=>displayOrder(await request(`/api/orders/${order.id}/actions`,'POST',{action:'cancel'}))));
  if(['approved','producing','shipped','completed'].includes(order.status))$('actions').append(button('生成设计稿和工艺蒙版',productionPack));
  message(cloudMode?'订单已保存。微信和支付宝支付暂未开通，当前无法付款。':'本地模拟订单已保存；刷新本页可继续。');
}
$('shipping-form').addEventListener('submit',event=>{event.preventDefault();safe(async()=>{
  if(!account)throw Error('请先登录后购买');
  if(!credentials){credentials={requestId:Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''),ownerId:account.id};storage.setItem('maimai-order-access',JSON.stringify(credentials));}
  const fields=new window.FormData(event.currentTarget);const value=await request('/api/orders','POST',{draft,requestId:credentials.requestId,shipping:Object.fromEntries(['name','phone','address'].map(key=>[key,fields.get(key)])),rightsConfirmed:fields.get('rights')==='on'});
  credentials.id=value.id;storage.setItem('maimai-order-access',JSON.stringify(credentials));window.history.replaceState(null,'','checkout.html?id='+value.id);displayOrder(value);
})();});
$('reset').addEventListener('click',()=>{storage.removeItem('maimai-order-access');location.assign('custom-order.html');});
async function init(){try{
  const health=await request('/api/health');if(!['demo','cloudbase'].includes(health.mode))throw Error('订单服务暂不可用');cloudMode=health.mode==='cloudbase';
  if(cloudMode){document.querySelector('.tag').textContent='订单服务 · 支付暂未开通';document.querySelector('footer').textContent='订单保存于 CloudBase。微信和支付宝支付尚未接通，当前无法付款，不会安排生产。';$('shipping-form').querySelector('[type="submit"]').textContent='保存订单';}
  const session=await customerSession();account=session.user;
  const requested=new URLSearchParams(location.search).get('id');
  if(!account){$('shipping-form').hidden=true;location.replace(signInUrl('checkout.html'+(requested&&/^[a-f0-9-]{36}$/.test(requested)?'?id='+requested:'')));return;}
  credentials=JSON.parse(storage.getItem('maimai-order-access')||'null');
  if(credentials?.ownerId!==account.id){credentials=null;storage.removeItem('maimai-order-access');}
  if(requested){if(!/^[a-f0-9-]{36}$/.test(requested))throw Error('订单编号不正确');displayOrder(await request('/api/orders/'+requested));return;}
  if(credentials?.id){displayOrder(await request('/api/orders/'+credentials.id));return;}
  const pending=JSON.parse(storage.getItem('maimai-order-pending')||'null');if(!pending)throw Error('请先返回选购页面，选择商品并点击“体验订单流程”。');
  const p=pending.product;displayDraft(buildAcrylicDesignDraft({state:pending.design,...p,variant:p.variant||'effect',newCustomer:false}));
}catch(error){message(error.message,true);$('shipping-form').hidden=true;}}
init();
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
document.addEventListener('visibilitychange',async()=>{
  if(document.hidden||!account)return;
  try{const current=await customerSession();if(current.user?.id!==account.id)location.reload();}catch{message('登录状态暂时无法确认，请刷新后重试。',true);}
});

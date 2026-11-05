import { buildAcrylicDesignDraft } from './custom-order.js';
import { createRenderer } from './renderer.js';
import { createCollectibleMasks } from './collectible-masks.js';
import { FINISH_PARAMETERS, MASK_PARAMETERS } from './finish-settings.js';

const $=id=>document.getElementById(id),storage=window.sessionStorage;
const labels={pending_payment:'待模拟付款',paid_review:'待审核设计',approved:'已审核，等待凑批',producing:'生产中（本地演示）',shipped:'已发货（本地演示）',completed:'订单已完成',cancelled:'已取消'};
const next={pending_payment:['pay','模拟付款'],shipped:['complete','确认收货（模拟）']};
const money=fen=>'¥'+(fen/100).toFixed(2);
let draft,order,credentials,previewVersion=0,busy=false;
const renderer=createRenderer($('design'));
function message(text,error=false){$('message').textContent=text;$('message').dataset.error=String(error);}
async function request(path,method='GET',data) {
  const response=await fetch(path,{method,headers:{'Content-Type':'application/json',...(credentials?{Authorization:'Bearer '+credentials.token}:{})},...(data?{body:JSON.stringify(data)}:{})});
  let result;try{result=await response.json();}catch{throw Error('订单服务未启动，请使用 npm run dev:orders 打开本地体验。');}
  if(!response.ok)throw Error(result.error||'请求失败');return result;
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
  $('status').textContent=labels[order.status];$('order-id').textContent='订单 '+order.id;
  $('shipping-summary').textContent=[order.shipping.name,order.shipping.phone,order.shipping.address].join(' · ');
  $('timeline').replaceChildren();for(const event of order.events){const li=document.createElement('li');li.textContent=`${labels[event.status]} · ${new Date(event.at).toLocaleString()}`;$('timeline').append(li);}
  if(order.payment){const li=document.createElement('li');li.textContent='模拟交易号 '+order.payment.transactionId;$('timeline').append(li);}
  if(order.tracking){const li=document.createElement('li');li.textContent='模拟运单 '+order.tracking.number;$('timeline').append(li);}
  $('actions').replaceChildren();
  $('actions').append(button('刷新订单状态',async()=>displayOrder(await request(`/api/orders/${order.id}`))));
  if(next[order.status]){const [action,label]=next[order.status];$('actions').append(button(label,async()=>displayOrder(await request(`/api/orders/${order.id}/actions`,'POST',{action,...(action==='ship'?{tracking:'DEMO-'+order.id.slice(0,8)}:{})}))));}
  if(order.status==='pending_payment')$('actions').append(button('取消订单',async()=>displayOrder(await request(`/api/orders/${order.id}/actions`,'POST',{action:'cancel'}))));
  if(['approved','producing','shipped','completed'].includes(order.status))$('actions').append(button('生成设计稿和工艺蒙版',productionPack));
  message('本地模拟订单已保存；刷新本页可继续。');
}
$('shipping-form').addEventListener('submit',event=>{event.preventDefault();safe(async()=>{
  if(!credentials){credentials={token:Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')};storage.setItem('maimai-order-access',JSON.stringify(credentials));}
  const fields=new window.FormData(event.currentTarget);const value=await request('/api/orders','POST',{draft,shipping:Object.fromEntries(['name','phone','address'].map(key=>[key,fields.get(key)])),rightsConfirmed:fields.get('rights')==='on'});
  credentials.id=value.id;storage.setItem('maimai-order-access',JSON.stringify(credentials));displayOrder(value);
})();});
$('reset').addEventListener('click',()=>{storage.removeItem('maimai-order-access');location.assign('custom-order.html');});
async function init(){try{
  const health=await request('/api/health');if(health.mode!=='demo')throw Error('当前服务不是订单演示环境');
  credentials=JSON.parse(storage.getItem('maimai-order-access')||'null');
  if(credentials?.id){displayOrder(await request('/api/orders/'+credentials.id));return;}
  const pending=JSON.parse(storage.getItem('maimai-order-pending')||'null');if(!pending)throw Error('请先返回选购页面，选择商品并点击“体验订单流程”。');
  const p=pending.product;displayDraft(buildAcrylicDesignDraft({state:pending.design,...p,variant:p.variant||'effect',newCustomer:false}));
}catch(error){message(error.message,true);$('shipping-form').hidden=true;}}
init();

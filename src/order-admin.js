const $=id=>document.getElementById(id),storage=window.sessionStorage;
const labels={pending_payment:'待模拟付款',paid_review:'待审核',approved:'已审核，等待凑批',producing:'生产中',shipped:'已发货',completed:'已完成',cancelled:'已取消'};
const productNames={'acrylic-brick:basic':'亚克力砖 · 基础款（120 × 50 × 15 mm）','acrylic-brick:effect':'亚克力砖 · 特效款（120 × 50 × 15 mm）','holographic-card':'镭射票',shikishi:'色纸','clear-stand':'透明托架'};
let token=storage.getItem('maimai-order-admin')||'',busy=false;
function note(text,error=false){$('admin-message').textContent=text;$('admin-message').dataset.error=String(error);}
async function api(path,method='GET',data){const response=await fetch('/api/admin/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});let result;try{result=await response.json();}catch{throw Error('请使用本地订单服务打开后台。');}if(!response.ok)throw Error(result.error||'请求失败');return result;}
function element(tag,text,className){const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
function action(text,fn){const b=element('button',text);b.type='button';b.addEventListener('click',()=>run(fn));return b;}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(error){note(error.message,true);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
async function refresh(){
 const data=await api('orders');storage.setItem('maimai-order-admin',token);$('admin-login').hidden=true;$('admin-content').hidden=false;
 for(const id of ['batch-queue','admin-orders','admin-batches'])$(id).replaceChildren();
 for(const group of data.queue){const row=element('article',null,'admin-row');row.dataset.sku=group.sku;
  row.append(element('h3',productNames[group.sku]||group.sku),element('p',`${group.quantity} / ${group.target} 件 · ${group.orderIds.length} 个订单 · 最早下单 ${new Date(group.oldestAt).toLocaleDateString()}`));
  const reason=element('input');reason.placeholder='不足 10 件提前生产的原因';reason.setAttribute('aria-label','提前生产原因');
  row.append(reason,action(group.ready?'建立生产批次':'提前建立批次（需原因）',async()=>{await api('batches','POST',{sku:group.sku,force:!group.ready,reason:reason.value});await refresh();}));$('batch-queue').append(row);
 }
 if(!data.queue.length)$('batch-queue').append(element('p','暂无已审核、待凑批的商品。'));
 for(const order of data.orders){const row=element('article',null,'admin-row');row.dataset.orderId=order.id;
  row.append(element('h3',labels[order.status]),element('p',order.id),element('p',order.draft.items.map(i=>`${productNames[i.type+(i.variant?':'+i.variant:'')]||i.type} × ${i.quantity}`).join('，')),element('p',`${order.shipping.name} · ${order.shipping.phone} · ${order.shipping.address}`),element('p','实收 ¥'+(order.draft.quote.totalFen/100).toFixed(2)));
  if(order.status==='paid_review'){
   const label=element('label',null,'check'),check=element('input');check.type='checkbox';check.setAttribute('aria-label','图稿工艺及权限已审核');label.append(check,element('span','图稿、工艺及使用权限已审核'));
   row.append(label,action('审核通过，进入凑批',async()=>{await api(`orders/${order.id}/actions`,'POST',{action:'approve',reviewConfirmed:check.checked});await refresh();}));
  }
  if(order.status==='producing'){const tracking=element('input');tracking.placeholder='DEMO- 开头的模拟运单号';tracking.setAttribute('aria-label','模拟运单号');row.append(tracking,action('回填运单并发货',async()=>{await api(`orders/${order.id}/actions`,'POST',{action:'ship',tracking:tracking.value});await refresh();}));}
  if(order.tracking)row.append(element('p',order.tracking.carrier+' '+order.tracking.number));$('admin-orders').append(row);
 }
 if(!data.orders.length)$('admin-orders').append(element('p','暂无订单。'));
 for(const batch of data.batches){const row=element('article',null,'admin-row');row.append(element('h3',(productNames[batch.sku]||batch.sku)+' · '+batch.quantity+' 件'),element('p',batch.id));if(batch.overrideReason)row.append(element('p','提前排产原因：'+batch.overrideReason));
  row.append(action('下载厂家交付清单（含收货信息）',async()=>{const pack=await api(`batches/${batch.id}/pack`);const url=URL.createObjectURL(new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='factory-batch-'+batch.id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}));$('admin-batches').append(row);
 }
 note('已加载 '+data.orders.length+' 个订单。支付与生产仍为本地演示。');
}
$('admin-login').addEventListener('submit',event=>{event.preventDefault();token=$('admin-token').value.trim();run(refresh);});
$('admin-refresh').addEventListener('click',()=>run(refresh));
$('admin-logout').addEventListener('click',()=>{storage.removeItem('maimai-order-admin');token='';$('admin-token').value='';$('admin-content').hidden=true;$('admin-login').hidden=false;for(const id of ['batch-queue','admin-orders','admin-batches'])$(id).replaceChildren();note('已退出后台。');});
if(token)run(refresh);

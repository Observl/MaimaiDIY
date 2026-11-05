import { customerRequest, customerSession, orderLabels } from './customer-api.js';
const $ = id => document.getElementById(id);
const names = {'acrylic-brick':'亚克力砖','clear-stand':'透明托架','holographic-card':'镭射票',shikishi:'色纸'};
let orders = [];
function message(text, error = false) { $('orders-message').textContent = text; $('orders-message').dataset.error = String(error); }
function render() {
  $('orders-list').replaceChildren();
  const filtered = orders.filter(o => $('orders-filter').value === 'all' || o.status === $('orders-filter').value);
  for (const o of filtered) {
    const card = document.createElement('article'); card.className = 'panel customer-order';
    const heading = document.createElement('h2'); heading.textContent = orderLabels[o.status] || '待确认';
    const id = document.createElement('p'); id.textContent = '订单 ' + o.id;
    const date = document.createElement('p'); date.textContent = new Date(o.createdAt).toLocaleString('zh-CN');
    const items = document.createElement('p'); items.textContent = o.items.map(i => `${names[i.type] || i.type}${i.variant==='effect'?' · 特效款':i.variant==='basic'?' · 基础款':''} × ${i.quantity}`).join(' / ');
    const price = document.createElement('strong'); price.textContent = '¥' + (o.totalFen / 100).toFixed(2);
    const link = document.createElement('a'); link.className = 'download'; link.href = 'checkout.html?id=' + encodeURIComponent(o.id); link.textContent = o.status === 'pending_payment' ? '查看订单与付款' : '查看订单详情';
    card.append(heading, id, date, items, price, link); $('orders-list').append(card);
  }
  if (!filtered.length) { const empty = document.createElement('p'); empty.className = 'panel'; empty.textContent = orders.length ? '这个状态下暂无订单。' : '你还没有订单。'; $('orders-list').append(empty); }
}
async function refresh() {
  $('orders-refresh').disabled = true;
  try { const s = await customerSession(); $('orders-login').hidden = !!s.user; $('orders-content').hidden = !s.user;
    if (!s.user) { orders=[]; $('orders-list').replaceChildren(); message(''); return; }
    $('orders-user').textContent = s.user.username;
    orders = (await customerRequest('/api/orders')).orders; render(); message('');
  } catch (error) { orders=[]; $('orders-list').replaceChildren(); message(error.message, true); if(error.status===401){$('orders-content').hidden=true;$('orders-login').hidden=false;} }
  finally { $('orders-refresh').disabled = false; }
}
$('orders-filter').addEventListener('change', render); $('orders-refresh').addEventListener('click', refresh);
window.addEventListener('pageshow', event => { if(event.persisted)refresh(); });
document.addEventListener('visibilitychange', () => { if(!document.hidden)refresh(); });
refresh();

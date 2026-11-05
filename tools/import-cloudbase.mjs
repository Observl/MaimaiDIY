import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
const key=JSON.parse((await readFile('output/cloudbase-api-key.private.json','utf8')).replace(/^\uFEFF/,'')).data.ApiKey;
const base='https://maimai-diy-d8go3owr74a7e260d.api.tcloudbasegateway.com/v1/rdb/rest/';
async function request(table,data){const res=await fetch(base+table,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},...(data?{body:JSON.stringify(data)}:{})});if(!res.ok)throw Error(`Cloud import failed: ${res.status} ${table.split('?')[0]}`);return res.status===204||res.headers.get('content-length')==='0'?null:await res.text();}
const users=new DatabaseSync('output/commerce-data/accounts.sqlite',{readOnly:true});
const orders=new DatabaseSync('output/commerce-data/orders.sqlite',{readOnly:true});
try{
  const accounts=users.prepare('SELECT * FROM users').all();if(accounts.length)await request('commerce_users',accounts);
  const source=orders.prepare('SELECT * FROM orders').all(),rows=[],items=[];
  for(const row of source){const o=JSON.parse(row.payload);rows.push({id:row.id,owner_id:row.owner_id||null,request_id:null,request_hash:row.request_hash,status:o.status,total_fen:o.draft.quote.totalFen,created_at:o.createdAt,payload:o,archived:o.mode==='demo'||!row.owner_id});o.draft.items.forEach((item,n)=>items.push({order_id:o.id,line_number:n,product_type:item.type,variant:item.variant||null,quantity:item.quantity,payload:item}));}
  if(rows.length)await request('commerce_orders',rows);if(items.length)await request('commerce_order_items',items);
  const batches=orders.prepare('SELECT * FROM production_batches').all().map(r=>({id:r.id,payload:JSON.parse(r.payload)}));if(batches.length)await request('commerce_legacy_batches',batches);
  const verify=JSON.parse(await request('commerce_orders?select=id,archived')||'[]');for(const row of rows)if(!verify.some(v=>v.id===row.id&&v.archived===row.archived))throw Error('Imported order verification failed');
  console.log(JSON.stringify({users:accounts.length,orders:rows.length,archivedDemoOrders:rows.filter(r=>r.archived).length,items:items.length,legacyBatches:batches.length,verified:true}));
}finally{users.close();orders.close();}

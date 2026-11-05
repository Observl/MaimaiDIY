import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes,createHash,timingSafeEqual } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrderStore } from './order-store.mjs';
import { createAccountStore } from './accounts.mjs';
import { COS } from '../src/config.js';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)),'dist');
const output=resolve(root,'../output'),data=resolve(output,process.env.ORDER_DATA_SUBDIR||'commerce-data');
if(!data.startsWith(output+sep))throw Error('订单数据目录须位于 output 内');await mkdir(data,{recursive:true});
const store=createOrderStore(resolve(data,'orders.sqlite'));
const accounts=createAccountStore(resolve(data,'accounts.sqlite'));
const tokenPath=resolve(data,'admin-token.txt');
let adminToken=process.env.ORDER_ADMIN_TOKEN;
if(!adminToken){try{adminToken=(await readFile(tokenPath,'utf8')).trim();}catch(error){if(error.code!=='ENOENT')throw error;adminToken=randomBytes(32).toString('hex');await writeFile(tokenPath,adminToken,{flag:'wx',mode:0o600});}}
const digest=value=>createHash('sha256').update(String(value)).digest();
const adminDigest=digest(adminToken);
const port=Number(process.env.ORDER_PORT||9425),origin=`http://127.0.0.1:${port}`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.svg':'image/svg+xml'};
const sessionCookie=req=>/(?:^|;\s*)maimai_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1]||'';
function setSession(res,value){res.setHeader('Set-Cookie',`maimai_session=${value||''}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value?604800:0}`);}
function reply(res,status,value) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req) {let size=0,text='';for await(const part of req){size+=part.length;if(size>8*1024*1024)throw Object.assign(Error('提交内容过大'),{status:413});text+=part;}try{return JSON.parse(text);}catch{throw Object.assign(Error('提交内容格式错误'),{status:400});}}
const server=createServer(async(req,res)=>{
  try {
    if(req.headers.host!==`127.0.0.1:${port}`)return reply(res,403,{error:'仅允许本机访问'});
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    const url=new URL(req.url,origin),token=(req.headers.authorization||'').replace(/^Bearer /,'');
    if(url.pathname.startsWith('/api/')) {
      if(req.method==='GET'&&url.pathname==='/api/cos-asset') {
        const source=new URL(url.searchParams.get('path')||'',COS.baseUrl);
        if(source.origin!==COS.baseUrl||!source.pathname.startsWith('/materials/')||! /\.(png|jpe?g|webp|json)$/i.test(source.pathname))return reply(res,403,{error:'素材路径不支持'});
        const upstream=await fetch(source,{redirect:'error',signal:AbortSignal.timeout(15000)});
        if(!upstream.ok)return reply(res,502,{error:'云端素材暂不可用'});
        const content=Buffer.from(await upstream.arrayBuffer());if(content.length>12*1024*1024)return reply(res,413,{error:'素材过大'});
        res.writeHead(200,{'Content-Type':types[extname(source.pathname)]||'application/octet-stream','Cache-Control':'private, max-age=3600'});res.end(content);return;
      }
      if(req.method==='POST'&&req.headers.origin!==origin)return reply(res,403,{error:'拒绝跨站提交'});
      if(req.method==='GET'&&url.pathname==='/api/health')return reply(res,200,{mode:'demo',accounts:true});
      const sessionToken=sessionCookie(req),session=accounts.session(sessionToken);
      if(req.method==='GET'&&url.pathname==='/api/auth/session')return reply(res,200,session||{user:null});
      if(req.method==='POST'&&['/api/auth/register','/api/auth/login'].includes(url.pathname)){
        const input=await body(req),value=await accounts[url.pathname.endsWith('register')?'register':'login'](input,req.socket.remoteAddress);
        setSession(res,value.token);return reply(res,200,{user:value.user,csrf:value.csrf});
      }
      if(req.method==='POST'&&url.pathname.startsWith('/api/auth/')){
        if(!session)return reply(res,401,{error:'请先登录'});
        if(!timingSafeEqual(digest(req.headers['x-csrf-token']||''),digest(session.csrf)))return reply(res,403,{error:'登录状态校验失败，请刷新后重试'});
        if(url.pathname==='/api/auth/logout'){accounts.logout(sessionToken);setSession(res,'');return reply(res,200,{ok:true});}
        if(url.pathname==='/api/auth/password'){const value=await accounts.changePassword(session.user.id,await body(req),req.socket.remoteAddress);setSession(res,value.token);return reply(res,200,{user:value.user,csrf:value.csrf});}
      }
      if(url.pathname.startsWith('/api/admin/')){
        if(!timingSafeEqual(digest(token),adminDigest))return reply(res,401,{error:'运营凭据无效'});
        if(req.method==='GET'&&url.pathname==='/api/admin/orders')return reply(res,200,{orders:store.list(),queue:store.queue(),batches:store.batches()});
        if(req.method==='POST'&&url.pathname==='/api/admin/batches')return reply(res,201,store.createBatch(await body(req)));
        const action=url.pathname.match(/^\/api\/admin\/orders\/([a-f0-9-]{36})\/actions$/);
        if(req.method==='POST'&&action){const input=await body(req);return reply(res,200,store.adminAct(action[1],input.action,input));}
        const pack=url.pathname.match(/^\/api\/admin\/batches\/([a-f0-9-]{36})\/pack$/);
        if(req.method==='GET'&&pack)return reply(res,200,store.batchPack(pack[1]));
        return reply(res,404,{error:'运营接口不存在'});
      }
      if(url.pathname==='/api/orders'||url.pathname.startsWith('/api/orders/')){
        if(!session)return reply(res,401,{error:'购买和查单前请先登录'});
        if(req.method==='POST'&&!timingSafeEqual(digest(req.headers['x-csrf-token']||''),digest(session.csrf)))return reply(res,403,{error:'登录状态校验失败，请刷新后重试'});
      }
      if(req.method==='GET'&&url.pathname==='/api/orders')return reply(res,200,{orders:store.listForUser(session.user.id)});
      if(req.method==='POST'&&url.pathname==='/api/orders'){
        const input=await body(req);if(!/^[a-f0-9]{64}$/.test(input.requestId||''))return reply(res,400,{error:'缺少本次提交编号'});
        return reply(res,201,store.create(input,createHash('sha256').update(session.user.id+':'+input.requestId).digest('hex'),session.user.id));
      }
      const match=url.pathname.match(/^\/api\/orders\/([a-f0-9-]{36})(?:\/(actions|pack))?$/);
      if(match) {
        const [,id,part]=match;
        if(req.method==='GET'&&part!=='actions')return reply(res,200,part==='pack'?store.packForUser(id,session.user.id):store.getForUser(id,session.user.id));
        if(req.method==='POST'&&part==='actions'){const input=await body(req);return reply(res,200,store.actForUser(id,session.user.id,input.action,input));}
      }
      return reply(res,404,{error:'接口不存在'});
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return reply(res,405,{error:'请求方式不支持'});
    const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!path.startsWith(root+sep))return reply(res,403,{error:'无效路径'});
    let content=await readFile(path);
    if(extname(path)==='.html')content=Buffer.from(content.toString('utf8').replace('</head>','<meta name="maimai-order-demo" content="true"></head>'));
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
  }catch(error){reply(res,error.status||(error.code==='ENOENT'?404:400),{error:error.status||error.code==='ENOENT'?error.message:'无法处理请求，请检查输入'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`本地模拟订单：${origin}（不收款、不对接厂家）`));

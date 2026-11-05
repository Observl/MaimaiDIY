import { randomBytes,randomUUID,createHash,scrypt as rawScrypt,timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { buildAcrylicDesignDraft } from '../src/product-catalog.js';
import { sanitizeImportedState } from '../src/model.js';
const scrypt=promisify(rawScrypt),hash=x=>createHash('sha256').update(x).digest('hex');
const fail=(text,status=400)=>{throw Object.assign(Error(text),{status});};
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(x);
const validateName=x=>{if(typeof x!=='string'||!/^[a-zA-Z0-9_]{3,32}$/.test(x))fail('用户名需为 3–32 位字母、数字或下划线');return x.toLowerCase();};
const validatePassword=x=>{if(typeof x!=='string'||[...x].length<10||x.length>128)fail('密码需为 10–128 个字符');return x;};
const derive=(x,s)=>scrypt(x,s,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
export function createCommerceApi({rpc,origins}){
  async function throttle(key,max=10,period=600){if(!(await rpc('throttle',{key:hash(key),max,period})).allowed)fail('尝试过于频繁，请稍后再试',429);}
  async function issue(user){const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');await rpc('session_create',{hash:hash(token),userId:user.id,csrf});return {user,csrf,token};}
  async function verify(row,value){const actual=await derive(value,row?.salt||'unknown-user-dummy-salt');return timingSafeEqual(actual,row?Buffer.from(row.password_hash,'hex'):Buffer.alloc(64))&&!!row;}
  return async(event)=>{
    const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
    const origin=headers.origin,allowed=origins.includes(origin);
    const responseHeaders={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization,Content-Type,X-CSRF-Token','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Max-Age':'600'}:{})};
    const reply=(statusCode,value)=>({statusCode,headers:responseHeaders,body:JSON.stringify(value)});
    try{
      const method=event.httpMethod||event.requestContext?.http?.method;
      // HTTP gateway events only; never treat arbitrary event fields as authorization.
      if(!method)return reply(400,{error:'需要通过订单 API 访问'});
      if(origin&&!allowed)return reply(403,{error:'网站来源未授权'});
      if(method==='OPTIONS')return allowed?reply(204,null):reply(403,{error:'网站来源未授权'});
      const path=(event.path||'/').replace(/^\/commerce-api(?=\/|$)/,'')||'/';
      const token=/^Bearer ([a-f0-9]{64})$/.exec(headers.authorization||'')?.[1];
      if(method==='GET'&&path==='/api/health')return reply(200,{mode:'cloudbase',accounts:true,paymentsEnabled:false});
      if(!['GET','POST'].includes(method))return reply(405,{error:'请求方式不支持'});
      let input={};
      if(method==='POST'){
        if(!allowed)fail('写入请求须来自授权网站',403);
        if(!headers['content-type']?.startsWith('application/json'))fail('请使用 JSON',415);
        const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):event.body||'{}';
        if(typeof raw!=='string'||Buffer.byteLength(raw)>2*1024*1024)fail('请求内容过大',413);
        try{input=JSON.parse(raw);}catch{fail('JSON 格式错误');}if(!input||typeof input!=='object'||Array.isArray(input))fail('请求内容无效');
      }
      const client=event.requestContext?.identity?.sourceIp||event.requestContext?.http?.sourceIp||'gateway';
      if(method==='POST'&&['/api/auth/login','/api/auth/register'].includes(path)){
        const register=path.endsWith('register');await throttle((register?'register:':'login-ip:')+client,register?5:30,register?3600:600);
        const name=validateName(input.username),pass=validatePassword(input.password);
        if(register){
          const salt=randomBytes(32).toString('hex'),passwordHash=(await derive(pass,salt)).toString('hex');
          let user;try{user=await rpc('register',{id:randomUUID(),username:name,salt,passwordHash});}catch(error){if(error.dbCode==='23505')fail('该用户名不可用，请换一个',409);throw error;}
          return reply(200,await issue(user));
        }
        await throttle('login-user:'+name);const row=await rpc('user',{username:name});if(!await verify(row,pass))fail('用户名或密码不正确',401);
        return reply(200,await issue({id:row.id,username:row.username,createdAt:row.created_at}));
      }
      const session=token?await rpc('session_get',{hash:hash(token)}):null;
      if(method==='GET'&&path==='/api/auth/session')return reply(200,session||{user:null});
      if(!session)fail('购买和查单前请先登录',401);
      if(method==='POST'&&headers['x-csrf-token']!==session.csrf)fail('登录状态校验失败',403);
      if(method==='POST'&&path==='/api/auth/logout'){await rpc('logout',{hash:hash(token)});return reply(200,{ok:true});}
      if(method==='POST'&&path==='/api/auth/password'){
        await throttle('password:'+session.user.id,5);const old=validatePassword(input.currentPassword),next=validatePassword(input.newPassword),row=await rpc('user',{username:session.user.username});
        if(!await verify(row,old))fail('当前密码不正确',401);
        const salt=randomBytes(32).toString('hex'),result=await rpc('password',{userId:row.id,salt,passwordHash:(await derive(next,salt)).toString('hex'),oldHash:row.password_hash});
        if(result.conflict)fail('密码已发生变化，请重新登录',409);return reply(200,await issue(session.user));
      }
      if(method==='GET'&&path==='/api/orders'){
        const offset=Number(event.queryStringParameters?.offset||0);if(!Number.isSafeInteger(offset)||offset<0)fail('分页参数无效');
        const orders=await rpc('orders_list',{userId:session.user.id,offset});return reply(200,{orders,nextOffset:orders.length===100?offset+100:null});
      }
      if(method==='POST'&&path==='/api/orders'){
        await throttle('create-order:'+session.user.id,20,3600);
        if(!/^[a-f0-9]{64}$/.test(input.requestId||''))fail('缺少本次提交编号');if(input.rightsConfirmed!==true)fail('请确认设计稿使用权限和定制信息');
        const shipping={};for(const [key,min,max]of[['name',1,40],['phone',6,30],['address',6,240]]){const v=input.shipping?.[key];if(typeof v!=='string'||v.trim().length<min||v.length>max)fail('请填写完整的收货信息');shipping[key]=v.trim();}
        const p=input.draft?.product;if(!p||!input.draft.design)fail('缺少定制方案');
        let draft;try{draft=buildAcrylicDesignDraft({state:sanitizeImportedState(input.draft.design),variant:p.variant||'effect',quantity:p.quantity,accessory:p.accessory,cardQuantity:p.cardQuantity,shikishiQuantity:p.shikishiQuantity,newCustomer:false});}catch{fail('定制方案无效，请返回编辑器重新保存');}
        const requestHash=hash(JSON.stringify({draft,shipping})),createdAt=new Date().toISOString();
        const order={id:randomUUID(),mode:'cloudbase',status:'pending_payment',createdAt,draft,shipping,events:[{status:'pending_payment',at:createdAt}],payment:null,tracking:null};
        const result=await rpc('order_create',{userId:session.user.id,requestId:input.requestId,requestHash,order});if(result.conflict)fail('本次提交编号已用于其他方案',409);return reply(201,result);
      }
      const match=/^\/api\/orders\/([^/]+)(?:\/(actions|pack))?$/.exec(path);
      if(match){const [,id,part]=match;if(!uuid(id))fail('订单不存在',404);
        const order=await rpc('order_get',{id,userId:session.user.id});if(!order)fail('订单不存在',404);
        if(method==='GET'&&!part)return reply(200,order);
        if(method==='GET'&&part==='pack'){if(!['approved','producing','shipped','completed'].includes(order.status))fail('请先付款并审核设计稿',409);return reply(200,{format:'MaimaiDIY-production-pack',orderId:id,productionReady:false,draft:order.draft});}
        if(method==='POST'&&part==='actions'){
          if(input.action==='pay')fail('微信和支付宝支付尚未开通，当前不可付款',503);
          if(!['cancel','complete'].includes(input.action))fail('该操作需要运营权限',403);
          const result=await rpc('order_action',{id,userId:session.user.id,action:input.action});if(result?.conflict)fail('当前订单状态不允许该操作',409);if(!result)fail('订单不存在',404);return reply(200,result);
        }
      }
      return reply(404,{error:'接口不存在'});
    }catch(error){return reply(error.status||500,{error:error.status?error.message:'服务暂时无法处理，请稍后重试'});}
  };
}

async function rpc(op,args){
  const env=process.env.CLOUDBASE_ENV_ID,key=process.env.CLOUDBASE_API_KEY;
  if(!env||!key)throw Error('Backend not configured');
  const res=await fetch(`https://${env}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/commerce_command`,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({op,args}),signal:AbortSignal.timeout(15000)});
  const value=await res.json();if(!res.ok){const error=Error('Database request failed');error.dbCode=value.code;throw error;}return value;
}
export const main=async(event)=>createCommerceApi({rpc,origins:(process.env.ALLOWED_ORIGINS||'https://observl.github.io').split(',')})(event);

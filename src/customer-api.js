import { CLOUDBASE_COMMERCE_URL, USE_CLOUDBASE_COMMERCE } from './cloudbase-config.js';
let session, accessToken;
const key='maimai-cloudbase-session';
if(USE_CLOUDBASE_COMMERCE){try{accessToken=window.sessionStorage.getItem(key)||undefined;}catch{}}
function clearAccess(){accessToken=undefined;try{window.sessionStorage.removeItem(key);}catch{}}
export async function customerRequest(path, method = 'GET', data) {
  const response = await fetch((USE_CLOUDBASE_COMMERCE?CLOUDBASE_COMMERCE_URL:'')+path, { method, credentials: USE_CLOUDBASE_COMMERCE?'omit':'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(session?.csrf ? { 'X-CSRF-Token': session.csrf } : {}), ...(USE_CLOUDBASE_COMMERCE&&accessToken?{Authorization:'Bearer '+accessToken}:{}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  let result;
  try { result = await response.json(); }
  catch { throw Error('账号与订单服务尚未连接，请使用本地订单服务预览。'); }
  if (!response.ok) { if(response.status===401){session=null;if(USE_CLOUDBASE_COMMERCE)clearAccess();} throw Object.assign(Error(result.error || '请求失败'), { status: response.status }); }
  if(USE_CLOUDBASE_COMMERCE&&path==='/api/auth/logout')clearAccess();
  return result;
}
export async function customerSession() { session = await customerRequest('/api/auth/session');if(USE_CLOUDBASE_COMMERCE&&!session.user)clearAccess(); return session; }
export function setCustomerSession(value) { session = value;if(!USE_CLOUDBASE_COMMERCE)return;if(value?.token){accessToken=value.token;try{window.sessionStorage.setItem(key,accessToken);}catch{}}else if(!value?.user)clearAccess(); }
export function signInUrl(returnTo = 'orders.html') {
  return 'account.html?return=' + encodeURIComponent(returnTo);
}
export const orderLabels = {pending_payment:'待付款',paid_review:'设计待审核',approved:'等待凑批',producing:'生产中',shipped:'已发货',completed:'已完成',cancelled:'已取消'};

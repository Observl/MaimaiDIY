let session;
export async function customerRequest(path, method = 'GET', data) {
  const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(session?.csrf ? { 'X-CSRF-Token': session.csrf } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  let result;
  try { result = await response.json(); }
  catch { throw Error('账号与订单服务尚未连接，请使用本地订单服务预览。'); }
  if (!response.ok) { if(response.status===401)session=null; throw Object.assign(Error(result.error || '请求失败'), { status: response.status }); }
  return result;
}
export async function customerSession() { session = await customerRequest('/api/auth/session'); return session; }
export function setCustomerSession(value) { session = value; }
export function signInUrl(returnTo = 'orders.html') {
  return 'account.html?return=' + encodeURIComponent(returnTo);
}
export const orderLabels = {pending_payment:'待付款',paid_review:'设计待审核',approved:'等待凑批',producing:'生产中',shipped:'已发货',completed:'已完成',cancelled:'已取消'};

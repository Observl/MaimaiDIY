import { customerRequest, customerSession, setCustomerSession } from './customer-api.js';
const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search).get('return') || 'orders.html';
// Only local known destinations; never redirect to an arbitrary URL supplied by a link.
const returnTo = /^(?:orders|custom-order|checkout)\.html(?:\?id=[a-f0-9-]{36})?$/.test(query) ? query : 'orders.html';
let mode = 'login', busy = false;
function message(text, error = false) { $('account-message').textContent = text; $('account-message').dataset.error = String(error); }
function display(value) {
  setCustomerSession(value);
  $('credentials-panel').hidden = !!value?.user; $('signed-in-panel').hidden = !value?.user;
  if (value?.user) { $('account-title').textContent = '你的账号'; $('signed-in-name').textContent = value.user.username; $('password-form').elements.username.value = value.user.username; $('continue').href = returnTo; }
  else $('account-title').textContent = '登录后继续定制。';
}
async function submit(_form, action) {
  if (busy) return; busy = true;
  const buttons = [...document.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
  try { await action(); } catch (error) { message(error.message, true); }
  finally { busy = false; buttons.forEach(b => b.disabled = false); }
}
for (const name of ['login', 'register']) $(name + '-tab').addEventListener('click', () => {
  mode = name; $('confirm-row').hidden = mode !== 'register'; $('confirm-password').required = mode === 'register';
  $('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('account-submit').textContent = mode === 'register' ? '创建账号并继续' : '登录';
  for (const tab of ['login', 'register']) { $(tab + '-tab').setAttribute('aria-pressed', String(tab === mode)); $(tab + '-tab').classList.toggle('secondary', tab !== mode); }
  message('');
});
$('account-form').addEventListener('submit', event => { event.preventDefault(); submit(event.currentTarget, async () => {
  const form = $('account-form');
  if (mode === 'register' && form.elements.password.value !== form.elements.confirmPassword.value) throw Error('两次输入的密码不一致');
  const value = await customerRequest('/api/auth/' + mode, 'POST', { username: form.elements.username.value.trim(), password: form.elements.password.value });
  display(value); form.reset(); location.assign(returnTo);
}); });
$('password-form').addEventListener('submit', event => { event.preventDefault(); submit(event.currentTarget, async () => {
  const form = $('password-form'); if (form.elements.newPassword.value !== form.elements.confirmPassword.value) throw Error('两次输入的新密码不一致');
  display(await customerRequest('/api/auth/password', 'POST', { currentPassword: form.elements.currentPassword.value, newPassword: form.elements.newPassword.value }));
  form.reset(); message('密码已更新，其他设备已退出登录。');
}); });
$('logout').addEventListener('click', () => submit(null, async () => { await customerRequest('/api/auth/logout', 'POST', {}); display(null); message('已退出登录。'); }));
customerSession().then(display).catch(error => message(error.message, true));

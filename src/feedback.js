const dialog = document.querySelector('#feedback-dialog');
const form = document.querySelector('#feedback-form');
const status = document.querySelector('#feedback-status');
const submit = form.querySelector('button[type="submit"]');
const message = form.elements.namedItem('message');
const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
const endpoint = form.dataset.endpoint || (local ? '/api/feedback' : '');

document.querySelector('#feedback-open').addEventListener('click', () => dialog.showModal());
document.querySelector('#feedback-close').addEventListener('click', () => dialog.close());
message.addEventListener('input', () => message.setCustomValidity(''));

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  if (!message.value.trim()) {
    message.setCustomValidity('请输入反馈内容。');
    message.reportValidity();
    return;
  }
  if (!endpoint) {
    status.textContent = '邮件反馈尚未开通，请稍后再试。';
    return;
  }
  const body = Object.fromEntries(new window.FormData(form));
  body.message = message.value.trim();
  submit.disabled = true;
  status.textContent = '正在提交…';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(28000),
    });
    const result = await response.json();
    if (response.ok) {
      form.reset();
      status.textContent = '反馈已提交，谢谢。';
    } else {
      status.textContent = result.message || '提交失败，请稍后重试。';
    }
  } catch {
    status.textContent = '暂时无法连接反馈服务，请稍后重试。';
  } finally {
    submit.disabled = false;
  }
});

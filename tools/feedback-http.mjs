import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { feedbackService } from '../server/feedback.mjs';

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json')
    throw new Error('Expected JSON');
  let length = 0;
  const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > 16000) throw new Error('Feedback request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function respond(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify({ message }));
}

const adminPage = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>反馈审核设置</title>
<h1>反馈审核设置</h1>
<form><label>硅基流动 API Key <input type="password" name="key" autocomplete="off" required maxlength="503"></label>
<button>加密保存</button><p role="status"></p></form>
<script>
const form=document.querySelector('form');
form.onsubmit=async event=>{
  event.preventDefault();
  const button=form.querySelector('button'),status=form.querySelector('[role=status]');
  button.disabled=true;
  try {
    const response=await fetch('/',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key:form.elements.key.value})});
    status.textContent=(await response.json()).message;
    if(response.ok)form.reset();
  }catch{status.textContent='保存失败，请重试。';}
  finally{button.disabled=false;}
};
</script></html>`;

export function setupFeedback(port, env = process.env) {
  const service = env.FEEDBACK_MASTER_KEY && feedbackService({
    database: env.FEEDBACK_DATABASE || '.feedback/feedback.sqlite',
    masterKey: Buffer.from(env.FEEDBACK_MASTER_KEY, 'base64'),
    model: env.FEEDBACK_AI_MODEL, from: env.FEEDBACK_FROM, to: env.FEEDBACK_TO,
    mailKey: env.RESEND_API_KEY,
  });
  if (service && env.FEEDBACK_SILICONFLOW_API_KEY && !service.configureKey(env.FEEDBACK_SILICONFLOW_API_KEY)) {
    throw new Error('Invalid FEEDBACK_SILICONFLOW_API_KEY');
  }
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, env.FEEDBACK_ORIGIN].filter(Boolean));
  const behindProxy = env.FEEDBACK_TRUST_LOCAL_PROXY === '1';

  // The private settings listener is never routed through the public website.
  if (service && env.FEEDBACK_ADMIN_PORT) {
    const adminPort = Number(env.FEEDBACK_ADMIN_PORT);
    const host = `127.0.0.1:${adminPort}`;
    createServer(async (request, response) => {
      if (request.url !== '/' || request.headers.host !== host)
        return respond(response, 404, '页面不存在。');
      if (request.method === 'GET') {
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'",
        });
        return response.end(adminPage);
      }
      if (request.method !== 'POST' || request.headers.origin !== `http://${host}`)
        return respond(response, 403, '请求来源无效。');
      try {
        const { key } = await readJson(request);
        if (!service.configureKey(key)) return respond(response, 400, '请输入有效的硅基流动 API Key。');
        return respond(response, 200, '密钥已加密保存。');
      } catch {
        return respond(response, 400, '无法保存密钥。');
      }
    }).listen(adminPort, '127.0.0.1');
  }

  return async (request, response) => {
    const origin = request.headers.origin;
    if (!origins.has(origin)) return respond(response, 403, '请求来源无效。');
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return response.end();
    }
    if (request.method !== 'POST') return respond(response, 405, '请通过网站提交反馈。');
    if (!service) return respond(response, 503, '邮件反馈尚未开通，请稍后再试。');
    let address = request.socket.remoteAddress;
    if (behindProxy) {
      const clientAddress = request.headers['x-maimaidiy-client-ip'];
      if (address !== '127.0.0.1' || typeof clientAddress !== 'string' || !isIP(clientAddress)) {
        return respond(response, 400, '无法识别反馈来源。');
      }
      address = clientAddress;
    }
    try {
      const result = await service.submit(await readJson(request), address);
      return respond(response, ...result);
    } catch {
      return respond(response, 400, '请检查反馈内容。');
    }
  };
}

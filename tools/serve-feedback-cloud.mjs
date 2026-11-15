import { statSync } from 'node:fs';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { dirname, isAbsolute } from 'node:path';
import { setupFeedback } from './feedback-http.mjs';

const port = Number(process.env.PORT || 8080);
const { FEEDBACK_DATABASE: database, FEEDBACK_ORIGIN: origin } = process.env;
const ready = Boolean(origin && database && process.env.FEEDBACK_MASTER_KEY &&
  process.env.FEEDBACK_SILICONFLOW_API_KEY && process.env.RESEND_API_KEY &&
  process.env.FEEDBACK_FROM && process.env.FEEDBACK_TO);

if (ready && (!isAbsolute(database) || !statSync(dirname(database), { throwIfNoEntry: false })?.isDirectory())) {
  throw new Error('FEEDBACK_DATABASE requires an existing writable volume directory');
}

const feedback = setupFeedback(port, {
  ...process.env,
  FEEDBACK_ADMIN_PORT: '',
  FEEDBACK_MASTER_KEY: ready ? process.env.FEEDBACK_MASTER_KEY : '',
}, {
  clientIp(request) {
    // The public CloudBase gateway provides the closest client hop.
    const address = request.headers['x-forwarded-for']?.split(',').at(-1)?.trim();
    return address && isIP(address) ? address : undefined;
  },
});

createServer((request, response) => {
  if (request.method === 'GET' && (request.url === '/healthz' || request.url === '/')) {
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return response.end('OK');
  }
  if (request.url === '/api/feedback') return feedback(request, response);
  response.writeHead(404);
  response.end();
}).listen(port, '0.0.0.0', () => console.log(`Feedback service listening on port ${port}`));

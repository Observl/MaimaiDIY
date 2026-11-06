import http from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import pg from 'pg';
import { calculateQuote, createDesignRecord } from './lib/commerce.mjs';

const connectionString = process.env.DATABASE_URL;
const accessToken = process.env.COMMERCE_API_TOKEN;
if (!connectionString || !accessToken || accessToken.length < 32) {
  throw new Error('Set DATABASE_URL and a strong COMMERCE_API_TOKEN (at least 32 characters)');
}
const pool = new pg.Pool({ connectionString, max: 5 });
const host = process.env.COMMERCE_BIND_HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
const demoUserId = process.env.COMMERCE_DEMO_USER_ID;
// This is an internal integration prototype, not customer-facing authentication.
function isAuthorized(req) {
  const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(accessToken);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function parseBody(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1024 * 1024) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
function respond(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && pathname === '/health') {
      await pool.query('SELECT 1');
      return respond(res, 200, { status: 'ready', checkoutEnabled: false, manufacturingEnabled: false });
    }
    if (!isAuthorized(req)) return respond(res, 401, { error: 'Unauthorized' });
    if (req.method === 'POST' && pathname === '/api/quotes') {
      const data = await parseBody(req);
      // Never accept an untrusted browser-supplied newcomer flag.
      return respond(res, 200, calculateQuote({ ...data, eligibleNewCustomer: false }));
    }
    if (req.method === 'POST' && pathname === '/api/designs') {
      if (!demoUserId) return respond(res, 503, { error: 'Demo user has not been configured' });
      const body = await parseBody(req);
      const record = createDesignRecord(body.design, demoUserId);
      await pool.query(
        'INSERT INTO design_versions (id,owner_id,design_schema_version,payload,rights_status) VALUES ($1,$2,$3,$4,$5)',
        [record.id, record.ownerId, 1, record.payload, record.rightsStatus]
      );
      return respond(res, 201, { designVersionId: record.id, digest: record.digest, rightsStatus: 'pending' });
    }
    if (req.method === 'GET' && /^\/api\/designs\/[a-f0-9-]{36}$/.test(pathname)) {
      if (!demoUserId) return respond(res, 503, { error: 'Demo user has not been configured' });
      const id = pathname.split('/').at(-1);
      const result = await pool.query(
        'SELECT id,payload,rights_status,created_at FROM design_versions WHERE id=$1 AND owner_id=$2',
        [id, demoUserId]
      );
      return result.rowCount ? respond(res, 200, result.rows[0]) : respond(res, 404, { error: 'Not found' });
    }
    if (pathname.startsWith('/api/payments') || pathname.startsWith('/api/fulfillment') || pathname.startsWith('/api/orders')) {
      return respond(res, 503, { error: 'Live payment and fulfillment require approved external provider integration' });
    }
    return respond(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = error.status && Number.isInteger(error.status) ? error.status : 500;
    if (status === 500) console.error('API error', error);
    respond(res, status, { error: status === 500 ? 'Internal server error' : error.message });
  }
});

server.listen(port, host, () => console.log(`Commerce staging API on http://${host}:${port}`));
const shutdown = async () => { server.close(); await pool.end(); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const publicUser = row => ({ id: row.id, username: row.username, createdAt: row.created_at });
const username = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_]{3,32}$/.test(value)) fail('用户名需为 3–32 位字母、数字或下划线');
  return value.toLowerCase();
};
const password = value => {
  if (typeof value !== 'string' || [...value].length < 10 || value.length > 128) fail('密码需为 10–128 个字符');
  return value;
};
const derive = (value, salt) => scrypt(value, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
export function createAccountStore(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS user_sessions_owner ON user_sessions(user_id);
    CREATE TABLE IF NOT EXISTS auth_throttle (key_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at INTEGER NOT NULL);`);
  let operations = 0;
  function throttle(key, max = 10, period = 600000) {
    const now = Date.now(), k = digest(key);
    const old = db.prepare('SELECT * FROM auth_throttle WHERE key_hash=?').get(k);
    if (old && old.until_at > now && old.count >= max) fail('尝试过于频繁，请稍后再试', 429);
    db.prepare('INSERT INTO auth_throttle VALUES (?,?,?) ON CONFLICT(key_hash) DO UPDATE SET count=excluded.count, until_at=excluded.until_at').run(k, old && old.until_at > now ? old.count + 1 : 1, old && old.until_at > now ? old.until_at : now + period);
    if (++operations % 100 === 0) db.prepare('DELETE FROM auth_throttle WHERE until_at<?').run(now);
  }
  function session(token) {
    if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
    const row = db.prepare('SELECT s.*,u.username,u.created_at FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(digest(token), Date.now());
    return row ? { user: { id: row.user_id, username: row.username, createdAt: row.created_at }, csrf: row.csrf } : null;
  }
  function issue(userId) {
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM user_sessions WHERE expires_at<?').run(Date.now());
    db.prepare('INSERT INTO user_sessions VALUES (?,?,?,?)').run(digest(token), userId, csrf, Date.now() + 7 * 86400000);
    return { token, ...session(token) };
  }
  async function verify(row, value) {
    // Unknown accounts still perform the same expensive password derivation.
    const actual = await derive(value, row?.salt || 'unknown-user-dummy-salt');
    return timingSafeEqual(actual, row ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(64)) && !!row;
  }
  return {
    close: () => db.close(), session, throttle,
    async register(input, client) {
      throttle('register:' + client, 5, 3600000);
      const name = username(input?.username), pass = password(input?.password), salt = randomBytes(32).toString('hex');
      const derived = await derive(pass, salt), row = { id: randomUUID(), username: name, created_at: new Date().toISOString() };
      try { db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(row.id, name, salt, derived.toString('hex'), row.created_at); }
      catch (error) { if (error.code?.includes('SQLITE_CONSTRAINT') || error.message.includes('UNIQUE constraint')) fail('该用户名不可用，请换一个', 409); throw error; }
      return { user: publicUser(row), ...issue(row.id) };
    },
    async login(input, client) {
      throttle('login-ip:' + client, 30);
      const name = username(input?.username), pass = password(input?.password);
      throttle('login-user:' + name, 10);
      const row = db.prepare('SELECT * FROM users WHERE username=?').get(name);
      if (!await verify(row, pass)) fail('用户名或密码不正确', 401);
      return issue(row.id);
    },
    logout(token) { db.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(digest(token || '')); },
    async changePassword(userId, input, client) {
      throttle('password:' + userId + ':' + client, 5);
      const old = password(input?.currentPassword), next = password(input?.newPassword);
      const row = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
      if (!await verify(row, old)) fail('当前密码不正确', 401);
      const salt = randomBytes(32).toString('hex'), derived = await derive(next, salt);
      // Password may have changed while scrypt yielded; fail rather than revive stale credentials.
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=? AND password_hash=?').run(salt, derived.toString('hex'), userId, row.password_hash);
        if (!result.changes) fail('密码已发生变化，请重新登录', 409);
        db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(userId);
        const issued = issue(userId); db.exec('COMMIT'); return issued;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
}

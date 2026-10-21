import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateData } from '../public/data.js';
import { WORKSPACE_BYTES } from '../public/workspace-storage.js';

const WORKSPACE_LIMIT = WORKSPACE_BYTES;
const AUTH_LIMIT = 2048;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const digest = value => createHash('sha256').update(value).digest();

class APIError extends Error {
  constructor(status, message, code, extra = {}) {
    super(message);
    Object.assign(this, { status, code, extra });
  }
}

function readJSON(req, limit) {
  return new Promise((resolveBody, reject) => {
    if (Number(req.headers['content-length']) > limit) {
      req.resume();
      reject(new APIError(413, '内容过大，请减少记录后重试', 'body_too_large'));
      return;
    }
    let bytes = 0;
    let ended = false;
    const chunks = [];
    req.on('data', chunk => {
      if (ended) return;
      bytes += chunk.length;
      if (bytes > limit) {
        ended = true;
        chunks.length = 0;
        reject(new APIError(413, '内容过大，请减少记录后重试', 'body_too_large'));
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (ended) return;
      ended = true;
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        resolveBody(parsed);
      } catch { reject(new APIError(400, '请求内容不是有效的 JSON 对象', 'invalid_json')); }
    });
    req.on('error', () => reject(new APIError(400, '请求中断，请重试', 'request_interrupted')));
    req.on('aborted', () => reject(new APIError(400, '请求中断，请重试', 'request_interrupted')));
  });
}

function validateWorkspace(data) {
  // Bound depth and node count before cloning; reject non-finite JSON numbers and
  // prototype keys so importing records cannot poison object-based client merges.
  const pending = [[data, 0]];
  let nodes = 0;
  while (pending.length) {
    const [value, depth] = pending.pop();
    if (++nodes > 150000 || depth > 24 || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new APIError(400, '记录结构过深、过大或包含无效数字', 'invalid_workspace');
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new APIError(400, '记录包含不支持的字段', 'invalid_workspace');
        pending.push([child, depth + 1]);
      }
    }
  }
  try { return validateData(structuredClone(data)); }
  catch { throw new APIError(400, '记录格式不正确，无法同步', 'invalid_workspace'); }
}

function credentials(body) {
  const username = typeof body.username === 'string' ? body.username.normalize('NFKC').trim() : '';
  const password = body.password;
  if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)) {
    throw new APIError(400, '用户名需为 3–40 位文字、数字、点、横线或下划线', 'invalid_username');
  }
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new APIError(400, '密码长度需为 10–128 个字符', 'invalid_password');
  }
  return { username, usernameKey: username.toLowerCase(), password };
}

/** Same-origin personal workspace API. No CORS or proxy-IP trust is enabled. */
export function createSyncAPI({
  databasePath,
  publicOrigin,
  secureCookies = false,
  allowRegistration = true,
  registrationCode = '',
  sessionTtlMs = 30 * 24 * 60 * 60 * 1000,
  rateLimit = {},
} = {}) {
  if (!databasePath) throw new Error('databasePath is required');
  if (!Number.isSafeInteger(sessionTtlMs) || sessionTtlMs < 1000) throw new Error('Invalid sessionTtlMs');
  let origin;
  if (publicOrigin) {
    const parsed = new URL(publicOrigin);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('publicOrigin must be an HTTP(S) origin');
    origin = parsed.origin;
  }
  if (secureCookies && origin && !origin.startsWith('https://')) throw new Error('Secure cookies require an HTTPS publicOrigin');
  if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS workspaces (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, space TEXT NOT NULL,
      revision INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, space), CHECK(space IN ('main', 'lab'))
    );
    CREATE TABLE IF NOT EXISTS workspace_history (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, space TEXT NOT NULL,
      revision INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, space, revision)
    );
  `);
  const sql = {
    user: db.prepare('SELECT * FROM users WHERE username_key = ?'),
    addUser: db.prepare('INSERT INTO users (id, username, username_key, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    session: db.prepare('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'),
    addSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'),
    removeSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    removeExpired: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    trimSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20)'),
    workspace: db.prepare('SELECT revision, data, updated_at FROM workspaces WHERE user_id = ? AND space = ?'),
    saveWorkspace: db.prepare('INSERT INTO workspaces (user_id, space, revision, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, space) DO UPDATE SET revision = excluded.revision, data = excluded.data, updated_at = excluded.updated_at'),
    addHistory: db.prepare('INSERT INTO workspace_history (user_id, space, revision, data, updated_at) VALUES (?, ?, ?, ?, ?)'),
    trimHistory: db.prepare('DELETE FROM workspace_history WHERE user_id = ? AND space = ? AND revision NOT IN (SELECT revision FROM workspace_history WHERE user_id = ? AND space = ? ORDER BY revision DESC LIMIT 20)'),
  };
  const cookieName = secureCookies ? '__Host-shixu_session' : 'shixu_session';
  const cookieSuffix = `; Path=/; HttpOnly; SameSite=Lax${secureCookies ? '; Secure' : ''}`;
  const attempts = new Map();
  const ipAttempts = new Map();
  const windowMs = Math.max(1000, rateLimit.windowMs ?? 15 * 60 * 1000);
  const maxAttempts = Math.max(1, rateLimit.maxAttempts ?? 10);
  const maxEntries = Math.max(100, rateLimit.maxEntries ?? 10000);
  const maxConcurrentHashes = Math.max(1, rateLimit.maxConcurrentHashes ?? 4);
  let activeHashes = 0;
  let lastSessionCleanup = 0;
  let closed = false;
  const dummySalt = randomBytes(16);

  function send(res, status, body) {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  }
  function checkCSRF(req) {
    const expectedOrigin = origin || `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
    if (req.headers['x-shixu-request'] !== '1' || req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin !== undefined && req.headers.origin !== expectedOrigin)) {
      throw new APIError(403, '请求来源校验失败，请从应用页面重试', 'invalid_origin');
    }
    if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] || '')) {
      throw new APIError(415, '请求必须使用 JSON 格式', 'unsupported_media_type');
    }
  }
  function sessionHash(req) {
    const values = (req.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${cookieName}=`));
    if (values.length !== 1) return '';
    const token = values[0].slice(cookieName.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? digest(token).toString('hex') : '';
  }
  function currentUser(req) {
    const now = Date.now();
    if (now - lastSessionCleanup > 60_000) {
      sql.removeExpired.run(now);
      lastSessionCleanup = now;
    }
    const hash = sessionHash(req);
    return hash ? sql.session.get(hash, now) || null : null;
  }
  function requireUser(req) {
    const user = currentUser(req);
    if (!user) throw new APIError(401, '请先登录再同步', 'unauthenticated');
    return user;
  }
  function startSession(req, res, user) {
    const oldHash = sessionHash(req);
    if (oldHash) sql.removeSession.run(oldHash);
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    sql.addSession.run(digest(token).toString('hex'), user.id, now + sessionTtlMs, now);
    sql.trimSessions.run(user.id, user.id);
    res.setHeader('Set-Cookie', `${cookieName}=${token}; Max-Age=${Math.floor(sessionTtlMs / 1000)}${cookieSuffix}`);
  }
  function throttle(map, key, maximum) {
    const now = Date.now();
    let entry = map.get(key);
    if (!entry || entry.until <= now) {
      if (map.size >= maxEntries) {
        for (const [entryKey, candidate] of map) if (candidate.until <= now) map.delete(entryKey);
        if (map.size >= maxEntries) map.delete(map.keys().next().value);
      }
      entry = { count: 0, until: now + windowMs };
      map.set(key, entry);
    }
    if (entry.count >= maximum) throw new APIError(429, '尝试次数过多，请稍后再试', 'rate_limited', { retryAfter: Math.ceil((entry.until - now) / 1000) });
    entry.count++;
  }
  async function hashPassword(password, salt) {
    if (activeHashes >= maxConcurrentHashes) throw new APIError(503, '登录服务繁忙，请稍后再试', 'server_busy', { retryAfter: 1 });
    activeHashes++;
    try {
      return await new Promise((resolveHash, reject) => scrypt(password, salt, 32, SCRYPT_OPTIONS, (error, hash) => error ? reject(error) : resolveHash(hash)));
    } finally { activeHashes--; }
  }
  function envelope(userId, row) {
    return { userId, revision: row?.revision ?? 0, data: row ? JSON.parse(row.data) : null, updatedAt: row?.updated_at ?? null };
  }
  function workspaceSpace(url) {
    const space = url.searchParams.get('space') || 'main';
    if (!['main', 'lab'].includes(space) || url.searchParams.getAll('space').length > 1) throw new APIError(400, '未知的工作区', 'invalid_space');
    return space;
  }
  const routes = new Map([
    ['/api/health', ['GET']], ['/api/session', ['GET']], ['/api/register', ['POST']],
    ['/api/login', ['POST']], ['/api/logout', ['POST']], ['/api/workspace', ['GET', 'PUT']],
  ]);

  async function handle(req, res, url) {
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return false;
    try {
      if (closed) throw new APIError(503, '服务正在重启，请稍后重试', 'server_unavailable');
      const methods = routes.get(url.pathname);
      if (!methods) throw new APIError(404, '接口不存在', 'not_found');
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new APIError(405, '不支持此请求方法', 'method_not_allowed');
      }
      if (!['GET', 'HEAD'].includes(req.method)) checkCSRF(req);
      if (url.pathname === '/api/health') { send(res, 200, { ok: true }); return true; }
      if (url.pathname === '/api/session') {
        send(res, 200, { user: currentUser(req), registrationAllowed: Boolean(allowRegistration), registrationCodeRequired: Boolean(registrationCode) });
        return true;
      }
      if (url.pathname === '/api/logout') {
        await readJSON(req, AUTH_LIMIT);
        const hash = sessionHash(req);
        if (hash) sql.removeSession.run(hash);
        res.setHeader('Set-Cookie', `${cookieName}=; Max-Age=0${cookieSuffix}`);
        send(res, 200, { user: null });
        return true;
      }
      if (url.pathname === '/api/register' || url.pathname === '/api/login') {
        const registering = url.pathname === '/api/register';
        const ip = req.socket.remoteAddress || 'unknown';
        throttle(ipAttempts, ip, maxAttempts * 8);
        const body = await readJSON(req, AUTH_LIMIT);
        const { username, usernameKey, password } = credentials(body);
        const attemptKey = `${ip}\0${usernameKey}`;
        throttle(attempts, attemptKey, maxAttempts);
        if (registering) {
          if (!allowRegistration) throw new APIError(403, '当前服务未开放注册，请联系管理员', 'registration_disabled');
          if (registrationCode && (typeof body.registrationCode !== 'string' || !timingSafeEqual(digest(body.registrationCode), digest(registrationCode)))) {
            throw new APIError(403, '邀请码不正确', 'invalid_registration_code');
          }
          const salt = randomBytes(16);
          const passwordHash = await hashPassword(password, salt);
          if (closed) throw new APIError(503, '服务正在重启，请稍后重试', 'server_unavailable');
          if (sql.user.get(usernameKey)) throw new APIError(409, '用户名已被使用', 'username_exists');
          const user = { id: randomUUID(), username };
          sql.addUser.run(user.id, username, usernameKey, salt.toString('hex'), passwordHash.toString('hex'), Date.now());
          startSession(req, res, user);
          attempts.delete(attemptKey);
          send(res, 201, { user });
        } else {
          const row = sql.user.get(usernameKey);
          const candidate = await hashPassword(password, row ? Buffer.from(row.password_salt, 'hex') : dummySalt);
          if (!timingSafeEqual(candidate, row ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(32)) || !row) {
            throw new APIError(401, '用户名或密码不正确', 'invalid_credentials');
          }
          if (closed) throw new APIError(503, '服务正在重启，请稍后重试', 'server_unavailable');
          const user = { id: row.id, username: row.username };
          startSession(req, res, user);
          attempts.delete(attemptKey);
          send(res, 200, { user });
        }
        return true;
      }
      const user = requireUser(req);
      const space = workspaceSpace(url);
      if (req.method === 'GET') { send(res, 200, envelope(user.id, sql.workspace.get(user.id, space))); return true; }
      const body = await readJSON(req, WORKSPACE_LIMIT);
      if (body.expectedUserId !== user.id) {
        throw new APIError(409, '登录账号已发生变化，请刷新页面确认账号后再同步', 'account_changed');
      }
      if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || body.expectedRevision >= Number.MAX_SAFE_INTEGER) {
        throw new APIError(400, '同步版本号不正确', 'invalid_revision');
      }
      const data = validateWorkspace(body.data);
      let result;
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = sql.workspace.get(user.id, space);
        if ((current?.revision ?? 0) !== body.expectedRevision) {
          throw new APIError(409, '版本已更新，请重试', 'revision_conflict', { current: envelope(user.id, current) });
        }
        const nextRevision = body.expectedRevision + 1;
        const timestamp = new Date().toISOString();
        const serialized = JSON.stringify(data);
        if (current) {
          sql.addHistory.run(user.id, space, current.revision, current.data, current.updated_at);
          sql.trimHistory.run(user.id, space, user.id, space);
        }
        sql.saveWorkspace.run(user.id, space, nextRevision, serialized, timestamp);
        db.exec('COMMIT');
        result = { userId: user.id, revision: nextRevision, data, updatedAt: timestamp };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      send(res, 200, result);
    } catch (error) {
      if (error instanceof APIError) {
        if (error.extra.retryAfter) res.setHeader('Retry-After', String(error.extra.retryAfter));
        send(res, error.status, { error: error.message, code: error.code, ...error.extra });
      } else {
        // Neither SQL error messages nor request bodies are exposed to clients.
        send(res, 500, { error: '同步服务暂时不可用，请稍后重试', code: 'internal_error' });
      }
    }
    return true;
  }

  return { handle, close() { if (!closed) { closed = true; db.close(); } } };
}

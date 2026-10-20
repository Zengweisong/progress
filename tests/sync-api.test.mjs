import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createSyncAPI } from '../server/sync-api.mjs';
import { seedData } from '../public/data.js';

const password = 'correct horse battery 934!';
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'shixu-sync-'));
  const databasePath = join(directory, 'workspace.sqlite');
  let api;
  let server;
  let origin;
  const cookieUsers = new Map();
  async function stop() {
    if (!server) return;
    server.closeIdleConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    api.close();
    server = null;
  }
  async function start() {
    api = createSyncAPI({ databasePath, ...options });
    server = createServer(async (req, res) => {
      if (!await api.handle(req, res, new URL(req.url, 'http://localhost'))) res.writeHead(404).end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  }
  await start();
  t.after(async () => { await stop(); await rm(directory, { recursive: true, force: true }); });
  async function request(path, { method = 'GET', body, cookie, headers = {}, raw } = {}) {
    const unsafe = !['GET', 'HEAD'].includes(method);
    if (method === 'PUT' && body && !Object.hasOwn(body, 'expectedUserId')) body = { ...body, expectedUserId: cookieUsers.get(cookie) };
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(unsafe ? { Origin: options.publicOrigin || origin, 'X-Shixu-Request': '1', 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(unsafe ? { body: raw ?? JSON.stringify(body ?? {}) } : {}),
    });
    const data = await response.json();
    const nextCookie = response.headers.get('set-cookie')?.split(';')[0];
    if (nextCookie && data.user?.id) cookieUsers.set(nextCookie, data.user.id);
    return { status: response.status, data, headers: response.headers, cookie: nextCookie };
  }
  async function register(username = 'alice', extra = {}) {
    const result = await request('/api/register', { method: 'POST', body: { username, password, ...extra } });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result;
  }
  return { request, register, databasePath, restart: async () => { await stop(); await start(); } };
}

test('session registration, safe cookie, login, and server-side logout invalidation', async t => {
  const f = await fixture(t);
  const guest = await f.request('/api/session');
  assert.deepEqual(guest.data, { user: null, registrationAllowed: true, registrationCodeRequired: false });
  const alice = await f.register();
  assert.equal(alice.data.user.username, 'alice');
  assert.match(alice.headers.get('set-cookie'), /HttpOnly/);
  assert.match(alice.headers.get('set-cookie'), /SameSite=Lax/);
  assert.match(alice.headers.get('set-cookie'), /Max-Age=2592000/);
  assert.doesNotMatch(JSON.stringify(alice.data), /password|token|salt|hash/);
  assert.deepEqual((await f.request('/api/session', { cookie: alice.cookie })).data.user, alice.data.user);
  assert.equal((await f.request('/api/login', { method: 'POST', body: { username: 'alice', password: 'incorrect password' } })).status, 401);
  const login = await f.request('/api/login', { method: 'POST', body: { username: 'ALICE', password }, cookie: alice.cookie });
  assert.equal(login.status, 200);
  assert.notEqual(login.cookie, alice.cookie);
  assert.equal((await f.request('/api/session', { cookie: alice.cookie })).data.user, null, 'Login rotates this browser session');
  assert.equal((await f.request('/api/logout', { method: 'POST', cookie: login.cookie })).status, 200);
  assert.equal((await f.request('/api/workspace', { cookie: login.cookie })).status, 401);
  const duplicate = await f.request('/api/register', { method: 'POST', body: { username: 'ALICE', password } });
  assert.equal(duplicate.status, 409);
});

test('workspace CAS, concurrent writers, tenant and layout-space isolation', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/workspace')).status, 401);
  const alice = await f.register();
  const bob = await f.register('bob');
  const first = await f.request('/api/workspace?space=main', { cookie: alice.cookie });
  assert.deepEqual(first.data, { userId: alice.data.user.id, revision: 0, data: null, updatedAt: null });
  const data = seedData();
  const save = await f.request('/api/workspace?space=main', { method: 'PUT', cookie: alice.cookie, body: { expectedRevision: 0, data, userId: bob.data.user.id } });
  assert.equal(save.status, 200);
  assert.equal(save.data.revision, 1);
  assert.deepEqual(save.data.data, data);
  assert.equal((await f.request('/api/workspace', { cookie: bob.cookie })).data.data, null);
  assert.equal((await f.request('/api/workspace?space=lab', { cookie: alice.cookie })).data.data, null);
  const conflict = await f.request('/api/workspace', { method: 'PUT', cookie: alice.cookie, body: { expectedRevision: 0, data } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.code, 'revision_conflict');
  assert.deepEqual(conflict.data.current, save.data);
  const updates = await Promise.all(['device-a', 'device-b'].map(title => {
    const changed = structuredClone(data);
    changed.projects[0].title = title;
    return f.request('/api/workspace', { method: 'PUT', cookie: alice.cookie, body: { expectedRevision: 1, data: changed } });
  }));
  assert.deepEqual(updates.map(r => r.status).sort(), [200, 409]);
  const final = await f.request('/api/workspace', { cookie: alice.cookie });
  assert.equal(final.data.revision, 2);
  assert.equal(final.data.data.projects[0].title, updates.find(r => r.status === 200).data.data.projects[0].title);
  assert.equal((await f.request('/api/workspace?space=lab', { method: 'PUT', cookie: alice.cookie, body: { expectedRevision: 0, data } })).data.revision, 1);
  assert.equal((await f.request('/api/workspace?space=unknown', { cookie: alice.cookie })).status, 400);
});

test('CSRF rejects foreign origin, missing request header and non-JSON requests', async t => {
  const f = await fixture(t, { publicOrigin: 'https://notes.example.test' });
  const alice = await f.register();
  const paths = ['/api/register', '/api/login', '/api/logout', '/api/workspace'];
  for (const path of paths) {
    const result = await f.request(path, { method: path === '/api/workspace' ? 'PUT' : 'POST', cookie: alice.cookie, headers: { Origin: 'https://evil.example.test' }, body: { username: 'mallory', password } });
    assert.equal(result.status, 403, path);
  }
  assert.equal((await f.request('/api/logout', { method: 'POST', cookie: alice.cookie, headers: { 'X-Shixu-Request': '' } })).status, 403);
  assert.equal((await f.request('/api/logout', { method: 'POST', cookie: alice.cookie, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.request('/api/logout', { method: 'POST', cookie: alice.cookie, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await f.request('/api/workspace', { method: 'POST', cookie: alice.cookie })).status, 405);
  assert.equal((await f.request('/api/health')).headers.get('cache-control'), 'no-store');
  assert.equal((await f.request('/api/unknown')).status, 404);
  assert.deepEqual((await f.request('/api/session', { cookie: alice.cookie })).data.user, alice.data.user);
});

test('an account switch between reading and writing cannot contaminate another account', async t => {
  const f = await fixture(t);
  const alice = await f.register('alice');
  const bob = await f.register('bob');
  const aliceData = seedData();
  const bobData = seedData();
  bobData.projects[0].title = 'Bob private workspace';
  for (const [account, data] of [[alice, aliceData], [bob, bobData]]) {
    assert.equal((await f.request('/api/workspace', { method: 'PUT', cookie: account.cookie, body: { expectedUserId: account.data.user.id, expectedRevision: 0, data } })).status, 200);
  }
  const beforeSwitch = await f.request('/api/workspace', { cookie: alice.cookie });
  aliceData.projects[0].title = 'Alice pending edit';
  // Another tab changes the shared browser cookie to Bob after Alice's GET.
  const rejected = await f.request('/api/workspace', { method: 'PUT', cookie: bob.cookie, body: { expectedUserId: alice.data.user.id, expectedRevision: beforeSwitch.data.revision, data: aliceData } });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.data.code, 'account_changed');
  assert.equal(rejected.data.current, undefined, 'Account mismatch must not disclose the new account snapshot');
  const missingIdentity = await f.request('/api/workspace', { method: 'PUT', cookie: bob.cookie, body: { expectedUserId: null, expectedRevision: 1, data: aliceData } });
  assert.equal(missingIdentity.data.code, 'account_changed');
  const afterSwitch = await f.request('/api/workspace', { cookie: bob.cookie });
  assert.equal(afterSwitch.data.revision, 1);
  assert.deepEqual(afterSwitch.data.data, bobData);
});

test('invalid JSON, revisions, workspace shapes, dangerous keys, size and depth are rejected without data loss', async t => {
  const f = await fixture(t);
  const alice = await f.register();
  const put = (body, extra = {}) => f.request('/api/workspace', { method: 'PUT', cookie: alice.cookie, body, ...extra });
  assert.equal((await put({}, { raw: '{' })).status, 400);
  assert.equal((await put({}, { raw: 'null' })).status, 400);
  assert.equal((await put({ expectedRevision: 0, data: {} })).status, 400);
  for (const expectedRevision of [-1, 0.5, '0', Number.MAX_SAFE_INTEGER]) {
    assert.equal((await put({ expectedRevision, data: seedData() })).status, 400);
  }
  const data = seedData();
  data.projects[0].tasks.push(data.projects[0].tasks[0]);
  assert.equal((await put({ expectedRevision: 0, data })).status, 400);
  const dangerous = JSON.stringify({ expectedUserId: alice.data.user.id, expectedRevision: 0, data: seedData() }).replace('"version":1', '"version":1,"__proto__":{"polluted":true}');
  assert.equal((await put({}, { raw: dangerous })).status, 400);
  const infinite = JSON.stringify({ expectedUserId: alice.data.user.id, expectedRevision: 0, data: seedData() }).replace('"custom":{}', '"custom":{"x":1e999}');
  assert.equal((await put({}, { raw: infinite })).status, 400);
  const deep = seedData();
  deep.extra = Array.from({ length: 30 }).reduce(v => [v], 1);
  assert.equal((await put({ expectedRevision: 0, data: deep })).status, 400);
  assert.equal((await put({ expectedRevision: 0, data: seedData(), padding: 'x'.repeat(5 * 1024 * 1024) })).status, 413);
  assert.equal((await f.request('/api/login', { method: 'POST', body: { username: 'alice', password, padding: 'x'.repeat(2048) } })).status, 413);
  assert.equal((await f.request('/api/workspace', { cookie: alice.cookie })).data.revision, 0);
});

test('database survives restart, stores password and session hashes, retains bounded history', async t => {
  const f = await fixture(t);
  const alice = await f.register();
  const data = seedData();
  for (let revision = 0; revision < 23; revision++) {
    data.projects[0].title = `Revision ${revision + 1}`;
    const saved = await f.request('/api/workspace', { method: 'PUT', cookie: alice.cookie, body: { expectedRevision: revision, data } });
    assert.equal(saved.status, 200);
  }
  await f.restart();
  const restored = await f.request('/api/workspace', { cookie: alice.cookie });
  assert.equal(restored.data.revision, 23);
  assert.equal(restored.data.data.projects[0].title, 'Revision 23');
  const db = new DatabaseSync(f.databasePath, { readOnly: true });
  try {
    const storedUser = db.prepare('SELECT * FROM users').get();
    assert.equal(Buffer.from(storedUser.password_salt, 'hex').length, 16);
    assert.equal(Buffer.from(storedUser.password_hash, 'hex').length, 32);
    assert.notEqual(storedUser.password_hash, password);
    const storedSession = db.prepare('SELECT * FROM sessions').get();
    assert.notEqual(storedSession.token_hash, alice.cookie.split('=')[1]);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM workspace_history').get().count, 20);
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  } finally { db.close(); }
});

test('registration restrictions and secure-cookie configuration', async t => {
  const disabled = await fixture(t, { allowRegistration: false });
  assert.equal((await disabled.request('/api/session')).data.registrationAllowed, false);
  assert.equal((await disabled.request('/api/register', { method: 'POST', body: { username: 'alice', password } })).data.code, 'registration_disabled');
  const guarded = await fixture(t, { registrationCode: 'private-invite', publicOrigin: 'https://notes.example.test', secureCookies: true });
  assert.equal((await guarded.request('/api/session')).data.registrationCodeRequired, true);
  assert.equal((await guarded.request('/api/register', { method: 'POST', body: { username: 'alice', password } })).data.code, 'invalid_registration_code');
  const alice = await guarded.register('alice', { registrationCode: 'private-invite' });
  assert.match(alice.headers.get('set-cookie'), /^__Host-shixu_session=/);
  assert.match(alice.headers.get('set-cookie'), /; Secure/);
  assert.doesNotMatch(alice.headers.get('set-cookie'), /Domain=/i);
  assert.equal((await guarded.request('/api/session', { cookie: alice.cookie })).data.user.id, alice.data.user.id);
});

test('failed-login throttle blocks repeated guesses and does not trust forwarded client IP', async t => {
  const f = await fixture(t, { rateLimit: { maxAttempts: 2 } });
  await f.register();
  for (let i = 0; i < 2; i++) {
    const failure = await f.request('/api/login', { method: 'POST', body: { username: 'alice', password: 'bad password 12345' }, headers: { 'X-Forwarded-For': `192.0.2.${i}` } });
    assert.equal(failure.status, 401);
  }
  const throttled = await f.request('/api/login', { method: 'POST', body: { username: 'ALICE', password }, headers: { 'X-Forwarded-For': '192.0.2.99' } });
  assert.equal(throttled.status, 429);
  assert.ok(Number(throttled.headers.get('retry-after')) > 0);
});

test('session expiry is enforced server-side', async t => {
  const f = await fixture(t, { sessionTtlMs: 1000 });
  const alice = await f.register();
  const db = new DatabaseSync(f.databasePath);
  try { db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1); }
  finally { db.close(); }
  assert.equal((await f.request('/api/session', { cookie: alice.cookie })).data.user, null);
  assert.equal((await f.request('/api/workspace', { cookie: alice.cookie })).status, 401);
});

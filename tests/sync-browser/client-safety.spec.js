import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { seedData } from '../../public/data.js';

test.use({ serviceWorkers: 'block' });

const origin = 'http://127.0.0.1:4183';
const password = 'client-safety-password-12345';
const storageKey = 'shixu.workspace.v1';
const headers = { Origin: origin, 'X-Shixu-Request': '1' };
const username = () => `safety-${randomUUID().slice(0, 12)}`;
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function register(api, name = username()) {
  const response = await api.post('/api/register', { headers, data: { username: name, password } });
  expect(response.status()).toBe(201);
  return (await response.json()).user;
}

async function saveRemote(api, user, data, expectedRevision = 0) {
  const response = await api.put('/api/workspace?space=main', { headers, data: { expectedUserId: user.id, expectedRevision, data } });
  expect(response.ok()).toBe(true);
  return response.json();
}

// The design gallery does not initialize the application sync client. This
// harness uses the real browser stores and network without incidental UI saves.
async function mount(page, { user, baseline, local = baseline, transition = false, revision = 1 }) {
  await page.evaluate(async ({ user, baseline, local, transition, revision, storageKey }) => {
    const { putSyncMeta } = await import('/sync-db.js');
    const { createSyncClient } = await import('/sync-client.js');
    await putSyncMeta('main', {
      version: 1, ownerId: user.id, user, baseRevision: revision, baseData: baseline,
      conflict: null, lastSyncedAt: null, ...(transition ? { transition: true } : {}),
    });
    window.syncData = structuredClone(local);
    localStorage.setItem(storageKey, JSON.stringify(window.syncData));
    window.appliedSnapshots = [];
    window.statusHistory = [];
    window.client = createSyncClient({
      space: 'main', storageKey, getData: () => window.syncData,
      canSync: () => true, pollInterval: 600000,
      applyData: value => {
        window.appliedSnapshots.push(structuredClone(value));
        window.syncData = structuredClone(value);
        localStorage.setItem(storageKey, JSON.stringify(value));
        return true;
      },
      onStatus: status => window.statusHistory.push(status.state),
    });
    await window.client.start();
  }, { user, baseline, local, transition, revision, storageKey });
}

async function holdNextWorkspaceGet(page) {
  const arrived = deferred(), release = deferred();
  let captured = false;
  const handler = async route => {
    if (route.request().method() !== 'GET' || captured) { await route.continue(); return; }
    captured = true;
    const response = await route.fetch();
    arrived.resolve();
    await release.promise;
    await route.fulfill({ response });
  };
  await page.route('**/api/workspace?space=main', handler);
  return { arrived: arrived.promise, release: release.resolve, dispose: () => page.unroute('**/api/workspace?space=main', handler) };
}

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.client?.destroy());
});

test('typing marks pending without reading a complete workspace on each keystroke', async ({ page }) => {
  await page.goto('/designs.html');
  const user = await register(page.request), baseline = seedData();
  await saveRemote(page.request, user, baseline); await mount(page, { user, baseline });
  const reads = await page.evaluate(() => {
    let value = window.syncData, reads = 0;
    Object.defineProperty(window, 'syncData', { configurable: true, get() { reads++; return value; }, set(next) { value = next; } });
    window.client.localChanged(); window.client.localChanged(); window.client.localChanged();
    return reads;
  });
  expect(reads).toBe(0);
  await page.evaluate(() => window.client.syncNow());
  expect(await page.evaluate(() => window.client.getStatus().state)).toBe('synced');
});

test('an external edit during GET survives even when localChanged was not called', async ({ page }) => {
  await page.goto('/designs.html');
  const user = await register(page.request);
  const baseline = seedData();
  await saveRemote(page.request, user, baseline);
  await mount(page, { user, baseline });
  expect(await page.evaluate(() => window.client.getStatus().state)).toBe('synced');

  const remote = structuredClone(baseline);
  remote.notes[0].body = 'GET 等待期间需要合并的云端笔记';
  await saveRemote(page.request, user, remote, 1);
  const held = await holdNextWorkspaceGet(page);
  try {
    await page.evaluate(() => { window.syncRun = window.client.syncNow(); });
    await held.arrived;
    await page.evaluate(key => {
      window.syncData.projects[0].title = '没有触发通知的本机新标题';
      localStorage.setItem(key, JSON.stringify(window.syncData));
      // Deliberately omit client.localChanged(): another integration changed
      // the backing data while the request was in flight.
    }, storageKey);
    held.release();
    await page.evaluate(() => window.syncRun);

    const result = await page.evaluate(key => ({
      status: window.client.getStatus(), stored: JSON.parse(localStorage.getItem(key)), applied: window.appliedSnapshots,
    }), storageKey);
    expect(result.status.state).toBe('synced');
    expect(result.stored.projects[0].title).toBe('没有触发通知的本机新标题');
    expect(result.stored.notes[0].body).toBe(remote.notes[0].body);
    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.applied.every(snapshot => snapshot.projects[0].title === '没有触发通知的本机新标题')).toBe(true);
    const confirmed = await (await page.request.get('/api/workspace?space=main')).json();
    expect(confirmed.data.projects[0].title).toBe(result.stored.projects[0].title);
    expect(confirmed.data.notes[0].body).toBe(remote.notes[0].body);
  } finally { held.release(); await held.dispose(); }
});

test('an unfinished workspace transition blocks automatic sync and merge until cloud recovery', async ({ page }) => {
  await page.goto('/designs.html');
  const user = await register(page.request);
  const baseline = seedData();
  baseline.projects[0].title = '服务器确认的账号工作区';
  await saveRemote(page.request, user, baseline);
  const local = seedData();
  local.projects[0].title = '中断切换前仍在本机的数据';
  local.preferences.view = 'table';
  let workspaceRequests = 0;
  page.on('request', request => { if (request.url().includes('/api/workspace?space=main')) workspaceRequests += 1; });
  await mount(page, { user, baseline, local, transition: true });
  expect(await page.evaluate(() => window.client.getStatus().state)).toBe('needs-connect');
  await page.evaluate(() => window.client.syncNow());
  const mergeError = await page.evaluate(async () => {
    try { await window.client.connect('merge'); return ''; } catch (error) { return error.message; }
  });
  expect(mergeError).toContain('上次切换未完成');
  expect(workspaceRequests).toBe(0);
  expect(await page.evaluate(() => window.appliedSnapshots)).toEqual([]);
  expect(await page.evaluate(() => window.syncData.projects[0].title)).toBe(local.projects[0].title);

  await page.evaluate(() => window.client.connect('cloud'));
  await expect.poll(() => page.evaluate(() => window.client.getStatus().state)).toBe('synced');
  const recovered = await page.evaluate(async key => {
    const { getSyncMeta, getRecovery } = await import('/sync-db.js');
    return { stored: JSON.parse(localStorage.getItem(key)), meta: await getSyncMeta('main'), backups: await getRecovery('main'), status: window.client.getStatus() };
  }, storageKey);
  expect(recovered.stored.projects[0].title).toBe(baseline.projects[0].title);
  expect(recovered.stored.preferences.view).toBe('table');
  expect(recovered.meta.transition).toBeUndefined();
  expect(recovered.meta.ownerId).toBe(user.id);
  expect(recovered.status.state).toBe('synced');
  expect(recovered.backups.some(backup => backup.data.projects[0].title === local.projects[0].title)).toBe(true);
  const remote = await (await page.request.get('/api/workspace?space=main')).json();
  expect(remote.revision).toBe(1);
  expect(remote.data.projects[0].title).toBe(baseline.projects[0].title);
});

test('switching the session after GET cannot write an old account snapshot into the new account', async ({ page, request }) => {
  await page.goto('/designs.html');
  const alice = await register(page.request);
  const aliceData = seedData();
  aliceData.projects[0].title = '甲账号原有项目';
  await saveRemote(page.request, alice, aliceData);
  const bob = await register(request);
  const bobData = seedData();
  bobData.projects[0].title = '乙账号独有项目';
  await saveRemote(request, bob, bobData);
  await mount(page, { user: alice, baseline: aliceData });
  await page.evaluate(key => {
    window.syncData.projects[0].title = '甲账号尚未上传的修改';
    localStorage.setItem(key, JSON.stringify(window.syncData));
  }, storageKey);

  const held = await holdNextWorkspaceGet(page);
  const rejectedWrite = page.waitForResponse(response => response.url().includes('/api/workspace?space=main') && response.request().method() === 'PUT');
  try {
    await page.evaluate(() => { window.syncRun = window.client.syncNow(); });
    await held.arrived;
    const login = await page.request.post('/api/login', { headers, data: { username: bob.username, password } });
    expect(login.ok()).toBe(true);
    held.release();
    await page.evaluate(() => window.syncRun);
    const rejected = await rejectedWrite;
    expect((await rejected.json()).code).toBe('account_changed');
    expect(await page.evaluate(() => window.client.getStatus().state)).toBe('signed-out');
    expect(await page.evaluate(() => window.syncData.projects[0].title)).toBe('甲账号尚未上传的修改');

    const remote = await (await page.request.get('/api/workspace?space=main')).json();
    expect(remote.userId).toBe(bob.id);
    expect(remote.revision).toBe(1);
    expect(remote.data).toEqual(bobData);
    await page.evaluate(() => window.client.syncNow());
    expect(await page.evaluate(() => window.client.getStatus().state)).toBe('needs-connect');
    const mergeError = await page.evaluate(async () => {
      try { await window.client.connect('merge'); return ''; } catch (error) { return error.message; }
    });
    expect(mergeError).toContain('本机内容属于另一个账号');
    await page.evaluate(() => window.client.connect('cloud'));
    const recovery = await page.evaluate(() => window.client.exportRecovery());
    expect(recovery.current.projects[0].title).toBe('乙账号独有项目');
    expect(recovery.archives.some(backup => backup.userId === alice.id && backup.data.projects[0].title === '甲账号尚未上传的修改')).toBe(true);
  } finally { held.release(); await held.dispose(); }
});

test('another tab changing workspace ownership blocks stale local content from uploading', async ({ page, request }) => {
  await page.goto('/designs.html');
  const alice = await register(page.request), bob = await register(request), baseline = seedData();
  await saveRemote(page.request, alice, baseline);
  await mount(page, { user: alice, baseline });
  await page.evaluate(async bob => {
    const { putSyncMeta } = await import('/sync-db.js');
    window.syncData.projects[0].title = '另一个账号的数据';
    localStorage.setItem('shixu.workspace.v1', JSON.stringify(window.syncData));
    await putSyncMeta('main', { version: 1, ownerId: bob.id, user: bob, baseRevision: 1, baseData: structuredClone(window.syncData), conflict: null });
    await window.client.syncNow();
  }, bob);
  expect(await page.evaluate(() => window.client.getStatus().state)).toBe('needs-connect');
  const mergeError = await page.evaluate(async () => {
    try { await window.client.connect('merge'); return ''; } catch (error) { return error.message; }
  });
  expect(mergeError).toContain('另一窗口已切换');
  const remote = await (await page.request.get('/api/workspace?space=main')).json();
  expect(remote.userId).toBe(alice.id);
  expect(remote.revision).toBe(1);
  expect(remote.data).toEqual(baseline);
});

test('a delayed PUT response cannot replace another tab account binding', async ({ page, request }) => {
  await page.goto('/designs.html');
  const alice = await register(page.request), bob = await register(request), baseline = seedData();
  await saveRemote(page.request, alice, baseline);
  await mount(page, { user: alice, baseline });
  await page.evaluate(() => { window.syncData.projects[0].title = '旧账号正在发送'; });
  const arrived = deferred(), release = deferred();
  const handler = async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    const response = await route.fetch(); arrived.resolve();
    await release.promise; await route.fulfill({ response });
  };
  await page.route('**/api/workspace?space=main', handler);
  try {
    await page.evaluate(() => { window.syncRun = window.client.syncNow(); });
    await arrived.promise;
    await page.evaluate(async bob => {
      const { putSyncMeta } = await import('/sync-db.js');
      await putSyncMeta('main', { version: 1, ownerId: bob.id, user: bob, baseRevision: 0, baseData: null, conflict: null });
    }, bob);
    release.resolve(); await page.evaluate(() => window.syncRun);
    const result = await page.evaluate(async () => {
      const { getSyncMeta, putSyncMeta } = await import('/sync-db.js');
      const meta = await getSyncMeta('main');
      let staleWrite;
      try { await putSyncMeta('main', { ...meta, ownerId: 'stale-owner' }, { ownerId: 'stale-owner', transition: false }); }
      catch (error) { staleWrite = error.code; }
      return { meta: await getSyncMeta('main'), staleWrite, status: window.client.getStatus().state };
    });
    expect(result.meta.ownerId).toBe(bob.id);
    expect(result.staleWrite).toBe('sync_owner_changed');
    expect(result.status).toBe('needs-connect');
  } finally { release.resolve(); await page.unroute('**/api/workspace?space=main', handler); }
});

test('an old conflict cannot bypass an unfinished account transition', async ({ page }) => {
  await page.goto('/designs.html');
  const user = await register(page.request), baseline = seedData();
  await saveRemote(page.request, user, baseline);
  await mount(page, { user, baseline });
  const result = await page.evaluate(async () => {
    const { getSyncMeta, putSyncMeta } = await import('/sync-db.js');
    const meta = await getSyncMeta('main');
    await putSyncMeta('main', { ...meta, transition: true, conflict: { base: meta.baseData, conflicts: [{ title: '旧冲突' }] } });
    await window.client.syncNow(); window.client.localChanged();
    let error = '';
    try { await window.client.resolveConflicts('both'); } catch (caught) { error = caught.message; }
    return { error, state: window.client.getStatus().state };
  });
  expect(result.state).toBe('needs-connect');
  expect(result.error).toContain('工作区连接尚未确认');
});

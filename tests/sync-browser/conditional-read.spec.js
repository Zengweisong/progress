import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { seedData } from '../../public/data.js';

test.use({ serviceWorkers: 'block' });
const key = 'shixu.workspace.v1';

test('upgrading a legacy baseline fetches existing cloud reviews before uploading', async ({ page }) => {
  await page.goto('/designs.html');
  const response = await page.request.post('/api/register', { headers: { 'X-Shixu-Request': '1' }, data: { username: `upgrade-${randomUUID().slice(0, 12)}`, password: 'upgrade-password-12345' } });
  const { user } = await response.json(), cloud = seedData();
  cloud.reviews.push({ id: 'cloud-review', title: '已有复盘', mode: 'daily', date: '2026-11-04', values: { event: '升级前已在云端' }, updatedAt: '2026-11-04T01:00:00Z' });
  const saved = await page.request.put('/api/workspace', { headers: { 'X-Shixu-Request': '1' }, data: { expectedUserId: user.id, expectedRevision: 0, data: cloud } });
  expect(saved.ok()).toBe(true);
  const legacy = structuredClone(cloud); delete legacy.reviews;
  await page.evaluate(async ({ user, legacy, key }) => {
    const { putSyncMeta } = await import('/sync-db.js');
    await putSyncMeta('main', { version: 1, ownerId: user.id, user, baseRevision: 1, baseData: legacy, conflict: null });
    window.syncData = structuredClone(legacy);
    const { createSyncClient } = await import('/sync-client.js');
    window.client = createSyncClient({ space: 'main', storageKey: key, getData: () => window.syncData, canSync: () => true, pollInterval: 600000, applyData: value => { window.syncData = value; return true; } });
    await window.client.start();
    await window.client.syncNow();
  }, { user, legacy, key });
  expect(await page.evaluate(() => window.syncData.reviews[0].values.event)).toBe('升级前已在云端');
  const remote = await (await page.request.get('/api/workspace', { headers: { 'X-Shixu-Reviews': '1' } })).json();
  expect(remote.data.reviews).toEqual(cloud.reviews);
  await page.evaluate(() => window.client.destroy());
});

test('unchanged polls return no body, local edits upload, and long text restores on another device', async ({ page, browser }) => {
  const username = `conditional-${randomUUID().slice(0, 12)}`, password = 'conditional-password-12345';
  await page.goto('/designs.html');
  const response = await page.request.post('/api/register', { headers: { 'X-Shixu-Request': '1' }, data: { username, password } });
  expect(response.status()).toBe(201);
  const { user } = await response.json(), baseline = seedData();
  const first = await page.request.put('/api/workspace?space=main', { headers: { 'X-Shixu-Request': '1' }, data: { expectedUserId: user.id, expectedRevision: 0, data: baseline } });
  expect(first.ok()).toBe(true);
  await page.evaluate(async ({ user, baseline, key }) => {
    const { putSyncMeta } = await import('/sync-db.js');
    await putSyncMeta('main', { version: 1, ownerId: user.id, user, baseRevision: 1, baseData: baseline, conflict: null, lastSyncedAt: null });
    window.syncData = baseline;
    const { createSyncClient } = await import('/sync-client.js');
    window.client = createSyncClient({ space: 'main', storageKey: key, getData: () => window.syncData, canSync: () => true, pollInterval: 600000, applyData: value => { window.syncData = value; return true; } });
    await window.client.start();
  }, { user, baseline, key });
  const poll = page.waitForResponse(response => response.url().includes('/api/workspace?space=main') && response.request().method() === 'GET');
  await page.evaluate(() => window.client.syncNow());
  const unchanged = await poll;
  expect(unchanged.status()).toBe(304);
  // Chromium does not expose a 304 body through its DevTools response API.
  // Read the response through fetch to verify that nothing was transferred.
  const empty = await page.evaluate(async etag => {
    const response = await fetch('/api/workspace?space=main', { cache: 'no-store', headers: { 'If-None-Match': etag, 'X-Shixu-Templates': '1', 'X-Shixu-Reviews': '1' } });
    return { status: response.status, text: await response.text() };
  }, unchanged.headers().etag);
  expect(empty).toEqual({ status: 304, text: '' });
  const body = '跨设备长正文'.repeat(1400);
  await page.evaluate(async body => { window.syncData.notes[0].body = body; window.client.localChanged(); await window.client.syncNow(); }, body);
  expect(await page.evaluate(() => window.client.getStatus().state)).toBe('synced');
  const remote = await (await page.request.get('/api/workspace?space=main')).json();
  expect(remote.data.notes[0].body).toBe(body);
  await page.evaluate(() => window.client.destroy());

  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.goto('http://127.0.0.1:4183/');
    await other.getByRole('button', { name: '账号与多端同步', exact: true }).click();
    await other.getByLabel('账号', { exact: true }).fill(username);
    await other.getByLabel('密码', { exact: true }).fill(password);
    await other.getByRole('button', { name: '登录账号', exact: true }).click();
    await other.getByRole('button', { name: /打开账号工作区/ }).click();
    await expect(other.locator('[data-sync-status]')).toHaveText('已同步');
    expect(await other.evaluate(key => JSON.parse(localStorage.getItem(key)).notes[0].bodyStorageId, key)).toBeTruthy();
    await other.getByRole('button', { name: '关闭账号与多端同步', exact: true }).click();
    await other.goto('http://127.0.0.1:4183/#knowledge/note/n1');
    await other.reload();
    expect(await other.evaluate(async key => (await (await import('/workspace-storage.js')).hydrateWorkspace(JSON.parse(localStorage.getItem(key)))).notes[0].body, key)).toBe(body);
  } finally { await context.close(); }
});

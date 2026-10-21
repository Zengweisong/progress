import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { seedData } from '../public/data.js';
import { createAppServer } from '../server.mjs';

test.setTimeout(90000);

const key = 'shixu.workspace.v1';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const headersFor = origin => ({ Origin: origin, 'X-Shixu-Request': '1' });
let testOrigin, directory, server;

// Use the actual application server with a disposable database even when this
// spec runs under the default config against an existing development service.
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shixu-storage-safety-'));
  server = createAppServer({ databasePath: join(directory, 'test.sqlite'), rateLimit: { maxAttempts: 200 } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  testOrigin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  if (server) await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
  if (directory) {
    const target = resolve(directory);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('shixu-storage-safety-')) throw new Error('Unexpected temporary database path');
    await rm(target, { recursive: true, force: true });
  }
});

async function seed(page, data = seedData()) {
  await page.addInitScript(({ key, data }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
  }, { key, data });
}
async function openSync(page) {
  await page.getByRole('button', { name: '账号与多端同步', exact: true }).first().click();
}
async function holdImagePersistence(page) {
  await page.evaluate(() => {
    const digest = SubtleCrypto.prototype.digest;
    window.imagePersistenceEntered = false;
    window.imagePersistenceCommitted = false;
    let holding = true;
    SubtleCrypto.prototype.digest = async function(algorithm, bytes) {
      const data = new TextDecoder().decode(bytes);
      if (holding && data.startsWith('data:image/')) {
        window.imagePersistenceEntered = true;
        await new Promise(resolve => {
          window.releaseImagePersistence = () => { holding = false; resolve(); };
        });
      }
      return digest.call(this, algorithm, bytes);
    };
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      const tx = transaction.call(this, stores, mode, ...rest);
      if (this.name === 'shixu-attachments-v1' && mode === 'readwrite') tx.addEventListener('complete', () => { window.imagePersistenceCommitted = true; });
      return tx;
    };
  });
}

test('actual app preserves a local edit made while incoming sync images are being persisted', async ({ page }) => {
  const origin = testOrigin, headers = headersFor(origin);
  const username = `safety-${randomUUID().slice(0, 12)}`;
  const registration = await page.request.post(`${origin}/api/register`, { headers, data: { username, password: 'storage-safety-password-12345' } });
  expect(registration.status()).toBe(201);
  const { user } = await registration.json();
  await seed(page); await page.goto(`${origin}/`);
  await openSync(page);
  await page.getByRole('button', { name: /同步本机工作区/ }).click();
  await expect(page.locator('#sync-dialog [data-sync-status]')).toHaveText('已同步');
  await page.getByRole('button', { name: '关闭账号与多端同步', exact: true }).click();

  const remote = await (await page.request.get(`${origin}/api/workspace?space=main`)).json();
  const previousBody = remote.data.notes[0].body;
  remote.data.notes[0].attachments = [{ id: 'remote-image', name: '同步.png', mime: 'image/png', data: image }];
  remote.data.notes[0].body += '\n\n![同步](attachment:remote-image)';
  await holdImagePersistence(page);
  const update = await page.request.put(`${origin}/api/workspace?space=main`, { headers, data: { expectedUserId: user.id, expectedRevision: remote.revision, data: remote.data } });
  expect(update.ok()).toBe(true);
  await openSync(page);
  await page.getByRole('button', { name: '立即同步', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.imagePersistenceEntered)).toBe(true);
  await page.getByRole('button', { name: '关闭账号与多端同步', exact: true }).click();
  await page.locator('[data-sidebar-project="p1"]').click();
  await page.getByRole('textbox', { name: '项目标题', exact: true }).fill('图片等待期间的本机编辑');
  await expect.poll(async () => (await stored(page)).projects[0].title).toBe('图片等待期间的本机编辑');
  await page.evaluate(() => window.releaseImagePersistence());
  await expect.poll(() => page.evaluate(() => window.imagePersistenceCommitted)).toBe(true);
  const local = await stored(page);
  expect(local.projects[0].title).toBe('图片等待期间的本机编辑');
  expect(local.notes[0].body).toBe(previousBody);
  expect(local.notes[0].attachments).toBeUndefined();
  await page.reload();
  await expect(page.getByRole('textbox', { name: '项目标题', exact: true })).toHaveValue('图片等待期间的本机编辑');
});

test('actual app rejects an in-flight image restoration after another window changes workspace ownership', async ({ page, context }) => {
  const data = seedData();
  data.notes[0].attachments = [{ id: 'deleted-image', name: '恢复.png', mime: 'image/png', data: image }];
  data.notes[0].body += '\n\n![恢复](attachment:deleted-image)';
  await seed(page, data); await page.goto(`${testOrigin}/#knowledge/note/n1`);
  await page.getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect.poll(async () => (await stored(page)).notes.some(note => note.id === 'n1')).toBe(false);
  // Reopening the app clears its in-memory image cache; restoration must persist
  // the durable recovery record's bytes before it can write image references.
  await page.reload();
  await holdImagePersistence(page);
  await page.getByRole('button', { name: '查看本机保存与备份状态', exact: true }).click();
  await page.getByRole('button', { name: /本机回收站/ }).click();
  await page.getByRole('button', { name: '恢复：让知识真正流动起来', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.imagePersistenceEntered)).toBe(true);

  const other = await context.newPage();
  try {
    await other.goto(`${testOrigin}/designs.html`);
    await other.evaluate(async key => {
      const { putSyncMeta } = await import('/sync-db.js');
      const { emptyWorkspace } = await import('/sync-merge.js');
      await putSyncMeta('main', { version: 1, ownerId: crypto.randomUUID(), user: null, baseRevision: 0, baseData: null, conflict: null, lastSyncedAt: null });
      localStorage.setItem(key, JSON.stringify(emptyWorkspace()));
    }, key);
    const replacement = await stored(other);
    await page.evaluate(() => window.releaseImagePersistence());
    await expect(page.locator('#toast')).toContainText('工作区已发生变化');
    expect(await stored(page)).toEqual(replacement);
    const recoveries = await page.evaluate(async () => (await (await import('/sync-db.js')).getRecovery('main')).filter(item => item.kind === 'trash'));
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0].userId).toBeNull();
    expect(recoveries[0].data.record.id).toBe('n1');
  } finally { await other.close(); }
});

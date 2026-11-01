import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { seedData, validateData } from '../public/data.js';

const key = 'shixu.workspace.v1';
const raw = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const portable = page => page.evaluate(async key => (await import('/workspace-storage.js')).hydrateWorkspace(JSON.parse(localStorage.getItem(key))), key);
async function seed(page, data) {
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
}

test('a 6 MB text backup imports, reloads and exports with complete contents', async ({ page }) => {
  const data = seedData(), template = data.notes[0];
  data.notes = Array.from({ length: 400 }, (_, i) => ({ ...template, id: `large-${i}`, title: `长正文 ${i}`, body: `${i}:` + '正文内容'.repeat(4000) }));
  const buffer = Buffer.from(JSON.stringify(data));
  expect(buffer.length).toBeGreaterThan(6 * 1024 * 1024);
  await page.goto('/');
  await page.getByRole('button', { name: '查看本机保存与备份状态', exact: true }).click();
  await page.locator('#import-file').setInputFiles({ name: 'large-text.json', mimeType: 'application/json', buffer });
  await page.getByRole('button', { name: '导入副本', exact: true }).click();
  await expect.poll(async () => (await raw(page)).notes.length).toBe(407);
  expect(await page.evaluate(key => localStorage.getItem(key).length, key)).toBeLessThan(500000);
  await page.reload();
  const restored = await portable(page); validateData(restored);
  expect(restored.notes.filter(note => note.title.startsWith('长正文'))).toHaveLength(400);
  expect(restored.notes.find(note => note.title === '长正文 399（导入）').body).toBe(data.notes[399].body);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '查看本机保存与备份状态', exact: true }).click();
  await page.getByRole('button', { name: /导出完整数据/ }).click();
  const exported = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  validateData(exported);
  expect(exported.notes.find(note => note.title === '长正文 0（导入）').body).toBe(data.notes[0].body);
  expect(JSON.stringify(exported)).not.toContain('bodyStorageId');
});

test('legacy long note, template and task text migrates and remains editable after reload', async ({ page }) => {
  const data = seedData();
  data.notes[0].body = '笔记正文'.repeat(1300);
  data.templates[0].body = '模板正文'.repeat(1300);
  data.projects[0].description = '项目说明'.repeat(1300);
  data.projects[0].tasks[0].description = '任务说明'.repeat(1300);
  await seed(page, data); await page.goto('/#knowledge/note/n1');
  const stored = await raw(page);
  expect(stored.notes[0].body).toBeUndefined(); expect(stored.notes[0].bodyStorageId).toBeTruthy();
  expect(stored.projects[0].descriptionStorageId).toBeTruthy();
  expect(stored.projects[0].tasks[0].descriptionStorageId).toBeTruthy();
  expect(stored.templates[0].bodyStorageId).toBeTruthy();
  await page.reload();
  expect((await portable(page)).notes[0].body).toBe(data.notes[0].body);
  expect((await portable(page)).projects[0].tasks[0].description).toBe(data.projects[0].tasks[0].description);
  const editor = page.getByRole('textbox', { name: '笔记正文', exact: true });
  const updated = '修改后的长正文'.repeat(900);
  await editor.fill(updated);
  await expect.poll(async () => (await portable(page)).notes[0].body).toBe(updated);
  await expect.poll(async () => (await raw(page)).notes[0].bodyStorageId).not.toBe(stored.notes[0].bodyStorageId);
  await page.reload(); expect((await portable(page)).notes[0].body).toBe(updated);
});

test('failed legacy text migration keeps the original snapshot and blocks overwrites', async ({ page }) => {
  const data = seedData(); data.notes[0].body = '迁移失败仍要保留'.repeat(800);
  await seed(page, data);
  await page.addInitScript(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      if (this.name === 'shixu-text-v1' && mode === 'readwrite') throw new DOMException('disk full', 'QuotaExceededError');
      return original.call(this, stores, mode, ...rest);
    };
  });
  await page.goto('/#knowledge/note/n1');
  await expect(page.locator('.storage-warning')).toContainText('迁移失败');
  expect(await raw(page)).toEqual(data);
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('保留内存草稿');
  expect(await raw(page)).toEqual(data);
});

test('background text persistence failure leaves the newly edited text durably inline', async ({ page }) => {
  await page.goto('/#knowledge/note/n1');
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      if (this.name === 'shixu-text-v1' && mode === 'readwrite') throw new DOMException('disk full', 'QuotaExceededError');
      return original.call(this, stores, mode, ...rest);
    };
  });
  const body = '后台转存失败'.repeat(1000);
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill(body);
  await expect.poll(async () => (await raw(page)).notes[0].body).toBe(body);
  // Wait for a later browser task after the background persistence attempt.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
  expect((await raw(page)).notes[0].body).toBe(body);
  await page.reload(); expect((await portable(page)).notes[0].body).toBe(body);
});

test('missing text references keep original storage and expose recoverable records', async ({ page }) => {
  const data = seedData(); delete data.notes[0].body;
  data.notes[0].bodyStorageId = 'missing-text';
  await seed(page, data); await page.goto('/#knowledge/note/n1');
  await expect(page.locator('.storage-warning')).toContainText('本机正文缺失');
  await expect(page.locator('#note-title')).toHaveValue(data.notes[0].title);
  expect(await raw(page)).toEqual(data);
});

test('a delayed background text commit never overwrites a newer workspace snapshot', async ({ page }) => {
  await page.goto('/#knowledge/note/n1');
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    let hold = true;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      const tx = original.call(this, stores, mode, ...rest);
      if (hold && this.name === 'shixu-text-v1' && mode === 'readwrite') {
        hold = false;
        Object.defineProperty(tx, 'oncomplete', { set(callback) {
          tx.addEventListener('complete', () => {
            window.textCommitted = true;
            window.releaseTextCommit = () => { callback(); window.textReleased = true; };
          });
        } });
      }
      return tx;
    };
  });
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('旧的长正文'.repeat(1100));
  await expect.poll(() => page.evaluate(() => window.textCommitted)).toBe(true);
  const newer = await page.evaluate(key => {
    const data = JSON.parse(localStorage.getItem(key));
    data.notes[0].body = '另一窗口的新内容';
    const serialized = JSON.stringify(data); localStorage.setItem(key, serialized);
    window.releaseTextCommit(); return serialized;
  }, key);
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 30)));
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(newer);
});

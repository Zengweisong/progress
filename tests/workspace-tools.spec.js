import { test, expect } from '@playwright/test';
import { seedData, validateData } from '../public/data.js';
import { readFile } from 'node:fs/promises';

const key = 'shixu.workspace.v1';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const raw = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const portable = page => page.evaluate(async key => (await import('/workspace-storage.js')).hydrateWorkspace(JSON.parse(localStorage.getItem(key))), key);
async function seed(page, data = seedData()) {
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
}
async function trash(page) {
  await page.getByRole('button', { name: '查看本机保存与备份状态', exact: true }).click();
  await page.getByRole('button', { name: /本机回收站/ }).click();
}

test('legacy images move out of localStorage and remain portable, reloadable and deduplicated', async ({ page }) => {
  const data = seedData();
  data.notes[0].attachments = [{ id: 'first', name: '一.png', mime: 'image/png', data: image }, { id: 'second', name: '二.png', mime: 'image/png', data: image }];
  data.notes[0].body = '![一](attachment:first)';
  await seed(page, data); await page.goto('/#knowledge/note/n1');
  await expect(page.locator('.cm-note-image img')).toHaveCount(1);
  const stored = await raw(page);
  expect(stored.notes[0].attachments[0].data).toBeUndefined();
  expect(stored.notes[0].attachments[0].storageId).toBe(stored.notes[0].attachments[1].storageId);
  validateData(await portable(page));
  const editor = page.getByRole('textbox', { name: '笔记正文', exact: true });
  await editor.focus(); await editor.press('Control+a'); await editor.pressSequentially('正文继续编辑');
  await expect.poll(async () => (await raw(page)).notes[0].body).toBe('正文继续编辑');
  expect((await raw(page)).notes[0].attachments[0].data).toBeUndefined();
  await page.reload(); await expect(page.getByRole('textbox', { name: '笔记正文', exact: true })).toHaveText('正文继续编辑');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '查看本机保存与备份状态', exact: true }).click();
  await page.getByRole('button', { name: /导出完整数据/ }).click();
  const exported = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  validateData(exported); expect(exported.notes[0].attachments[0].data).toBe(image);
});

test('failed image migration leaves the legacy workspace intact and prevents further writes', async ({ page }) => {
  const data = seedData(); data.notes[0].attachments = [{ id: 'first', name: '一.png', mime: 'image/png', data: image }];
  await seed(page, data);
  await page.addInitScript(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      if (this.name === 'shixu-attachments-v1' && mode === 'readwrite') throw new DOMException('图片磁盘已满', 'QuotaExceededError');
      return transaction.call(this, stores, mode, ...rest);
    };
  });
  await page.goto('/#knowledge/note/n1');
  await expect(page.locator('.storage-warning')).toContainText('迁移失败');
  expect((await raw(page)).notes[0].attachments[0].data).toBe(image);
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('内存里保留这次编辑');
  expect((await raw(page)).notes[0].body).toBe(data.notes[0].body);
});

test('a missing stored image prevents saving over the existing workspace', async ({ page }) => {
  const data = seedData();
  data.notes[0].attachments = [{ id: 'missing', name: '缺失.png', mime: 'image/png', storageId: 'not-in-the-image-store' }];
  await seed(page, data); await page.goto('/');
  await expect(page.locator('.storage-warning')).toContainText('本机图片缺失');
  expect(await raw(page)).toEqual(data);
  await page.goto('/#knowledge/note/n1');
  await expect(page.locator('#note-title')).toHaveValue(data.notes[0].title);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '查看本机保存与备份状态', exact: true }).click();
  await page.getByRole('button', { name: /导出完整数据/ }).click();
  const exported = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  validateData(exported); expect(exported.notes[0].body).toBe(data.notes[0].body);
});

test('a backup above 5 MB imports its images without filling localStorage', async ({ page }) => {
  const data = seedData(), template = data.notes[0];
  data.notes = Array.from({ length: 18 }, (_, index) => ({ ...template, id: `image-note-${index}`, attachments: [{ id: `image-${index}`, name: '大图片.png', mime: 'image/png', data: 'data:image/png;base64,' + 'A'.repeat(350000) }] }));
  const buffer = Buffer.from(JSON.stringify(data)); expect(buffer.length).toBeGreaterThan(5 * 1024 * 1024);
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: '查看本机保存与备份状态', exact: true }).click();
  await page.locator('#import-file').setInputFiles({ name: 'large-backup.json', mimeType: 'application/json', buffer });
  await page.getByRole('button', { name: '导入副本', exact: true }).click();
  await expect.poll(async () => (await raw(page)).notes.length).toBe(25);
  expect(await page.evaluate(key => localStorage.getItem(key).length, key)).toBeLessThan(100000);
  const restored = await portable(page); validateData(restored);
  expect(restored.notes.filter(n => n.attachments?.length)).toHaveLength(18);
});

test('deleted project survives reload in the recycle bin and restores tasks and note links', async ({ page }) => {
  await seed(page); await page.goto('/#projects/project/p1');
  await page.getByRole('button', { name: '删除项目', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect.poll(async () => (await raw(page)).projects.some(p => p.id === 'p1')).toBe(false);
  await page.reload(); await trash(page);
  await expect(page.getByRole('dialog', { name: '本机回收站', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '恢复：个人知识库 2.0', exact: true }).click();
  await expect.poll(async () => (await raw(page)).projects.some(p => p.id === 'p1')).toBe(true);
  const restored = await portable(page); validateData(restored);
  expect(restored.projects.find(p => p.id === 'p1').tasks).toHaveLength(5);
  expect(restored.notes.find(n => n.id === 'n1').projectIds).toContain('p1');
});

test('note deletion can be undone immediately, including its image attachments', async ({ page }) => {
  const data = seedData(); data.notes[0].attachments = [{ id: 'first', name: '一.png', mime: 'image/png', data: image }];
  await seed(page, data); await page.goto('/#knowledge/note/n1');
  await page.getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('回收站');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(async () => (await raw(page)).notes.some(n => n.id === 'n1')).toBe(true);
  expect((await portable(page)).notes.find(n => n.id === 'n1').attachments[0].data).toBe(image);
});

test('a recovery write failure does not delete the original project', async ({ page }) => {
  await seed(page); await page.goto('/#projects/project/p1');
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      if (this.name === 'shixu-sync-v1' && stores === 'recovery' && mode === 'readwrite') throw new Error('恢复副本无法保存');
      return transaction.call(this, stores, mode, ...rest);
    };
  });
  await page.getByRole('button', { name: '删除项目', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('恢复副本无法保存');
  expect((await raw(page)).projects.some(p => p.id === 'p1')).toBe(true);
});

test('recycle bin is isolated by workspace owner and permanent deletion requires its own confirmation', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.evaluate(async () => {
    const { archiveWorkspace } = await import('/sync-db.js');
    const record = { kind: 'note', record: { id: 'removed' } };
    await archiveWorkspace('main', 'other-account', '其他账号的私密笔记', record, 'trash');
    await archiveWorkspace('main', null, '本机删除的笔记', record, 'trash');
  });
  await trash(page);
  await expect(page.locator('.trash-list')).not.toContainText('其他账号');
  await page.getByRole('button', { name: '永久删除：本机删除的笔记', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '永久删除恢复副本？', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '永久删除', exact: true }).click();
  await expect(page.locator('.trash-list')).toContainText('回收站为空');
  const count = await page.evaluate(async () => (await (await import('/sync-db.js')).getRecovery('main')).length);
  expect(count).toBe(1);
});

test('search highlights safe body excerpts and opens the matching task with keyboard navigation', async ({ page }, info) => {
  const data = seedData();
  data.notes[0].body = '正文前面，定位关键词在这里。<img src=x onerror=alert(1)>';
  data.projects[0].tasks[0].title = '定位关键词任务';
  await seed(page, data); await page.goto('/');
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: '搜索项目、任务和笔记' }).fill('定位关键词');
  await expect(page.locator('#search-results .search-result')).toHaveCount(2);
  await expect(page.locator('.search-snippet mark')).toHaveText('定位关键词');
  await expect(page.locator('#search-results img')).toHaveCount(0);
  await page.screenshot({ path: `.tools/workspace-search-${info.project.name}.png` });
  await page.getByRole('group', { name: '搜索类型' }).getByRole('button', { name: '任务', exact: true }).click();
  await expect(page.locator('#search-results .search-result')).toHaveCount(1);
  await page.getByRole('textbox', { name: '搜索项目、任务和笔记' }).focus();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.locator('.drawer .search-located')).toContainText('定位关键词任务');
  await expect(page.getByRole('button', { name: '编辑任务：定位关键词任务', exact: true })).toBeFocused();
});

test('searching a note selects the body match and records actual recent visits', async ({ page }) => {
  const data = seedData(); data.notes[0].body = '前文\n\n目标段落\n\n后文';
  await seed(page, data); await page.goto('/#projects/project/p8');
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: '搜索项目、任务和笔记' }).fill('目标段落');
  await page.keyboard.press('Enter');
  await expect(page.locator('#note-title')).toHaveValue(data.notes[0].title);
  await expect(page.getByRole('textbox', { name: '笔记正文', exact: true })).toBeFocused();
  await page.locator('#note-title').focus(); await page.keyboard.press('Control+k');
  await expect(page.locator('#search-results .recent-heading')).toHaveText('最近打开');
  await expect(page.locator('#search-results .search-result').first()).toContainText(data.notes[0].title);
  await expect(page.locator('#search-results .search-result').nth(1)).toContainText(data.projects.find(p => p.id === 'p8').title);
});

test('Unicode case folding keeps highlights and editor selection inside the original text', async ({ page }) => {
  const data = seedData(); data.notes[0].body = 'İİİX';
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await seed(page, data); await page.goto('/'); await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: '搜索项目、任务和笔记' }).fill('x');
  await page.getByRole('group', { name: '搜索类型' }).getByRole('button', { name: '笔记', exact: true }).click();
  await expect(page.locator('#search-results [data-note="n1"] mark')).toHaveText('X');
  await page.locator('#search-results [data-note="n1"]').click();
  await expect(page.getByRole('textbox', { name: '笔记正文', exact: true })).toBeFocused();
  const selected = await page.evaluate(async () => {
    const { EditorView } = await import('/vendor/editor/codemirror.js');
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
    const { from, to } = view.state.selection.main;
    return { from, to, text: view.state.sliceDoc(from, to) };
  });
  expect(selected).toEqual({ from: 3, to: 4, text: 'X' });
  expect(errors).toEqual([]);
});

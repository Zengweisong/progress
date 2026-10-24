import { test, expect } from '@playwright/test';
import { seedData } from '../public/data.js';

const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const undo = async page => { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Control+z'); };
const stripTime = value => JSON.parse(JSON.stringify(value, (key, value) => key === 'updatedAt' ? undefined : value));
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test.beforeEach(async ({ page }) => {
  const data = seedData(); data.projects.forEach(p => { p.pinned = false; });
  data.projects[0].modules = [{ id: 'ui', name: '界面' }];
  data.notes[0].attachments = [{ id: 'image', name: '图片.png', mime: 'image/png', data: image }];
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/'); await expect(page.locator('.workspace-route')).toBeVisible();
});

test('Ctrl+Z restores a deleted project with tasks and note links', async ({ page }) => {
  const before = await read(page);
  await page.evaluate(() => { location.hash = '#projects/project/p1'; });
  await page.getByRole('button', { name: '删除项目', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect.poll(async () => (await read(page)).projects.some(p => p.id === 'p1')).toBe(false);
  await undo(page);
  await expect.poll(async () => stripTime(await read(page))).toEqual(stripTime(before));
  await page.reload(); expect(stripTime(await read(page))).toEqual(stripTime(before));
});

test('mixed task and note deletions undo in reverse order, preserving image bytes', async ({ page }) => {
  const before = await read(page);
  await page.evaluate(() => { location.hash = '#knowledge/note/n1'; });
  await page.getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect.poll(async () => (await read(page)).notes.some(n => n.id === 'n1')).toBe(false);
  await page.evaluate(() => { location.hash = '#projects/project/p1'; });
  await page.locator('.project-detail [data-action="edit-task"][data-id="p1-t0"]').click();
  await page.getByRole('button', { name: '删除任务', exact: true }).click();
  await expect.poll(async () => (await read(page)).projects[0].tasks.some(t => t.id === 'p1-t0')).toBe(false);
  await undo(page);
  await expect.poll(async () => (await read(page)).projects[0].tasks.some(t => t.id === 'p1-t0')).toBe(true);
  expect((await read(page)).notes.some(n => n.id === 'n1')).toBe(false);
  await undo(page);
  await expect.poll(async () => stripTime(await read(page))).toEqual(stripTime(before));
  const restored = await page.evaluate(async key => (await import('/workspace-storage.js')).hydrateWorkspace(JSON.parse(localStorage.getItem(key))), key);
  expect(restored.notes.find(n => n.id === 'n1').attachments[0].data).toBe(image);
});

test('actual project drag and subsequent task change undo in order and preserve drafts', async ({ page }) => {
  const ids = () => page.locator('[data-home-project]').evaluateAll(rows => rows.map(row => row.dataset.homeProject));
  const before = await read(page), initial = await ids();
  await page.locator('#route-capture-body').fill('保留草稿');
  const source = page.locator(`[data-home-project="${initial[1]}"] .home-record-handle`), target = page.locator('[data-home-project]').first();
  await source.scrollIntoViewIfNeeded(); await target.scrollIntoViewIfNeeded();
  const a = await source.boundingBox(), b = await target.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 45, b.y + 15, { steps: 16 }); await page.mouse.up();
  await expect.poll(ids).toEqual([initial[1], initial[0], ...initial.slice(2)]);
  const checkbox = page.locator('[data-route-task="p1-t0"] > input');
  const checked = await checkbox.isChecked(); await checkbox.press('Space');
  await undo(page); await expect(checkbox).toBeChecked({ checked });
  await undo(page); await expect.poll(ids).toEqual(initial);
  await expect.poll(async () => stripTime(await read(page))).toEqual(stripTime(before));
  await expect(page.locator('#route-capture-body')).toHaveValue('保留草稿');
});

test('task cross-module moves undo from the focused drag handle', async ({ page }) => {
  await page.evaluate(() => { location.hash = '#projects/project/p1'; });
  const before = await read(page), handle = page.locator('.project-detail [data-task-drag-handle="p1-t0"]');
  await handle.focus(); await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => (await read(page)).projects[0].tasks.find(t => t.id === 'p1-t0').moduleId).toBe('ui');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => stripTime(await read(page))).toEqual(stripTime(before));
});

test('editor and text input undo do not consume workspace history', async ({ page }) => {
  const checkbox = page.locator('[data-route-task="p1-t0"] > input'), initial = await checkbox.isChecked();
  await checkbox.setChecked(!initial);
  const input = page.locator('#route-capture-body'); await input.focus(); await input.pressSequentially('输入草稿'); await input.press('Control+z');
  await expect(checkbox).toBeChecked({ checked: !initial });
  await page.evaluate(() => { location.hash = '#knowledge/note/n1'; });
  const editor = page.getByRole('textbox', { name: '笔记正文', exact: true });
  await editor.fill('测试正文'); await editor.press('Control+a');
  await page.getByRole('button', { name: '加粗', exact: true }).click(); await editor.press('Control+z');
  await expect(editor).toHaveText('测试正文');
  expect((await read(page)).projects[0].tasks[0].done).toBe(!initial);
  await undo(page);
  await expect.poll(async () => (await read(page)).projects[0].tasks[0].done).toBe(initial);
  await expect(editor).toHaveText('测试正文');
});

test('toast restore removes only that deletion from history and reload starts a fresh history', async ({ page }) => {
  const checkbox = page.locator('[data-route-task="p1-t0"] > input'), initial = await checkbox.isChecked();
  await checkbox.setChecked(!initial);
  await page.evaluate(() => { location.hash = '#knowledge/note/n1'; });
  await page.getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('已恢复');
  await undo(page);
  await expect.poll(async () => (await read(page)).projects[0].tasks[0].done).toBe(initial);
  expect((await read(page)).notes.some(n => n.id === 'n1')).toBe(true);
  await page.reload(); const before = await read(page); await undo(page); expect(await read(page)).toEqual(before);
});

test('category and note sorting undo without overwriting later note edits', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop sidebar');
  await page.evaluate(() => { location.hash = '#knowledge'; });
  const expand = page.locator('[data-nav-expand="knowledge"]');
  if (await expand.getAttribute('aria-expanded') !== 'true') await expand.click();
  const before = await read(page);
  const category = page.locator('[data-record-drag="category"][data-order-section="knowledge"]').first();
  await category.press('Alt+ArrowDown');
  const categoryOrder = await read(page); expect(stripTime(categoryOrder)).not.toEqual(stripTime(before));
  const cards = page.locator('[data-order-note]'), ids = await cards.evaluateAll(rows => rows.map(row => row.dataset.orderNote));
  await cards.nth(1).locator('.note-record-handle').press('Alt+ArrowUp');
  await expect(cards.first()).toHaveAttribute('data-order-note', ids[1]);
  await page.evaluate(id => { location.hash = `#knowledge/note/${id}`; }, ids[1]);
  const editor = page.getByRole('textbox', { name: '笔记正文', exact: true });
  await editor.fill('排序后继续写的内容');
  await undo(page);
  await expect.poll(async () => (await read(page)).notes.map(n => n.order)).toEqual(categoryOrder.notes.map(n => n.order));
  await undo(page);
  const result = await read(page);
  expect(result.notes.find(n => n.id === ids[1]).body).toBe('排序后继续写的内容');
  expect(result.folders).toEqual(before.folders);
  await expect(editor).toHaveText('排序后继续写的内容');
});

test('failed undo writes keep the current order and durable data', async ({ page }) => {
  const handle = page.locator('[data-home-project]').nth(1).locator('.home-record-handle');
  await handle.press('Alt+ArrowUp');
  const before = await read(page), ids = await page.locator('[data-home-project]').evaluateAll(rows => rows.map(row => row.dataset.homeProject));
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await undo(page);
  await expect(page.locator('#toast')).toContainText('保存失败');
  expect(await read(page)).toEqual(before);
  expect(await page.locator('[data-home-project]').evaluateAll(rows => rows.map(row => row.dataset.homeProject))).toEqual(ids);
});

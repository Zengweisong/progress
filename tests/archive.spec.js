import { test, expect } from '@playwright/test';
import { seedData, validateData } from '../public/data.js';
const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
test.beforeEach(async ({ page }) => {
  const data = seedData(); data.projects = data.projects.slice(0, 2); data.projects[0].status = 'done'; data.projects[0].pinned = true;
  data.notes = data.notes.filter(note => note.projectIds.every(id => data.projects.some(p => p.id === id)));
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/#projects');
});
test('completed projects archive across all views and restore without losing tasks or notes', async ({ page }) => {
  const before = await read(page);
  await page.getByRole('button', { name: '归档已完成项目', exact: true }).click();
  await expect(page.locator('.mr-route-line')).toHaveCount(1);
  await expect(page.locator('[data-sidebar-project="p1"]')).toHaveCount(0);
  await expect(page.locator('.pinned-link[href="#projects/project/p1"]')).toHaveCount(0);
  for (const [view, selector] of [['board', '.project-card'], ['table', '.project-table tbody tr'], ['route', '.mr-route-line']]) {
    await page.goto(`/?layout=${view}${new URL(page.url()).hash}`); await expect(page.locator(selector)).toHaveCount(1);
  }
  await page.reload();
  await page.getByRole('button', { name: '已归档项目 1', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '已归档项目', exact: true });
  await dialog.getByRole('button', { name: `恢复项目：${before.projects[0].title}`, exact: true }).click();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await expect(page.locator('.mr-route-line')).toHaveCount(2);
  const saved = await read(page); validateData(saved);
  expect(saved.notes).toEqual(before.notes);
  expect(saved.projects[0]).toEqual({ ...before.projects[0], archived: false, updatedAt: saved.projects[0].updatedAt });
});
test('individual and completed task archives hide on routes and detail and restore original state', async ({ page }) => {
  const before = await read(page), p = before.projects[0], task = p.tasks.find(task => !task.done);
  await page.goto('/#projects/project/p1');
  await page.locator('.project-detail').getByRole('button', { name: `编辑任务：${task.title}`, exact: true }).click();
  await page.getByRole('button', { name: '归档事项', exact: true }).click();
  await expect(page.locator(`.project-detail [data-task-row="${task.id}"]`)).toHaveCount(0);
  await page.getByRole('button', { name: '归档已完成事项', exact: true }).click();
  const archivedCount = p.tasks.filter(task => task.done).length + 1;
  await page.getByRole('button', { name: `已归档事项 ${archivedCount}`, exact: true }).click();
  await page.getByRole('button', { name: `恢复事项：${task.title}`, exact: true }).click();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await expect(page.locator(`.project-detail [data-task-row="${task.id}"]`)).toHaveCount(1);
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  for (const done of p.tasks.filter(task => task.done)) await expect(page.locator(`[data-route-task="${done.id}"]`)).toHaveCount(0);
  await page.reload(); await expect(page.locator(`[data-route-task="${task.id}"]`)).toHaveCount(1);
  const saved = await read(page); validateData(saved);
  expect(saved.projects[0].tasks.find(t => t.id === task.id)).toEqual({ ...task, archived: false });
  expect(saved.projects[0].tasks).toHaveLength(p.tasks.length);
  expect(saved.notes).toEqual(before.notes);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
test('individual projects archive and failed task and project writes roll back', async ({ page }) => {
  await page.goto('/#projects/project/p2');
  await page.getByRole('button', { name: '归档项目', exact: true }).click();
  await expect(page.locator('.project-detail')).toHaveCount(0);
  expect((await read(page)).projects[1].archived).toBe(true);
  await page.goto('/#projects/project/p1');
  const before = await read(page);
  await page.evaluate(key => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); }; }, key);
  await page.getByRole('button', { name: '归档已完成事项', exact: true }).click();
  expect(await read(page)).toEqual(before);
  await page.getByRole('button', { name: '归档项目', exact: true }).click();
  expect(await read(page)).toEqual(before);
  await expect(page.locator('.project-detail')).toBeVisible();
});

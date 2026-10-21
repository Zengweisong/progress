import { test, expect } from '@playwright/test';
import { seedData, validateData } from '../public/data.js';
const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
test.beforeEach(async ({ page }) => {
  const data = seedData(); data.projects = [data.projects[0]]; data.projects[0].pinned = false;
  data.notes = data.notes.slice(0, 2); data.notes.forEach(note => { note.projectIds = ['p1']; }); data.notes[0].category = '';
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/#projects');
});
async function editDefaultCategory(page, mobile) {
  await page.goto('/#knowledge');
  if (mobile) {
    await page.getByRole('combobox', { name: '二级分类', exact: true }).selectOption('knowledge/category/');
    await page.getByRole('button', { name: '编辑当前分类', exact: true }).click();
  } else {
    const expand = page.locator('[data-nav-expand="knowledge"]');
    if (await expand.getAttribute('aria-expanded') !== 'true') await expand.click();
    const edit = page.getByRole('button', { name: '编辑未分类分类', exact: true });
    await edit.locator('..').hover(); await edit.click();
  }
  return page.getByRole('dialog', { name: '编辑二级分类', exact: true });
}
test('the default category can be renamed without changing note contents or links', async ({ page, isMobile }) => {
  const before = await read(page), modal = await editDefaultCategory(page, isMobile);
  await expect(modal.getByRole('textbox', { name: '分类名称', exact: true })).toHaveValue('未分类');
  await modal.getByRole('textbox', { name: '分类名称', exact: true }).fill('我的文章');
  await modal.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page).toHaveURL(/knowledge\/category\//);
  const saved = await read(page); validateData(saved);
  expect(saved.notes[0]).toMatchObject({ ...before.notes[0], category: '我的文章', updatedAt: saved.notes[0].updatedAt });
  await page.reload();
  await expect(page.locator('#nav-children-knowledge [data-note-fold=""]')).toHaveCount(0);
  expect((await read(page)).notes[0].category).toBe('我的文章');
});
test('deleting the default category retains articles directly in the sidebar after reload', async ({ page, isMobile }) => {
  const before = await read(page), modal = await editDefaultCategory(page, isMobile);
  await modal.getByRole('button', { name: '删除分类', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这个分类？', exact: true }).getByRole('button', { name: '删除分类', exact: true }).click();
  await expect(page).toHaveURL(/#knowledge$/);
  await page.reload();
  await expect(page.locator('#nav-children-knowledge [data-note-fold=""]')).toHaveCount(0);
  const article = page.locator('#nav-children-knowledge [data-sidebar-note="n1"]');
  await expect(article).toHaveCount(1);
  if (!isMobile) { await article.click(); await expect(page.locator('#note-title')).toHaveValue(before.notes[0].title); }
  const saved = await read(page); validateData(saved); expect(saved.notes).toEqual(before.notes);
});
test('an untouched single route hides its heading and a custom name remains visible', async ({ page }, info) => {
  await expect(page.locator('.mr-module-heading')).toHaveCount(0);
  await expect(page.locator('.mr-station')).toHaveCount((await read(page)).projects[0].tasks.length);
  await page.screenshot({ path: `.tools/default-route-${info.project.name}.png`, fullPage: true });
  await page.locator('.mr-dock-title').click();
  await expect(page.locator('.module-heading')).toHaveCount(0);
  await page.getByRole('button', { name: '编辑默认线路', exact: true }).click();
  await page.getByRole('textbox', { name: '模块名称', exact: true }).fill('计划');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.locator('.module-heading')).toContainText('计划');
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await expect(page.locator('.mr-module-heading')).toContainText('计划');
  await page.reload(); await expect(page.locator('.mr-module-heading')).toContainText('计划');
});
test('deleting a renamed default module preserves its tasks and removes its heading', async ({ page }) => {
  const before = await read(page);
  await page.locator('.mr-dock-title').click(); await page.getByRole('button', { name: '编辑默认线路', exact: true }).click();
  await page.getByRole('textbox', { name: '模块名称', exact: true }).fill('计划');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.locator('.project-detail').getByRole('button', { name: '重命名模块：计划', exact: true }).click();
  await page.getByRole('button', { name: '删除模块，保留事项并取消分组', exact: true }).click();
  await expect(page.locator('.module-heading')).toHaveCount(0);
  const saved = await read(page); validateData(saved);
  expect(saved.projects[0].tasks.map(task => ({ ...task, moduleId: '' }))).toEqual(before.projects[0].tasks.map(task => ({ ...task, moduleId: '' })));
  await page.reload(); await expect(page.locator('.module-heading')).toHaveCount(0);
});
test('deleting a default module moves tasks to the first module without an empty replacement', async ({ page }) => {
  await page.evaluate(key => { const data = JSON.parse(localStorage.getItem(key)); data.projects[0].modules = [{ id: 'ui', name: '界面' }]; localStorage.setItem(key, JSON.stringify(data)); }, key);
  await page.reload(); await page.locator('.mr-dock-title').click();
  const before = await read(page);
  await page.locator('.project-detail').getByRole('button', { name: '重命名模块：默认模块', exact: true }).click();
  await page.getByRole('button', { name: '删除模块，事项移至首个模块', exact: true }).click();
  await expect(page.locator('.project-detail [data-task-zone]')).toHaveCount(1);
  await expect(page.locator('.project-detail [data-task-zone]')).toHaveAttribute('data-module-id', 'ui');
  const saved = await read(page); validateData(saved);
  expect(saved.projects[0].tasks).toEqual(before.projects[0].tasks.map(task => ({ ...task, moduleId: 'ui' })));
  await page.reload(); await expect(page.locator('.project-detail [data-task-zone]')).toHaveCount(1);
});

test('a failed category deletion keeps both its navigation and all articles', async ({ page, isMobile }) => {
  const before = await read(page), modal = await editDefaultCategory(page, isMobile);
  await modal.getByRole('button', { name: '删除分类', exact: true }).click();
  await page.evaluate(key => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); }; }, key);
  await page.getByRole('dialog', { name: '删除这个分类？', exact: true }).getByRole('button', { name: '删除分类', exact: true }).click();
  expect(await read(page)).toEqual(before);
  await expect(page.getByRole('dialog', { name: '删除这个分类？', exact: true })).toBeVisible();
  await expect(page.locator('#nav-children-knowledge [data-note-fold=""]')).toHaveCount(1);
});

test('a failed default module deletion restores task membership and the visible module', async ({ page }) => {
  await page.evaluate(key => { const data = JSON.parse(localStorage.getItem(key)); data.projects[0].modules = [{ id: 'ui', name: '界面' }]; localStorage.setItem(key, JSON.stringify(data)); }, key);
  await page.reload(); await page.locator('.mr-dock-title').click();
  const before = await read(page);
  await page.locator('.project-detail').getByRole('button', { name: '重命名模块：默认模块', exact: true }).click();
  await page.evaluate(key => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); }; }, key);
  await page.getByRole('button', { name: '删除模块，事项移至首个模块', exact: true }).click();
  expect(await read(page)).toEqual(before);
  await expect(page.locator('.project-detail [data-task-zone]')).toHaveCount(2);
});

import { test, expect } from '@playwright/test';
import { seedData, validateData } from '../public/data.js';

const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
test.beforeEach(async ({ page }) => {
  const data = seedData(); data.projects = [data.projects[2]]; data.notes = [];
  data.projects[0].modules = [{ id: 'other', name: '服务端' }];
  data.projects[0].tasks[2].moduleId = 'other';
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/');
});

test('rename the default group from route and detail, retaining tasks, drafts and selection labels', async ({ page }) => {
  const original = await read(page);
  const draft = page.getByRole('textbox', { name: '在默认模块中添加任务', exact: true });
  await draft.fill('尚未提交的事项');
  await page.getByRole('button', { name: '重命名模块：默认模块', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '模块名称', exact: true })).toHaveValue('默认模块');
  await page.getByRole('textbox', { name: '模块名称', exact: true }).fill('总体');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('region', { name: '总体模块线路', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '在总体中添加任务', exact: true })).toHaveValue('尚未提交的事项');
  await expect(page.getByRole('button', { name: '重命名模块：默认模块', exact: true })).toHaveCount(0);
  await page.locator('.mr-dock-title').click();
  const detail = page.locator('.project-detail');
  await expect(detail.getByRole('region', { name: '总体模块', exact: true }).locator('[data-task-row]')).toHaveCount(2);
  await detail.getByRole('button', { name: '编辑任务：整理学习路线', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '所属模块', exact: true }).locator('option').first()).toHaveText('总体');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await detail.getByRole('button', { name: '重命名模块：总体', exact: true }).click();
  await page.getByRole('textbox', { name: '模块名称', exact: true }).fill('计划');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(detail.getByRole('region', { name: '计划模块', exact: true })).toBeVisible();
  const saved = await read(page); validateData(saved);
  expect(saved.projects[0].tasks).toEqual(original.projects[0].tasks);
  expect(saved.projects[0].modules).toEqual(original.projects[0].modules);
  expect(saved.projects[0].ungroupedName).toBe('计划');
  await page.reload();
  await expect(detail.getByRole('button', { name: '重命名模块：计划', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await expect(page.getByRole('region', { name: '计划模块线路', exact: true })).toBeVisible();
});

test('duplicate names and failed writes preserve the default group and all its tasks', async ({ page }) => {
  const original = await read(page);
  await page.getByRole('button', { name: '重命名模块：默认模块', exact: true }).click();
  await page.getByRole('textbox', { name: '模块名称', exact: true }).fill('服务端');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('不重复');
  expect(await read(page)).toEqual(original);
  await page.getByRole('textbox', { name: '模块名称', exact: true }).fill('总体');
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '重命名模块', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '模块名称', exact: true })).toHaveValue('总体');
  expect(await read(page)).toEqual(original);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('region', { name: '默认模块模块线路', exact: true })).toBeVisible();
});

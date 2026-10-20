import { test, expect } from '@playwright/test';
import { seedData } from '../public/data.js';

const mainKey = 'shixu.workspace.v1', labKey = 'shixu-layout-lab-v1', viewKey = 'shixu.workspace.layout.v1';
const view = (page, value) => page.locator(`button[data-view="${value}"]`);
const projectLine = (page, id) => page.locator('.mr-route-line').filter({ has: page.locator(`[data-select-project="${id}"]`) });
const readData = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), mainKey);

async function prepare(page, data = seedData()) {
  await page.addInitScript(({ data, mainKey, labKey }) => {
    if (!localStorage.getItem(mainKey)) localStorage.setItem(mainKey, JSON.stringify(data));
    if (!localStorage.getItem(labKey)) localStorage.setItem(labKey, 'independent laboratory data');
  }, { data, mainKey, labKey });
}

test('default route reads existing workspace; layout choices survive reload without changing data', async ({ page }) => {
  const data = seedData(); data.projects[0].title = '我原来的项目'; data.preferences.view = 'table';
  await prepare(page, data); await page.goto('/');
  await expect(view(page, 'route')).toHaveAttribute('aria-pressed', 'true');
  await expect(projectLine(page, 'p1')).toContainText('我原来的项目');
  for (const value of ['board', 'table', 'route']) {
    await view(page, value).click(); await page.reload();
    await expect(view(page, value)).toHaveAttribute('aria-pressed', 'true');
    expect(await readData(page)).toEqual(data);
    expect(await page.evaluate(key => localStorage.getItem(key), labKey)).toBe('independent laboratory data');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test('route completes tasks, adds multiple tasks and saves linked notes in main workspace', async ({ page }) => {
  await prepare(page); await page.goto('/');
  await page.locator('[data-select-project="p2"]').click();
  const line = projectLine(page, 'p2');
  await line.getByRole('checkbox', { name: '设计文章阅读页', exact: true }).check();
  await expect(line.locator('.mr-line-percent')).toHaveText('60%');
  await page.locator('[data-route-kind="task"]').click();
  await page.locator('#route-capture-body').fill('新增任务一\n新增任务二');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(line.getByRole('checkbox', { name: '新增任务二', exact: true })).toBeAttached();
  await page.locator('[data-route-kind="note"]').click();
  await page.locator('#route-capture-body').fill('路线上的项目笔记\n记录正文');
  await page.locator('#route-capture-body').press('Control+Enter');
  await expect(page.locator('.route-records')).toContainText('路线上的项目笔记');
  let saved = await readData(page);
  expect(saved.projects.find(p => p.id === 'p2').tasks).toHaveLength(7);
  expect(saved.notes[0]).toMatchObject({ title: '路线上的项目笔记', body: '路线上的项目笔记\n记录正文', projectIds: ['p2'], inbox: false });
  await page.reload();
  await expect(projectLine(page, 'p2').getByRole('checkbox', { name: '设计文章阅读页', exact: true })).toBeChecked();
  expect(await readData(page)).toEqual(saved);
  expect(await page.evaluate(key => localStorage.getItem(key), labKey)).toBe('independent laboratory data');
});

test('drafts stay with their projects through selection, filters, views and details', async ({ page }) => {
  await prepare(page); await page.goto('/');
  await page.locator('[data-select-project="p1"]').click();
  await page.locator('#route-capture-body').fill('项目一的未完成草稿');
  await page.locator('[data-select-project="p2"]').click();
  await expect(page.locator('#route-capture-body')).toHaveValue('');
  await page.locator('#route-capture-body').fill('项目二的未完成草稿');
  await view(page, 'table').click(); await view(page, 'route').click();
  await expect(page.locator('#route-capture-body')).toHaveValue('项目二的未完成草稿');
  await page.locator('.mr-dock-title').click();
  await expect(page.getByRole('dialog', { name: '项目详情：独立博客改版' })).toBeVisible();
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await expect(page.locator('#route-capture-body')).toHaveValue('项目二的未完成草稿');
  await page.locator('[data-filter="done"]').click();
  await expect(page.locator('.mr-route-line')).toHaveCount(1);
  await page.locator('[data-filter="all"]').click();
  await page.locator('[data-select-project="p1"]').click();
  await expect(page.locator('#route-capture-body')).toHaveValue('项目一的未完成草稿');
  await expect(page.locator('.storage-warning')).toHaveCount(0);
  expect((await readData(page)).notes).toHaveLength(seedData().notes.length);
});

test('empty workspace captures inbox notes and supports project creation', async ({ page }) => {
  const data = seedData(); data.projects = []; data.notes = [];
  await prepare(page, data); await page.goto('/');
  await expect(page.locator('[data-route-kind="task"]')).toBeDisabled();
  await page.locator('#route-capture-body').fill('暂时没有项目的想法');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  expect((await readData(page)).notes[0]).toMatchObject({ inbox: true, projectIds: [], title: '暂时没有项目的想法' });
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('第一个路线项目');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await expect(page.locator('.mr-route-line')).toContainText('第一个路线项目');
});

test('lab apply link opens real workspace in route layout and preserves both stores', async ({ page }) => {
  await prepare(page); await page.goto('/?layout=table');
  await expect(view(page, 'table')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(key => localStorage.removeItem(key), labKey);
  await page.goto('/layouts.html?layout=route');
  const labData = await page.evaluate(key => localStorage.getItem(key), labKey);
  const mainData = await readData(page);
  await page.getByRole('link', { name: '应用到我的工作区' }).click();
  await expect(view(page, 'route')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/\/#projects$/);
  expect(await readData(page)).toEqual(mainData);
  expect(await page.evaluate(key => localStorage.getItem(key), labKey)).toEqual(labData);
});

test('route renders safely at each viewport and preserves capture during Chinese composition', async ({ page }, testInfo) => {
  await prepare(page); await page.goto('/');
  const input = page.locator('#route-capture-body');
  await input.fill('<img src=x onerror="window.routeInjection=true">');
  await input.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true });
  expect((await readData(page)).notes).toHaveLength(seedData().notes.length);
  await input.press('Control+Enter');
  expect(await page.evaluate(() => window.routeInjection)).toBeUndefined();
  await expect(page.locator('.route-records img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `docs/screenshots/workspace-route-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' });
});

test('failed storage keeps the draft and does not duplicate newly captured tasks', async ({ page }) => {
  await prepare(page); await page.goto('/');
  await page.locator('[data-select-project="p1"]').click();
  await page.locator('[data-route-kind="task"]').click();
  await page.locator('#route-capture-body').fill('存储不足时保留的任务');
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('No room', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, mainKey);
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(page.locator('#route-capture-body')).toHaveValue('存储不足时保留的任务');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await view(page, 'table').click(); await view(page, 'route').click();
  await expect(projectLine(page, 'p1').getByRole('checkbox', { name: '存储不足时保留的任务', exact: true })).toHaveCount(0);
  await expect(page.locator('#route-capture-body')).toHaveValue('存储不足时保留的任务');
  expect((await readData(page)).projects.find(p => p.id === 'p1').tasks).toHaveLength(5);
});

test('creating a project in a filtered route reveals and selects the new project', async ({ page }) => {
  await prepare(page); await page.goto('/');
  await page.locator('[data-filter="done"]').click();
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('新建的路线');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await expect(page.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.mr-dock-title')).toContainText('新建的路线');
});

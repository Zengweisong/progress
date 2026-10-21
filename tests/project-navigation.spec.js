import { test, expect } from '@playwright/test';
import { seedData } from '../public/data.js';

const key = 'shixu.workspace.v1';
async function prepare(page, grouped = false) {
  const data = seedData(); data.projects = data.projects.slice(0, 3); data.notes = []; data.folders = [];
  data.projects.forEach((project, index) => { project.tag = ''; project.pinned = false; project.title = ['笔记软件', '小红书小程序', '恩皿中心'][index]; });
  if (grouped) {
    data.projects[1].tag = '工作'; data.projects[2].tag = '工作';
    data.folders.push({ id: 'empty-folder', section: 'projects', name: '待规划', updatedAt: data.projects[0].updatedAt });
  }
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/#projects');
  return data;
}

test('uncategorized projects display their names and the workspace has no slogan', async ({ page }, info) => {
  const original = await prepare(page);
  await expect(page.locator('.workspace-projects')).not.toContainText('下一站');
  await expect(page.locator('#nav-children-projects .nav-subitem')).toHaveCount(0);
  await expect(page.locator('[data-sidebar-project]')).toHaveCount(3);
  for (const title of ['笔记软件', '小红书小程序', '恩皿中心']) await expect(page.locator('#nav-children-projects')).toContainText(title);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).toEqual(original);
  await expect(page.locator('.workspace-projects .toolbar').getByRole('button', { name: '新建项目', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `.tools/project-navigation-${info.project.name}.png`, fullPage: true });
  if (info.project.name !== 'mobile') {
    await page.locator('[data-sidebar-project="p2"]').click();
    await expect(page.getByRole('dialog', { name: '项目详情：小红书小程序', exact: true })).toBeVisible();
    await expect(page.locator('[data-sidebar-project="p2"]')).toHaveAttribute('aria-current', 'page');
  }
});

test('custom categories list their projects and preserve navigation on close and reload', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Desktop sidebar navigation');
  await prepare(page, true);
  await page.screenshot({ path: `.tools/sidebar-actions-${info.project.name}.png`, fullPage: true });
  const group = page.locator('.nav-project-category').filter({ has: page.locator('.nav-category-name', { hasText: /^工作$/ }) });
  await expect(group.locator('[data-sidebar-project]')).toHaveCount(2);
  await expect(page.locator('.nav-project-category').filter({ hasText: '待规划' }).locator('[data-sidebar-project]')).toHaveCount(0);
  await group.locator('[data-sidebar-project="p2"]').click();
  await expect(page.getByRole('dialog', { name: '项目详情：小红书小程序', exact: true })).toBeVisible();
  await page.locator('#project-title').fill('小红书小程序（修改）');
  await page.locator('#project-title').press('Tab');
  await expect(group.locator('[data-sidebar-project="p2"]')).toHaveText('小红书小程序（修改）');
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await expect(page).toHaveURL(/#projects\/category\//);
  await expect(page.locator('.mr-route-line')).toHaveCount(2);
  await page.reload();
  await expect(group.locator('[data-sidebar-project="p2"]')).toHaveText('小红书小程序（修改）');
});

test('category names toggle their projects and remember the collapsed state', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Desktop sidebar navigation');
  const original = await prepare(page, true);
  const category = page.locator('[data-category-fold="工作"]'), project = page.locator('[data-sidebar-project="p2"]');
  const createCategory = page.locator('.nav-group-heading').getByRole('button', { name: '新建项目分类', exact: true });
  await expect(createCategory).toBeVisible();
  await expect(page.locator('.nav-project-actions')).toHaveCount(0);
  const createProject = page.locator('[data-action="new-category-page"][data-section="projects"][data-name="工作"]');
  expect(await createProject.evaluate(button => getComputedStyle(button).opacity)).toBe('1');
  await createProject.click();
  await expect(page.getByRole('dialog', { name: '新建项目', exact: true }).getByLabel('分类（可选）', { exact: true })).toHaveValue('工作');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(category).toHaveAttribute('aria-expanded', 'true');
  await expect(category).toHaveAttribute('aria-expanded', 'true');
  await category.click(); await expect(category).toHaveAttribute('aria-expanded', 'false');
  await expect(project).toBeHidden();
  await page.reload(); await expect(category).toHaveAttribute('aria-expanded', 'false');
  await expect(project).toBeHidden();
  await category.press('Enter'); await expect(category).toHaveAttribute('aria-expanded', 'true');
  await expect(project).toBeVisible();
  await page.locator('.sidebar .nav-item[href="#projects"]').click();
  await page.locator('.sidebar .nav-item[href="#projects"]').click();
  await expect(page.locator('#nav-children-projects')).toBeHidden();
  await createCategory.click();
  await expect(page.getByRole('dialog', { name: '新建二级分类', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('#nav-children-projects')).toBeHidden();
  await page.locator('.sidebar .nav-item[href="#projects"]').click();
  await expect(project).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).toEqual(original);
});

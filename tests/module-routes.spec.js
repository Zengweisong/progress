import { test, expect } from '@playwright/test';
import { seedData } from '../public/data.js';

const key = 'shixu.workspace.v1';
test.beforeEach(async ({ page }) => {
  const data = seedData(); data.projects = [data.projects[0]]; data.notes = [];
  const project = data.projects[0];
  project.modules = [{ id: 'ui', name: '界面' }, { id: 'server', name: '服务端' }, { id: 'empty', name: '测试' }];
  project.tasks[0].moduleId = 'ui'; project.tasks[2].moduleId = 'ui';
  project.tasks[1].moduleId = 'server'; project.tasks[3].moduleId = 'server';
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/');
});

test('modules have separate routes, local numbering, empty state and independent reordering', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const ui = page.getByRole('region', { name: '界面模块线路', exact: true });
  const server = page.getByRole('region', { name: '服务端模块线路', exact: true });
  await expect(page.locator('[data-select-project]')).toHaveCount(1);
  await expect(page.locator('.mr-module-route')).toHaveCount(4);
  await expect(ui.locator('[data-route-task]')).toHaveCount(2);
  await expect(server.locator('[data-route-task]')).toHaveCount(2);
  await expect(page.getByRole('region', { name: '测试模块线路', exact: true })).toContainText('此模块暂无事项');
  expect((await server.boundingBox()).y).toBeGreaterThan((await ui.boundingBox()).y + (await ui.boundingBox()).height);
  const first = ui.locator('input[data-task="p1-t0"]');
  await first.focus(); await page.keyboard.press('Alt+ArrowRight');
  expect(await ui.locator('[data-route-task]').evaluateAll(nodes => nodes.map(node => node.dataset.routeTask))).toEqual(['p1-t2', 'p1-t0']);
  const before = await page.evaluate(key => localStorage.getItem(key), key);
  await page.keyboard.press('Alt+ArrowRight');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(before);
  expect(await server.locator('[data-route-task]').evaluateAll(nodes => nodes.map(node => node.dataset.routeTask))).toEqual(['p1-t1', 'p1-t3']);
  await page.reload();
  expect(await ui.locator('[data-route-task]').evaluateAll(nodes => nodes.map(node => node.dataset.routeTask))).toEqual(['p1-t2', 'p1-t0']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `.tools/module-routes-${test.info().project.name}.png`, fullPage: true });
});

test('detail pickers support keyboard selection and Escape closes the picker before the dialog', async ({ page }) => {
  await page.locator('.mr-dock-title').click();
  await expect(page.getByRole('combobox', { name: '项目状态', exact: true })).toHaveCount(0);
  await expect(page.locator('#project-priority,#project-due,#project-tag')).toHaveCount(0);
  const status = page.getByRole('combobox', { name: /的任务状态$/ }).first();
  await expect(status).toHaveClass(/project-select/);
  await status.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.project-detail')).toBeVisible();
  await status.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(status).toHaveValue('active');
  await status.selectOption('done');
  await expect(status).toHaveValue('done');
  await expect(status.locator('selectedcontent .select-indicator')).toHaveCount(1);
  await page.screenshot({ path: `.tools/detail-selects-${test.info().project.name}.png`, fullPage: true });
  await status.click();
  await page.screenshot({ path: `.tools/open-select-${test.info().project.name}.png` });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.project-detail')).toHaveCount(0);
  await page.reload(); await page.locator('.mr-dock-title').click();
  await expect(status).toHaveValue('done');
});

test('each module keeps its own horizontal scroll position when the workspace renders again', async ({ page }) => {
  await page.evaluate(key => {
    const data = JSON.parse(localStorage.getItem(key));
    for (const moduleId of ['ui', 'server']) for (let i = 0; i < 10; i++) {
      data.projects[0].tasks.push({ id: `${moduleId}-${i}`, title: `后续任务 ${i + 1}`, moduleId, done: false, status: 'todo' });
    }
    localStorage.setItem(key, JSON.stringify(data));
  }, key);
  await page.reload();
  const scrolls = page.locator('[data-route-module="ui"] .mr-stations-scroll, [data-route-module="server"] .mr-stations-scroll');
  await scrolls.evaluateAll(nodes => nodes.forEach((node, index) => { node.scrollLeft = 81 + 68 * index; }));
  const positions = await scrolls.evaluateAll(nodes => nodes.map(node => node.scrollLeft));
  expect(positions).toEqual([81, 149]);
  await page.locator('#sort-select').selectOption('title');
  expect(await scrolls.evaluateAll(nodes => nodes.map(node => node.scrollLeft))).toEqual(positions);
});

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { validateData, seedData } from '../public/data.js';

// These cases exercise the existing board/table workflows explicitly.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('shixu.workspace.layout.v1')) localStorage.setItem('shixu.workspace.layout.v1', 'board');
  });
});

test('project creation, task progress and saved view survive reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('.workspace-projects .toolbar').getByRole('button', { name: '新建项目' }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('跨端验证项目');
  await page.getByRole('textbox', { name: '项目说明', exact: true }).fill('验证数据保留和视图一致性。');
  await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('active');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '项目详情：跨端验证项目' })).toBeVisible();
  await page.getByRole('textbox', { name: '在默认模块中添加任务' }).fill('完成第一个任务');
  await page.getByRole('button', { name: '添加到默认模块', exact: true }).click();
  await page.getByLabel('完成第一个任务', { exact: true }).check();
  await expect(page.locator('.drawer .progress-meta')).toContainText('100%');
  await page.reload();
  await expect(page.getByLabel('完成第一个任务', { exact: true })).toBeChecked();
  await page.getByRole('combobox', { name: '项目状态', exact: true }).selectOption('done');
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await page.getByRole('button', { name: '表格', exact: true }).click();
  const row = page.getByRole('row', { name: '打开项目：跨端验证项目', exact: true });
  await expect(row).toContainText('已完成');
  await expect(row).toContainText('100%');
  await page.reload();
  await expect(page.getByRole('button', { name: '表格', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('project pickers keep the draft when Escape closes the menu', async ({ page }) => {
  await page.goto('/');
  test.skip(!await page.evaluate(() => CSS.supports('appearance', 'base-select')), 'Customizable native pickers are unavailable');
  await page.locator('.workspace-projects .toolbar').getByRole('button', { name: '新建项目' }).click();
  const dialog = page.getByRole('dialog', { name: '新建项目', exact: true });
  const title = dialog.getByRole('textbox', { name: '项目名称', exact: true });
  await title.fill('保留这份草稿');
  const status = dialog.getByRole('combobox', { name: '状态', exact: true });
  await status.click();
  await page.getByRole('option', { name: '进行中', exact: true }).click();
  await expect(status).toHaveValue('active');
  const priority = dialog.getByRole('combobox', { name: '优先级', exact: true });
  await priority.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(title).toHaveValue('保留这份草稿');
  await expect(priority).toHaveValue('medium');
  expect(await priority.evaluate(el => el.matches(':open'))).toBe(false);
  await priority.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(priority).toHaveValue('low');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('note editing, safe Markdown rendering and bidirectional project links', async ({ page }) => {
  await page.goto('/#knowledge');
  await page.locator('.page-heading').getByRole('button', { name: '新建页面', exact: true }).click();
  await page.getByRole('textbox', { name: '笔记标题', exact: true }).fill('我的知识验证笔记');
  await page.getByRole('textbox', { name: '笔记正文' }).fill('# 实践笔记\n\n- 有价值的经验\n\n<img src=x onerror=alert(1)>');
  await expect(page.locator('.live-note-editor')).toContainText('有价值的经验');
  await expect(page.locator('.live-note-editor img:not(.cm-widgetBuffer)')).toHaveCount(0);
  await page.getByRole('button', { name: '关联', exact: true }).click();
  await page.getByLabel('个人知识库 2.0', { exact: true }).check();
  await page.getByRole('button', { name: '保存关联', exact: true }).click();
  await page.getByRole('button', { name: '个人知识库 2.0', exact: true }).click();
  await expect(page.locator('.linked-note', { hasText: '我的知识验证笔记' })).toBeVisible();
  await page.locator('.linked-note', { hasText: '我的知识验证笔记' }).click();
  await page.reload();
  await expect(page.locator('.live-note-editor')).toContainText('有价值的经验');
  await expect(page.locator('.project-link-chip')).toContainText('个人知识库 2.0');
});

test('filters, custom properties and card grouping update the same records', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: '筛选项目', exact: true }).click();
  await page.getByRole('combobox', { name: '项目状态', exact: true }).selectOption('active');
  await page.getByRole('combobox', { name: '优先级', exact: true }).selectOption('high');
  await page.getByRole('button', { name: '应用筛选', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(1);
  await expect(page.locator('.project-card')).toContainText('个人知识库 2.0');
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  if (testInfo.project.name === 'desktop') {
    await page.locator('[data-project="p3"].project-card').dragTo(page.locator('[data-drop="active"] .column-header'));
    await expect(page.locator('[data-drop="active"] [data-project="p3"]')).toBeVisible();
  }
  await page.getByRole('button', { name: '表格', exact: true }).click();
  await page.getByRole('button', { name: '添加属性', exact: true }).click();
  await page.getByRole('textbox', { name: '属性名称', exact: true }).fill('预算');
  await page.getByRole('combobox', { name: '字段类型', exact: true }).selectOption('number');
  await page.getByRole('button', { name: '添加属性', exact: true }).last().click();
  await page.getByRole('row', { name: '打开项目：个人知识库 2.0', exact: true }).click();
  await page.getByRole('spinbutton', { name: '预算', exact: true }).fill('88.5');
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await expect(page.getByRole('row', { name: '打开项目：个人知识库 2.0', exact: true })).toContainText('88.5');
  await page.getByRole('button', { name: '看板', exact: true }).click();
  await page.getByRole('button', { name: '视图设置', exact: true }).click();
  await page.getByRole('combobox', { name: '看板分组', exact: true }).selectOption('priority');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.locator('.column')).toHaveCount(3);
});

test('capture, organize and search work with keyboard and touch', async ({ page }) => {
  await page.goto('/#inbox');
  await page.locator('.page-heading').getByRole('button', { name: '快速记录', exact: true }).click();
  await page.getByRole('textbox', { name: '标题', exact: true }).fill('地铁上的新想法');
  await page.getByRole('textbox', { name: '内容', exact: true }).fill('为每次项目复盘留下一个可执行的改变。');
  await page.getByRole('button', { name: '保存到收集箱', exact: true }).click();
  await page.getByRole('button', { name: '移入知识库', exact: true }).click();
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索项目、任务和笔记' }).fill('可执行的改变');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await page.locator('.search-result').click();
  await expect(page.getByRole('region', { name: '笔记编辑器：地铁上的新想法' })).toBeVisible();
  await expect(page.getByRole('button', { name: '移入知识库', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '搜索', exact: true }).focus();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: '搜索全部', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('export/import preserve relations without replacing existing content', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: '查看本机保存与备份状态' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出完整数据/ }).click();
  const download = await downloadPromise;
  const path = testInfo.outputPath('backup.json');
  await download.saveAs(path);
  const original = validateData(JSON.parse(await readFile(path, 'utf8')));
  expect(original.projects).toHaveLength(8);
  await page.locator('#import-file').setInputFiles(path);
  await expect(page.getByRole('dialog', { name: '导入为独立副本', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导入副本', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(16);
  await page.getByRole('button', { name: '打开项目：个人知识库 2.0（导入）', exact: true }).click();
  await expect(page.locator('.linked-note', { hasText: '让知识真正流动起来（导入）' })).toBeVisible();
  await expect(page.locator('.linked-note', { hasText: '离线优先的数据设计（导入）' })).toBeVisible();
});

test('layout, navigation and prototype sync state have no runtime errors', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的项目', exact: true })).toHaveCount(1);
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-projects.png`, fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '打开项目：个人知识库 2.0', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '项目详情：个人知识库 2.0', exact: true })).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-detail.png`, animations: 'disabled' });
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await page.goto('/#knowledge');
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-knowledge.png`, fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '账号与多端同步', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '账号与多端同步', exact: true })).toContainText('本机内容不会在登录时自动上传');
  await expect(page.locator('#sync-dialog input[type=password]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('backup validation rejects dangling relations and unsupported format', () => {
  expect(() => validateData(seedData())).not.toThrow();
  const invalid = seedData(); invalid.notes[0].projectIds = ['missing'];
  expect(() => validateData(invalid)).toThrow();
  expect(() => validateData({ version: 2, projects: [], notes: [], fields: [] })).toThrow();
});

test('title autosaves before blur and searching the current item closes the search', async ({ page }) => {
  await page.goto('/#projects/project/p1');
  await page.getByRole('textbox', { name: '项目标题', exact: true }).fill('不用失焦也能保存');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: '打开项目：不用失焦也能保存', exact: true }).click();
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: '搜索项目、任务和笔记' }).fill('不用失焦也能保存');
  await page.locator('.search-result').click();
  await expect(page.getByRole('dialog', { name: '搜索全部', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '项目详情：不用失焦也能保存', exact: true })).toBeVisible();
});

test('a stale window cannot overwrite another window’s newer content', async ({ page, context }) => {
  await page.goto('/#projects/project/p1');
  const other = await context.newPage();
  await other.goto('/#projects/project/p1');
  await page.getByRole('textbox', { name: '项目标题', exact: true }).fill('来自第一个窗口的新名称');
  await expect(other.locator('.storage-warning')).toContainText('另一个窗口已更新数据');
  await other.getByRole('textbox', { name: '项目标题', exact: true }).fill('旧窗口试图覆盖');
  await other.reload();
  await expect(other.getByRole('textbox', { name: '项目标题', exact: true })).toHaveValue('来自第一个窗口的新名称');
  await other.close();
});

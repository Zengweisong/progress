import { test, expect } from '@playwright/test';
import { seedData, validateData } from '../public/data.js';

const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const line = page => page.locator('.project-detail');
test.beforeEach(async ({ page }) => {
  const data = seedData(); data.projects = [data.projects[2]]; data.notes = [];
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/'); await page.locator('.mr-dock-title').click();
});

async function createModule(page, name) {
  await line(page).getByRole('button', { name: '新建模块', exact: true }).click();
  await page.getByRole('textbox', { name: '模块名称' }).fill(name);
  await page.getByRole('button', { name: '创建模块', exact: true }).click();
}

test('custom modules, parallel statuses, task moves and deletions persist without losing old tasks', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await createModule(page, '界面'); await createModule(page, '服务端');
  const ui = line(page).getByRole('region', { name: '界面模块', exact: true });
  // Sections with aria-label are landmark regions.
  await ui.getByRole('textbox', { name: '在界面中添加任务' }).fill('设计编辑器');
  await ui.getByRole('button', { name: '添加到界面' }).click();
  const server = line(page).getByRole('region', { name: '服务端模块', exact: true });
  await server.getByRole('textbox', { name: '在服务端中添加任务' }).fill('实现接口');
  await server.getByRole('button', { name: '添加到服务端' }).click();
  await line(page).getByRole('combobox', { name: '设计编辑器的任务状态', exact: true }).selectOption('active');
  await line(page).getByRole('combobox', { name: '实现接口的任务状态', exact: true }).selectOption('active');
  await expect(line(page).locator('.module-task.is-active')).toHaveCount(2);
  await expect(line(page).locator('.progress-meta strong')).toHaveText('0%');
  await line(page).getByRole('checkbox', { name: '设计编辑器', exact: true }).check();
  await expect(ui.locator('.module-heading')).toContainText('1/1');
  await expect(line(page).locator('.progress-meta strong')).toHaveText('20%');
  await server.getByRole('button', { name: '编辑任务：实现接口', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '编辑任务', exact: true });
  const saved = await read(page), uiId = saved.projects[0].modules.find(module => module.name === '界面').id;
  await edit.getByRole('combobox', { name: '所属模块', exact: true }).selectOption(uiId);
  await edit.getByRole('textbox', { name: '任务名称', exact: true }).fill('实现编辑器接口');
  await edit.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(ui.locator('.module-heading')).toContainText('1/2');
  await expect(server.locator('.module-heading')).toContainText('0/0');
  await ui.getByRole('button', { name: '编辑模块：界面', exact: true }).click();
  await page.getByRole('textbox', { name: '模块名称' }).fill('客户端');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.reload();
  const client = line(page).getByRole('region', { name: '客户端模块', exact: true });
  await expect(client.locator('.module-heading')).toContainText('1/2');
  await expect(client.getByRole('combobox', { name: '实现编辑器接口的任务状态', exact: true })).toHaveValue('active');
  await client.getByRole('button', { name: '编辑模块：客户端', exact: true }).click();
  await page.getByRole('button', { name: '删除模块，任务移至默认模块', exact: true }).click();
  await expect(line(page).getByRole('region', { name: '默认模块模块' }).locator('.module-heading')).toContainText('1/5');
  await line(page).getByRole('button', { name: '编辑任务：设计编辑器', exact: true }).click();
  await page.getByRole('button', { name: '删除任务', exact: true }).click();
  await expect(line(page).locator('.progress-meta strong')).toHaveText('0%');
  const result = await read(page); validateData(result);
  expect(result.projects[0].tasks).toHaveLength(4);
  for (const task of seedData().projects[2].tasks) expect(result.projects[0].tasks).toContainEqual(task);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('task order survives reload and failed writes keep inline drafts without adding tasks', async ({ page }) => {
  await line(page).getByRole('button', { name: '编辑任务：完成第一轮原型', exact: true }).click();
  await page.getByRole('combobox', { name: '排列位置', exact: true }).selectOption('0');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.reload();
  await expect(line(page).locator('.module-task-title').first()).toHaveText('完成第一轮原型');
  const before = await read(page);
  const input = line(page).getByRole('textbox', { name: '在默认模块中添加任务' });
  await input.fill('保存失败时的草稿');
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('No room', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, key);
  await line(page).getByRole('button', { name: '添加到默认模块', exact: true }).click();
  await expect(input).toHaveValue('保存失败时的草稿');
  await expect(line(page).locator('.module-task')).toHaveCount(3);
  expect(await read(page)).toEqual(before);
});

test('detail and quick capture share modules and keep task input drafts', async ({ page }) => {
  await createModule(page, '测试');
  const input = line(page).getByRole('textbox', { name: '在测试中添加任务' });
  await input.fill('还没提交的任务');
  await line(page).getByRole('combobox', { name: '整理学习路线的任务状态', exact: true }).selectOption('active');
  await expect(input).toHaveValue('还没提交的任务');
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await page.locator('[data-route-kind="task"]').click();
  const moduleId = (await read(page)).projects[0].modules[0].id;
  await page.getByRole('combobox', { name: '记录到模块', exact: true }).selectOption(moduleId);
  await page.locator('#route-capture-body').fill('单元测试\n集成测试');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await page.locator('.mr-dock-title').click();
  const detail = page.getByRole('dialog', { name: '项目详情：产品设计进阶' });
  await detail.getByRole('combobox', { name: '单元测试的任务状态', exact: true }).selectOption('done');
  await expect(detail.getByRole('region', { name: '测试模块' }).locator('.module-heading')).toContainText('1/2');
  await detail.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await expect(page.locator('.mr-route-line').getByRole('checkbox', { checked: true })).toHaveCount(1);
  await expect(page.locator('.mr-line-select small')).toHaveCount(0);
  await page.locator('.mr-dock-title').click();
  await expect(input).toHaveValue('还没提交的任务');
  await page.reload();
  expect((await read(page)).projects[0].tasks.filter(task => task.moduleId === moduleId)).toHaveLength(2);
});

import { test, expect } from '@playwright/test';
import { seedData } from '../public/data.js';

const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const cancelSave = (locator, modifiers = {}) => locator.evaluate((node, modifiers) => {
  const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true, ...modifiers });
  return !node.dispatchEvent(event) && event.defaultPrevented;
}, modifiers);

test.beforeEach(async ({ page }) => {
  const data = seedData();
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/#projects'); await expect(page.locator('.workspace-route')).toBeVisible();
});

test('Ctrl+S and Command+S cancel browser saving and persist without creating records', async ({ page }) => {
  const before = await read(page);
  expect(await cancelSave(page.locator('body'))).toBe(true);
  await expect(page.locator('#toast')).toHaveText('已保存到本机。');
  expect(await read(page)).toEqual(before);
  expect(await cancelSave(page.locator('body'), { ctrlKey: false, metaKey: true, key: 'S' })).toBe(true);
  await expect(page.locator('#toast')).toHaveText('已保存到本机。');
  expect(await cancelSave(page.locator('body'), { repeat: true })).toBe(true);
  expect(await read(page)).toEqual(before);
});

test('Ctrl+S saves Markdown notes without moving focus or consuming editor history', async ({ page }) => {
  await page.goto('/#knowledge/note/n1');
  const editor = page.getByRole('textbox', { name: '笔记正文', exact: true });
  await editor.fill('需要保存的内容'); await editor.press('Control+a'); await editor.press('Control+b');
  await expect.poll(async () => (await read(page)).notes.find(n => n.id === 'n1').body).toBe('**需要保存的内容**');
  await editor.press('Control+s');
  await expect(page.locator('#toast')).toHaveText('已保存到本机。'); await expect(editor).toBeFocused();
  await editor.press('Control+z');
  await expect.poll(async () => (await read(page)).notes.find(n => n.id === 'n1').body).toBe('需要保存的内容');
  await page.reload(); await expect(editor).toHaveText('需要保存的内容');
});

for (const kind of ['project', 'task']) test(`Ctrl+S works inside the ${kind} Markdown description`, async ({ page }) => {
  await page.goto('/#projects/project/p1');
  const editor = kind === 'project' ? page.getByRole('textbox', { name: '项目说明', exact: true }) : page.locator('[data-task-description="p1-t0"] .cm-content');
  const saved = async () => { const project = (await read(page)).projects[0]; return kind === 'project' ? project.description : project.tasks[0].description; };
  await editor.fill('**说明内容**'); await editor.press('Control+s');
  await expect(page.locator('#toast')).toHaveText('已保存到本机。'); await expect(editor).toBeFocused();
  await expect.poll(saved).toBe('**说明内容**');
  await page.reload(); await expect.poll(saved).toBe('**说明内容**');
});

test('Ctrl+S submits quick capture once and leaves an empty capture alone', async ({ page }) => {
  const before = (await read(page)).notes.length, input = page.locator('#route-capture-body');
  await input.fill('用快捷键保存快速记录'); await input.press('Control+s');
  await expect.poll(async () => (await read(page)).notes.length).toBe(before + 1);
  expect((await read(page)).notes[0].body).toBe('用快捷键保存快速记录');
  await expect(input).toHaveValue(''); await input.press('Control+s');
  await expect(page.locator('#toast')).toHaveText('已保存到本机。');
  expect((await read(page)).notes.length).toBe(before + 1);
});

test('Ctrl+S adds a pending task and saves task edits from the dialog', async ({ page }) => {
  await page.goto('/#projects/project/p1');
  const before = (await read(page)).projects[0].tasks.length;
  const input = page.locator('.project-detail [data-task-add] input').first();
  await input.fill('快捷键新增待办'); await input.press('Control+s');
  await expect.poll(async () => (await read(page)).projects[0].tasks.length).toBe(before + 1);
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: '编辑任务：快捷键新增待办', exact: true }).click();
  await page.getByRole('textbox', { name: '任务名称', exact: true }).fill('快捷键修改待办');
  const description = page.getByRole('textbox', { name: '详细说明', exact: true });
  await description.fill('## 完成要求\n\n- 保存表单'); await description.press('Control+s');
  await expect(page.locator('#task-edit-form')).toHaveCount(0);
  expect((await read(page)).projects[0].tasks.at(-1)).toMatchObject({ title: '快捷键修改待办', description: '## 完成要求\n\n- 保存表单' });
});

test('Ctrl+S validates a new project before submitting and ignores held-key repeats', async ({ page }) => {
  const before = (await read(page)).projects.length;
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  const title = page.getByRole('textbox', { name: '项目名称', exact: true });
  await title.press('Control+s');
  await expect(page.getByRole('dialog', { name: '新建项目', exact: true })).toBeVisible();
  expect((await read(page)).projects.length).toBe(before);
  await title.fill('快捷键创建项目'); expect(await cancelSave(title, { repeat: true })).toBe(true);
  expect((await read(page)).projects.length).toBe(before);
  await title.press('Control+s');
  await expect(page.getByRole('dialog', { name: '项目详情：快捷键创建项目', exact: true })).toBeVisible();
  expect((await read(page)).projects.length).toBe(before + 1);
});

test('failed Ctrl+S form writes keep the draft and durable task unchanged', async ({ page }) => {
  await page.goto('/#projects/project/p1'); const before = await read(page);
  await page.locator('.project-detail .module-task-title[data-id="p1-t0"]').click();
  const title = page.getByRole('textbox', { name: '任务名称', exact: true }); await title.fill('保存失败的草稿');
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await title.press('Control+s'); await expect(page.locator('#toast')).toContainText('保存失败');
  await expect(title).toHaveValue('保存失败的草稿'); expect(await read(page)).toEqual(before);
  expect(await cancelSave(title)).toBe(true); await expect(page.locator('#toast')).toContainText('保存受阻');
  expect(await read(page)).toEqual(before);
});

test('save is intercepted inside the account dialog without submitting credentials', async ({ page }) => {
  const requests = []; page.on('request', request => { if (request.method() === 'POST' && /\/api\/(login|register)/.test(request.url())) requests.push(request.url()); });
  await page.getByRole('button', { name: '账号与多端同步', exact: true }).click();
  const dialog = page.locator('#sync-dialog'); await expect(dialog).toBeVisible();
  expect(await cancelSave(dialog)).toBe(true); await expect(page.locator('#toast')).toHaveText('已保存到本机。');
  await expect(dialog).toBeVisible(); expect(requests).toEqual([]);
});

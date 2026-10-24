import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { seedData } from '../public/data.js';

const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const task = async page => (await read(page)).projects[0].tasks.find(t => t.id === 'p1-t0');
const edit = page => page.locator('.project-detail .module-task-title[data-id="p1-t0"]').click();
const details = page => page.locator('[data-task-description="p1-t0"] .cm-content');
const editorSource = locator => locator.evaluate(async node => {
  const { EditorView } = await import('/vendor/editor/codemirror.js');
  return EditorView.findFromDOM(node).state.doc.toString();
});
const expectDetails = (page, text) => expect.poll(() => editorSource(details(page))).toBe(text);

test.beforeEach(async ({ page }) => {
  const data = seedData(); data.projects = [data.projects[0]]; data.notes = [];
  data.fields = [{ id: 'budget', name: '预算', type: 'number' }]; data.projects[0].custom.budget = 88.5;
  data.projects[0].modules = [{ id: 'ui', name: '界面' }];
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/#projects/project/p1'); await expect(page.locator('.project-detail')).toBeVisible();
});

test('project detail focuses on tasks and preserves hidden metadata', async ({ page }) => {
  const before = await read(page);
  await expect(page.locator('.project-detail .properties')).toHaveCount(0);
  for (const name of ['项目状态', '优先级', '项目分类']) await expect(page.getByRole('combobox', { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '截止日期', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-custom-field]')).toHaveCount(0);
  await expect(page.locator('.project-detail .progress-meta,.project-detail .progress-track')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '项目标题', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '项目说明', exact: true })).toBeVisible();
  await details(page).click(); await expectDetails(page, '');
  await expect(page.locator('#task-edit-form')).toHaveCount(0);
  await expect(page.locator('[data-task-description]')).toHaveCount(before.projects[0].tasks.length);
  expect(await read(page)).toEqual(before);
});

test('multiline task details render safely, reload and appear in the full backup', async ({ page }, info) => {
  const description = '明确这条待办要完成什么。\n1. 列出具体步骤\n2. 检查边界与验收标准\n<img src=x onerror=alert(1)>';
  await details(page).fill(description);
  await expect.poll(async () => (await task(page)).description).toBe(description);
  await expectDetails(page, description);
  await expect(page.locator('.module-task-description img:not(.cm-widgetBuffer)')).toHaveCount(0);
  await page.reload(); await expectDetails(page, description);
  await page.screenshot({ path: `.tools/task-description-inline-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await page.getByRole('button', { name: '查看本机保存与备份状态', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出完整数据', exact: false }).click();
  const backup = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(backup.projects[0].tasks[0].description).toBe(description);
  expect(backup.projects[0].custom.budget).toBe(88.5);
});

test('task details survive moving modules and deleting, and edits can be undone', async ({ page }) => {
  await details(page).fill('原来的详细说明');
  const handle = page.locator('.project-detail [data-task-drag-handle="p1-t0"]');
  await handle.press('Alt+ArrowRight');
  expect((await task(page)).moduleId).toBe('ui'); await expectDetails(page, '原来的详细说明');
  await details(page).fill('修改后的说明');
  await handle.press('Control+z'); await expectDetails(page, '原来的详细说明');
  await edit(page); await page.getByRole('button', { name: '删除任务', exact: true }).click();
  await expect(details(page)).toHaveCount(0);
  await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Control+z');
  await expectDetails(page, '原来的详细说明');
});

test('inline description text is searchable and clearing keeps the empty editor available', async ({ page }) => {
  await details(page).fill('独特验收标准');
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: '搜索项目、任务和笔记', exact: true }).fill('独特验收标准');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await expect(page.locator('.search-result')).toContainText('独特验收标准');
  await page.keyboard.press('Escape');
  await details(page).fill('');
  await expect(details(page)).toBeVisible(); expect((await task(page)).description).toBeUndefined();
});

test('failed detail saves keep the draft available and leave durable task data unchanged', async ({ page }) => {
  const before = await task(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await details(page).fill('保存失败时仍可复制这段说明');
  await expectDetails(page, '保存失败时仍可复制这段说明');
  expect(await task(page)).toEqual(before);
  await page.locator('[data-action="toggle-pin"]').click();
  await expectDetails(page, '保存失败时仍可复制这段说明');
  await details(page).fill(''); await page.locator('[data-action="toggle-pin"]').click();
  await expectDetails(page, '');
});

test('backup rescues unsaved project and task description drafts without changing durable data', async ({ page }) => {
  const project = page.getByRole('textbox', { name: '项目说明', exact: true });
  const second = page.locator('[data-task-description="p1-t1"] .cm-content');
  await second.fill('保存前的说明');
  const before = await read(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await project.fill('## 保存失败后的项目说明');
  await details(page).fill('保存失败后的任务说明');
  await second.fill('');
  await expect(page.locator('#toast')).toContainText('保存受阻');
  expect(await read(page)).toEqual(before);
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await page.getByRole('button', { name: '查看本机保存与备份状态', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整数据', exact: false }).click();
  const backup = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(backup.projects[0].description).toBe('## 保存失败后的项目说明');
  expect(backup.projects[0].tasks[0].description).toBe('保存失败后的任务说明');
  expect(backup.projects[0].tasks[1].description).toBeUndefined();
  expect(backup.projects[0].tasks.map(task => task.id)).toEqual(before.projects[0].tasks.map(task => task.id));
  expect(backup.notes).toEqual(before.notes);
  expect(await read(page)).toEqual(before);
});

test('continuous inline typing is one workspace undo step', async ({ page }) => {
  const checkbox = page.locator('.project-detail input[data-task="p1-t0"]'), checked = await checkbox.isChecked();
  await checkbox.setChecked(!checked);
  await details(page).pressSequentially('一段连续输入的详细说明');
  const handle = page.locator('.project-detail [data-task-drag-handle="p1-t0"]');
  await handle.press('Control+z'); await expectDetails(page, '');
  await expect(checkbox).toBeChecked({ checked: !checked });
  await handle.press('Control+z'); await expect(checkbox).toBeChecked({ checked });
});

test('native text undo saves the reverted value and leaves other workspace history intact', async ({ page }) => {
  const checkbox = page.locator('.project-detail input[data-task="p1-t0"]'), checked = await checkbox.isChecked();
  await checkbox.setChecked(!checked);
  await details(page).focus(); await page.keyboard.insertText('inline'); await details(page).press('Control+z');
  await expectDetails(page, '');
  expect((await task(page)).description).toBeUndefined();
  await expect(checkbox).toBeChecked({ checked: !checked });
  await page.locator('.project-detail [data-task-drag-handle="p1-t0"]').press('Control+z');
  await expect(checkbox).toBeChecked({ checked });
});

test('long inline details grow to show the full text and preserve the caret through rerenders', async ({ page }) => {
  const description = Array.from({ length: 12 }, (_, i) => `第 ${i + 1} 步：逐项检查和记录。`).join('\n');
  await details(page).fill(description);
  const dimensions = await details(page).evaluate(input => ({ height: input.clientHeight, scroll: input.scrollHeight }));
  expect(dimensions.height).toBeGreaterThan(150); expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.height + 2);
  await details(page).evaluate(async node => { const { EditorView } = await import('/vendor/editor/codemirror.js'); EditorView.findFromDOM(node).dispatch({ selection: { anchor: 8 } }); document.querySelector('[data-action="toggle-pin"]').click(); });
  await expect(details(page)).toBeFocused(); await expectDetails(page, description);
  expect(await details(page).evaluate(async node => { const { EditorView } = await import('/vendor/editor/codemirror.js'); return EditorView.findFromDOM(node).state.selection.main.anchor; })).toBe(8);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => details(page).evaluate(input => input.scrollHeight <= input.clientHeight + 2)).toBe(true);
  await expectDetails(page, description);
});

test('project descriptions render Markdown inline, save source and toggle Markdown checkboxes', async ({ page }, info) => {
  const editor = page.getByRole('textbox', { name: '项目说明', exact: true });
  const host = page.locator('#project-description-editor');
  const markdown = '## 完成标准\n\n**重点**与*补充*，使用 `检查脚本`。\n\n- 列出具体步骤\n- [ ] 完成验收\n\n> 保留可复用的经验。\n\n```js\nconst value = 1;\n```\n\n| 项目 | 结果 |\n| --- | --- |\n| 验收 | 通过 |';
  await editor.fill(markdown);
  await expect.poll(async () => (await read(page)).projects[0].description).toBe(markdown);
  await page.getByRole('textbox', { name: '项目标题', exact: true }).focus();
  await expect(host.locator('.cm-md-h2')).toContainText('完成标准');
  await expect(host.locator('.cm-md-strong')).toContainText('重点');
  await expect(host.locator('.cm-md-em')).toContainText('补充');
  await expect(host.locator('.cm-md-inline-code')).toContainText('检查脚本');
  await expect(host.locator('.cm-md-quote')).toContainText('保留可复用的经验');
  await expect(host.locator('table')).toHaveCount(1);
  await host.locator('.cm-md-task').check();
  await expect.poll(async () => (await read(page)).projects[0].description).toContain('- [x] 完成验收');
  await page.reload();
  await expect.poll(() => editorSource(editor)).toContain('## 完成标准');
  await expect(host.locator('table')).toHaveCount(1);
  await page.screenshot({ path: `.tools/project-description-markdown-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('task Markdown shortcuts, undo, redo and link editing stay inside the description', async ({ page }) => {
  const editor = details(page), host = page.locator('[data-task-description="p1-t0"]');
  await editor.fill('重点事项'); await editor.press('Control+a'); await editor.press('Control+b');
  await expectDetails(page, '**重点事项**');
  await editor.press('Control+z'); await expectDetails(page, '重点事项');
  await editor.press('Control+y'); await expectDetails(page, '**重点事项**');
  await page.getByRole('textbox', { name: '项目标题', exact: true }).focus();
  await expect(host.locator('.cm-md-strong')).toContainText('重点事项');
  await editor.fill('参考链接'); await editor.press('Control+a'); await editor.press('Control+k');
  await expectDetails(page, '[参考链接](https://example.com)');
  await expect(page.getByRole('dialog', { name: '搜索全部', exact: true })).toHaveCount(0);
  await expect.poll(async () => (await task(page)).description).toBe('[参考链接](https://example.com)');
});

test('multiple Markdown editors retain independent content and history through rerenders', async ({ page }) => {
  const project = page.getByRole('textbox', { name: '项目说明', exact: true }), first = details(page);
  const second = page.locator('[data-task-description="p1-t1"] .cm-content');
  await project.fill('# 项目说明'); await first.fill('第一条说明');
  await first.press('Control+a'); await first.press('Control+b');
  await second.fill('第二条说明');
  await page.locator('[data-action="toggle-pin"]').click();
  await first.press('Control+z'); await expectDetails(page, '第一条说明');
  expect(await editorSource(project)).toBe('# 项目说明'); expect(await editorSource(second)).toBe('第二条说明');
  await page.reload();
  await expectDetails(page, '第一条说明');
  expect(await editorSource(project)).toBe('# 项目说明'); expect(await editorSource(second)).toBe('第二条说明');
});

test('Markdown remains text-safe and enforces the existing description length limit', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: '项目说明', exact: true });
  const source = '## 安全内容\n\n<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>';
  await editor.fill(source);
  await page.getByRole('textbox', { name: '项目标题', exact: true }).focus();
  await expect(page.locator('#project-description-editor img:not(.cm-widgetBuffer),#project-description-editor script')).toHaveCount(0);
  expect((await read(page)).projects[0].description).toBe(source);
  await editor.fill('字'.repeat(20001));
  await expect(page.locator('#toast')).toContainText('20000');
  expect((await read(page)).projects[0].description).toBe(source);
});

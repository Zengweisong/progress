import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const key = 'shixu.workspace.v1';
const body = `# Markdown 标题

**重点**、*斜体*、~~删除线~~，以及 [参考链接](https://example.com)。

## 任务

- [x] 已完成
- [ ] 下一步

1. 第一项
2. 第二项

| 项目 | 状态 |
| --- | --- |
| 编辑器 | 完成 |

> 一段引用。

\`\`\`js
const example = '<script>codeOnly()</script>';
\`\`\`

<img src=x onerror="window.noteInjected=true">

<script>window.noteInjected=true</script>

[不安全链接](javascript:alert(1))`;

const source = page => page.evaluate(key => {
  const id = decodeURIComponent(location.hash.split('/').at(-1));
  return JSON.parse(localStorage.getItem(key)).notes.find(note => note.id === id)?.body;
}, key);

test('one editable Markdown surface renders GFM safely and persists the original source', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#knowledge/note/n1');
  const editor = page.getByRole('textbox', { name: '笔记正文', exact: true });
  await editor.fill(body); await page.locator('#note-title').focus();
  await expect(page.locator('.cm-md-h1')).toHaveText('Markdown 标题');
  await expect(page.locator('.cm-md-strong')).toContainText('重点');
  await expect(page.locator('.cm-md-em')).toContainText('斜体');
  await expect(page.locator('.cm-md-strike')).toContainText('删除线');
  await expect(page.locator('.cm-note-table table')).toContainText('编辑器');
  await expect(page.locator('.cm-md-task')).toHaveCount(2);
  await expect(page.locator('.live-note-editor img:not(.cm-widgetBuffer), .live-note-editor script')).toHaveCount(0);
  expect(await page.evaluate(() => window.noteInjected)).toBeUndefined();
  expect(await source(page)).toBe(body);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.reload(); await expect(editor).toBeVisible(); expect(await source(page)).toBe(body);
  expect(errors).toEqual([]);
});

test('formatting, keyboard shortcuts and export use Markdown in the single editor', async ({ page }) => {
  await page.goto('/#knowledge/note/n1');
  const editor = page.getByRole('textbox', { name: '笔记正文', exact: true });
  await editor.fill('重要内容'); await editor.press('Control+a');
  await page.getByRole('button', { name: '加粗', exact: true }).click();
  await expect.poll(() => source(page)).toBe('**重要内容**');
  await editor.fill('链接文字'); await editor.press('Control+a'); await editor.press('Control+k');
  await expect.poll(() => source(page)).toBe('[链接文字](https://example.com)');
  await expect(page.getByRole('dialog', { name: '搜索全部' })).toHaveCount(0);
  await editor.fill('快捷键'); await editor.press('Control+a'); await editor.press('Control+b');
  await expect.poll(() => source(page)).toBe('**快捷键**');
  await editor.fill(''); await page.getByRole('button', { name: '插入表格', exact: true }).click();
  const saved = '| 标题 | 内容 |\n| --- | --- |\n| 项目 | 说明 |';
  await expect.poll(() => source(page)).toBe(saved);
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 .md', exact: true }).click();
  const download = await event; expect(await readFile(await download.path(), 'utf8')).toBe(saved);
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click(); await expect(page).toHaveURL(/#knowledge$/);
});

test('live Markdown editor and its bundle work offline', async ({ page, context }) => {
  await page.goto('/#knowledge/note/n1'); await page.locator('#note-body').fill('# 离线记录\n\n- [x] 本机保存');
  await expect.poll(() => source(page)).toBe('# 离线记录\n\n- [x] 本机保存');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(page.locator('.cm-md-h1')).toHaveText('离线记录');
  await expect(page.locator('.cm-md-task')).toBeChecked();
  expect(await source(page)).toBe('# 离线记录\n\n- [x] 本机保存');
});

test('quick ideas support Markdown formatting and safe preview, then save the original source', async ({ page }) => {
  await page.goto('/#projects');
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: '记下一个想法', exact: true });
  await dialog.getByRole('textbox', { name: '标题', exact: true }).fill('Markdown 想法');
  const editor = dialog.getByRole('textbox', { name: '内容', exact: true });
  await editor.fill('重要想法');
  await editor.press('Control+a');
  await dialog.getByRole('button', { name: '加粗', exact: true }).click();
  await expect(editor).toHaveValue('**重要想法**');
  await editor.fill(body);
  await dialog.getByRole('button', { name: '预览', exact: true }).click();
  const preview = dialog.locator('#capture-note-preview');
  await expect(preview.locator('h1')).toHaveText('Markdown 标题');
  await expect(preview.locator('strong')).toHaveText('重点');
  await expect(preview.locator('table')).toContainText('编辑器');
  await expect(preview.locator('input[type=checkbox]')).toHaveCount(2);
  await expect(preview.locator('pre code')).toContainText('<script>codeOnly()</script>');
  await expect(preview.locator('img, script')).toHaveCount(0);
  await expect(preview.getByText('不安全链接', { exact: true })).not.toHaveAttribute('href');
  expect(await page.evaluate(() => window.noteInjected)).toBeUndefined();
  await expect(editor).toBeHidden();
  await dialog.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(editor).toHaveValue(body);
  await expect(dialog.getByRole('textbox', { name: '标题', exact: true })).toHaveValue('Markdown 想法');
  await dialog.getByRole('button', { name: '预览', exact: true }).click();
  const bounds = await dialog.boundingBox(), viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  await dialog.getByRole('button', { name: '保存到收集箱', exact: true }).click();
  await expect.poll(() => source(page)).toBe(body);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).notes[0], key)).toMatchObject({ title: 'Markdown 想法', body, inbox: true });
  await page.reload();
  await expect.poll(() => source(page)).toBe(body);
});

test('new project notes open directly and keep their category and link while formatting Markdown', async ({ page }) => {
  await page.goto('/#projects/project/p1');
  await page.getByRole('button', { name: '为此项目新建笔记', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('#note-title').fill('项目链接笔记');
  await page.locator('#note-category').selectOption('技术实践');
  const editor = page.getByRole('textbox', { name: '笔记正文', exact: true });
  await editor.fill('参考文档');
  await editor.press('Control+a'); await editor.press('Control+k');
  await expect(editor).toHaveText('[参考文档](https://example.com)');
  await expect(page.getByRole('dialog', { name: '搜索全部', exact: true })).toHaveCount(0);
  await expect(page.locator('#note-category')).toHaveValue('技术实践');
  await page.locator('#note-title').focus();
  await expect(page.locator('.cm-md-link')).toHaveText('参考文档');
  await expect.poll(() => source(page)).toBe('[参考文档](https://example.com)');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).notes[0], key)).toMatchObject({ title: '项目链接笔记', category: '技术实践', inbox: false, projectIds: ['p1'] });
});

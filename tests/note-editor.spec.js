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
  await page.goto('/#knowledge/note/n1'); await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('# 离线记录\n\n- [x] 本机保存');
  await expect.poll(() => source(page)).toBe('# 离线记录\n\n- [x] 本机保存');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(page.locator('.cm-md-h1')).toHaveText('离线记录');
  await expect(page.locator('.cm-md-task')).toBeChecked();
  expect(await source(page)).toBe('# 离线记录\n\n- [x] 本机保存');
});

test('quick ideas use the same live Markdown editor and save their original source', async ({ page }) => {
  await page.goto('/#projects'); await page.keyboard.press('n');
  const draft = page.locator('.note-workspace');
  await expect(draft.locator('#note-form, .note-properties')).toHaveCount(0);
  await draft.getByRole('textbox', { name: '笔记标题', exact: true }).fill('Markdown 想法');
  const editor = draft.getByRole('textbox', { name: '笔记正文', exact: true });
  await editor.fill('重要想法'); await editor.press('Control+a');
  await draft.getByRole('button', { name: '加粗', exact: true }).click();
  await expect(editor).toContainText('重要想法');
  await editor.fill(body); await page.locator('#note-title').focus();
  await expect(draft.locator('.cm-md-h1')).toHaveText('Markdown 标题');
  await expect(draft.locator('.cm-note-table table')).toContainText('编辑器');
  expect(await page.evaluate(() => window.noteInjected)).toBeUndefined();
  await expect.poll(() => source(page)).toBe(body);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).notes[0], key)).toMatchObject({ title: 'Markdown 想法', body, inbox: false, favorite: false });
  await page.reload(); await expect.poll(() => source(page)).toBe(body);
});

test('new project notes preserve their automatic category and project link in the shared editor', async ({ page }) => {
  await page.goto('/#projects/project/p1');
  await page.getByRole('button', { name: '为此项目新建笔记', exact: true }).click();
  await page.getByRole('textbox', { name: '笔记标题', exact: true }).fill('项目链接笔记');
  const editor = page.getByRole('textbox', { name: '笔记正文', exact: true });
  await editor.fill('参考文档'); await editor.press('Control+a'); await editor.press('Control+k');
  await expect(page.getByRole('dialog', { name: '搜索全部', exact: true })).toHaveCount(0);
  await expect.poll(() => source(page)).toBe('[参考文档](https://example.com)');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).notes[0], key)).toMatchObject({ title: '项目链接笔记', category: '产品与设计', inbox: false, projectIds: ['p1'] });
});

test('new pages are persisted immediately and retain autosaved edits after closing and reloading', async ({ page }) => {
  await page.goto('/#knowledge');
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).notes.length, key);
  await page.getByRole('button', { name: '新建页面', exact: true }).click();
  await expect(page).toHaveURL(/#knowledge\/note\//);
  await expect(page.getByRole('region', { name: '笔记编辑器：未命名页面', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#note-title')).toBeFocused();
  await expect(page.locator('#note-title')).toHaveValue('');
  const created = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).notes, key);
  expect(created).toHaveLength(before + 1);
  expect(created[0]).toMatchObject({ title: '未命名页面', body: '', inbox: false, favorite: false });
  await expect(page.getByRole('button', { name: '创建笔记', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: '笔记编辑器：未命名页面', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '笔记标题', exact: true }).fill('整页创建的笔记');
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('保留完整内容');
  await expect.poll(() => source(page)).toBe('保留完整内容');
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
  await expect(page).toHaveURL(/#knowledge$/);
  await expect(page.locator('.note-card').filter({ hasText: '整页创建的笔记' })).toHaveCount(1);
  await page.reload();
  await page.locator('.note-card').filter({ hasText: '整页创建的笔记' }).click();
  await expect.poll(() => source(page)).toBe('保留完整内容');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).notes.length, key)).toBe(before + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('a failed new note save keeps the page and content without inserting a note', async ({ page }) => {
  await page.goto('/#knowledge/new-note');
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  await page.getByRole('textbox', { name: '笔记标题', exact: true }).fill('保存失败时保留标题');
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('保存失败时保留正文');
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('No room', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, key);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: '创建笔记', exact: true }).click();
    await expect(page.locator('#note-create-error')).toContainText('笔记尚未保存');
    await expect(page).toHaveURL(/#knowledge\/new-note$/);
    await expect(page.getByRole('textbox', { name: '笔记标题', exact: true })).toHaveValue('保存失败时保留标题');
    await expect(page.getByRole('textbox', { name: '笔记正文', exact: true })).toHaveText('保存失败时保留正文');
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).toEqual(before);
  }
});

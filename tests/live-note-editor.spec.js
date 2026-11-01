import { test, expect } from '@playwright/test';
import { seedData, validateData } from '../public/data.js';
import { readFile } from 'node:fs/promises';
const key = 'shixu.workspace.v1';
const read = page => page.evaluate(async key => {
  const { hydrateWorkspace } = await import('/workspace-storage.js');
  return hydrateWorkspace(JSON.parse(localStorage.getItem(key)));
}, key);
const note = async page => (await read(page)).notes.find(note => note.id === 'n1');
const source = async page => (await note(page)).body;
const editor = page => page.getByRole('textbox', { name: '笔记正文', exact: true });
const sample = '# 写作与思考\n\n**重要的想法**，从一段文字开始。\n\n## 下一步\n\n- [x] 整理思路\n- [ ] 写下第一稿\n\n> 让记录自然发生。\n\n| 主题 | 状态 |\n| --- | --- |\n| 笔记编辑器 | 完成 |';
async function pngFile(page) {
  return Buffer.from(await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 80; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#a7c9b1'; ctx.fillRect(0, 0, 120, 80); return canvas.toDataURL('image/png').split(',')[1]; }), 'base64');
}
test.beforeEach(async ({ page }) => {
  const data = seedData(); data.notes.find(note => note.id === 'n1').body = sample;
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/#knowledge/category/' + encodeURIComponent('产品与设计') + '/note/n1');
});

test('one live editor presents Markdown and category navigation lists article titles', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await expect(editor(page)).toBeVisible();
  await expect(page.locator('.cm-md-h1')).toHaveText('写作与思考');
  await expect(page.locator('.cm-md-strong')).toContainText('重要的想法');
  await expect(page.locator('.cm-note-table table')).toContainText('笔记编辑器');
  await expect(page.locator('.cm-md-task')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^(分屏预览|阅读|编辑)$/ })).toHaveCount(0);
  await expect(page.locator('#note-preview, textarea#note-body')).toHaveCount(0);
  await expect(page.locator('[data-sidebar-note="n1"]')).toHaveAttribute('aria-current', 'page');
  expect(await source(page)).toBe(sample);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `.tools/live-note-${info.project.name}.png`, fullPage: true });
  if (info.project.name !== 'mobile') {
    const fold = page.locator('[data-note-fold="产品与设计"][data-section="knowledge"]');
    await fold.click(); await expect(page.locator('[data-sidebar-note="n1"]')).toBeHidden();
    await fold.click(); await expect(page.locator('[data-sidebar-note="n1"]')).toBeVisible();
    const other = page.locator('.nav-note-item').filter({ hasText: '一个安静的阅读界面' });
    await other.click(); await expect(page.locator('#note-title')).toHaveValue('一个安静的阅读界面');
  }
  expect(errors).toEqual([]);
});

test('typing, formatting, undo and title changes keep Markdown and editor history', async ({ page }) => {
  await editor(page).fill('重要内容'); await editor(page).press('Control+a');
  await page.getByRole('button', { name: '加粗', exact: true }).click();
  await expect.poll(() => source(page)).toBe('**重要内容**');
  await expect(page.locator('.note-properties')).toHaveCount(0);
  await editor(page).press('Control+z');
  await expect.poll(() => source(page)).toBe('重要内容');
  await editor(page).press('Control+a'); await editor(page).press('Control+k');
  await expect.poll(() => source(page)).toBe('[重要内容](https://example.com)');
  await expect(page.getByRole('dialog', { name: '搜索全部', exact: true })).toHaveCount(0);
  await page.locator('#note-title').fill('即时更新的标题');
  await expect(page.locator('[data-sidebar-note="n1"]')).toHaveText('即时更新的标题');
  await page.reload(); await expect(editor(page)).toBeVisible(); expect(await source(page)).toBe('[重要内容](https://example.com)');
});

test('inserted images render in the editor and survive reload, backup validation, export and undo', async ({ page }) => {
  await editor(page).fill('图片说明\n\n');
  await page.locator('#note-image-upload').setInputFiles({ name: '写作参考.png', mimeType: 'image/png', buffer: await pngFile(page) });
  await expect(page.locator('.cm-note-image img')).toHaveCount(1);
  const saved = await note(page); validateData(await read(page));
  expect(saved.attachments).toHaveLength(1); expect(saved.body).toContain('attachment:');
  await page.reload(); await expect(page.locator('.cm-note-image img')).toHaveCount(1);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 .md', exact: true }).click();
  expect(await readFile(await (await download).path(), 'utf8')).toContain('data:image/webp;base64,');
  await page.getByRole('button', { name: '删除图片：写作参考.png', exact: true }).click();
  await expect(page.locator('.cm-note-image img')).toHaveCount(0);
  await editor(page).press('Control+z'); await expect(page.locator('.cm-note-image img')).toHaveCount(1);
});

test('images can be pasted and dropped, with attachments stored together with the note', async ({ page }) => {
  await editor(page).fill('');
  const bytes = (await pngFile(page)).toString('base64');
  const transfer = await page.evaluateHandle(bytes => { const data = new DataTransfer(); data.items.add(new File([Uint8Array.from(atob(bytes), ch => ch.charCodeAt(0))], '粘贴图片.png', { type: 'image/png' })); return data; }, bytes);
  await editor(page).evaluate((el, data) => el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })), transfer);
  await expect(page.locator('.cm-note-image img')).toHaveCount(1);
  const bounds = await editor(page).boundingBox();
  await editor(page).evaluate((el, { data, x, y }) => el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true })), { data: transfer, x: bounds.x + 25, y: bounds.y + 25 });
  await expect(page.locator('.cm-note-image img')).toHaveCount(2);
  expect((await note(page)).attachments).toHaveLength(2); validateData(await read(page));
});

test('focus and refocus keep Markdown rendered while text and task markers remain editable', async ({ page }) => {
  await page.locator('.cm-md-h1').click();
  await expect(page.locator('.cm-md-h1')).toHaveText('写作与思考');
  await editor(page).press('End'); await page.keyboard.insertText('记录');
  await expect.poll(() => source(page)).toBe(sample.replace('写作与思考', '写作与思考记录'));
  await editor(page).press('Backspace'); await expect(page.locator('.cm-md-h1')).toHaveText('写作与思考记');
  await editor(page).press('Control+z'); await expect(page.locator('.cm-md-h1')).toHaveText('写作与思考');
  await page.locator('#note-title').focus();
  await page.locator('.cm-md-h1').click(); await expect(page.locator('.cm-md-h1')).toHaveText('写作与思考');
  await page.locator('.cm-md-strong').click(); await expect(page.locator('.cm-md-strong')).toHaveText('重要的想法');
  await page.locator('#note-title').focus(); await expect(page.locator('.cm-md-h1')).toHaveText('写作与思考');
  await page.locator('.cm-md-task').last().check(); await expect.poll(() => source(page)).toContain('- [x] 写下第一稿');
  await editor(page).fill('- [ ] 新事项'); await editor(page).press('End'); await editor(page).press('Enter');
  await expect.poll(() => source(page)).toBe('- [ ] 新事项\n- [ ] ');
});

test('typed Markdown markers stay visible until a space confirms their formatting', async ({ page }) => {
  for (const [text, selector, visible] of [
    ['##', '.cm-md-h2', '标题'], ['>', '.cm-md-quote', '引用'], ['-', '.cm-md-bullet', '事项'],
  ]) {
    await editor(page).fill(''); await editor(page).pressSequentially(text);
    await expect(editor(page)).toHaveText(text); await expect(page.locator(selector)).toHaveCount(0);
    await editor(page).press('Space'); await expect(page.locator(selector)).toHaveCount(1);
    await page.keyboard.insertText(visible);
    await expect(editor(page)).not.toContainText(text);
    await expect.poll(() => source(page)).toBe(`${text} ${visible}`);
  }
  for (const [text, selector, visible] of [
    ['**重点**', '.cm-md-strong', '重点'], ['*补充*', '.cm-md-em', '补充'],
    ['~~删除~~', '.cm-md-strike', '删除'], ['`代码`', '.cm-md-inline-code', '代码'],
    ['[参考](https://example.com)', '.cm-md-link', '参考'],
  ]) {
    await editor(page).fill(''); await editor(page).pressSequentially(text);
    await expect(editor(page)).toHaveText(text); await expect(page.locator(selector)).toHaveCount(0);
    await editor(page).press('Space'); await expect(page.locator(selector)).toHaveText(visible);
    await expect.poll(() => source(page)).toBe(`${text} `);
    await page.locator('#note-title').focus(); await editor(page).focus();
    await expect(page.locator(selector)).toHaveText(visible);
  }
  await editor(page).fill(''); await editor(page).pressSequentially('- [ ]');
  await expect(page.locator('.cm-md-task')).toHaveCount(0);
  await editor(page).press('Space'); await expect(page.locator('.cm-md-task')).toHaveCount(1);
});

test('asterisks can be completed into bold without an early bullet conversion', async ({ page }) => {
  await editor(page).fill(''); await editor(page).pressSequentially('**');
  await expect(editor(page)).toHaveText('**'); await expect(page.locator('.cm-md-bullet')).toHaveCount(0);
  await editor(page).pressSequentially('重点**'); await expect(editor(page)).toHaveText('**重点**');
  await expect(page.locator('.cm-md-pending')).toHaveCSS('font-weight', '400');
  await page.locator('#note-title').focus(); await editor(page).focus();
  await expect(editor(page)).toHaveText('**重点**');
  await page.keyboard.insertText('内容'); await expect(editor(page)).toHaveText('**重点**内容');
  await editor(page).press('Space'); await expect(page.locator('.cm-md-strong')).toHaveText('重点');
  await expect(page.locator('.cm-md-strong')).toHaveCSS('font-weight', '700');
  await editor(page).pressSequentially('继续'); await expect(page.locator('.cm-md-strong')).toHaveText('重点');
  await expect.poll(() => source(page)).toBe('**重点**内容 继续');
});

test('cursor movement skips hidden syntax and edits formatted text without losing its markers', async ({ page }) => {
  const markdown = '## 标题\n\n**重点**\n\n[参考](https://example.com)\n\n> 引用';
  await editor(page).fill(markdown);
  await page.locator('.cm-md-h2').click(); await editor(page).press('Home'); await page.keyboard.insertText('新');
  await expect(page.locator('.cm-md-h2')).toHaveText('新标题');
  await page.locator('.cm-md-strong').click(); await editor(page).press('Home');
  await editor(page).press('ArrowRight'); await editor(page).press('Backspace');
  await expect(page.locator('.cm-md-strong')).toHaveText('点');
  await editor(page).press('End'); await page.keyboard.insertText('补充');
  await expect(page.locator('.cm-md-strong')).toHaveText('点补充');
  await page.locator('.cm-md-link').click(); await editor(page).press('End'); await page.keyboard.insertText('链接');
  await expect(page.locator('.cm-md-link')).toHaveText('参考链接');
  await page.locator('.cm-md-quote').click(); await editor(page).press('Home'); await page.keyboard.insertText('新');
  await expect(page.locator('.cm-md-quote')).toHaveText('新引用');
  const expected = '## 新标题\n\n**点补充**\n\n[参考链接](https://example.com)\n\n> 新引用';
  await expect.poll(() => source(page)).toBe(expected);
  await page.reload(); await expect(page.locator('.cm-md-strong')).toHaveText('点补充');
  expect(await source(page)).toBe(expected);
});

test('table cells edit in place, preserve inline formatting, navigate and undo without showing source', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const markdown = '| 主题 | 状态 |\n| --- | --- |\n| **重点** | |';
  await editor(page).fill(markdown); await page.locator('#note-title').focus();
  const first = page.getByRole('textbox', { name: '表格第 2 行第 1 列', exact: true });
  const second = page.getByRole('textbox', { name: '表格第 2 行第 2 列', exact: true });
  await first.click(); await first.press('End'); await page.keyboard.insertText('补充');
  await expect.poll(() => source(page)).toContain('**重点补充**');
  await expect(first.locator('strong')).toHaveText('重点补充');
  await first.press('Tab'); await expect(second).toBeFocused();
  await second.fill('进行中'); await second.press('End'); await page.keyboard.insertText('状态');
  await expect.poll(() => source(page)).toContain('进行中状态');
  await second.press('Control+z'); await expect(second).toHaveText('进行中');
  await expect.poll(() => source(page)).not.toContain('进行中状态');
  await second.press('Control+y'); await expect(second).toHaveText('进行中状态');
  await second.press('Shift+Tab'); await expect(first).toBeFocused();
  await page.locator('#note-title').focus(); await first.click();
  await expect(first).toHaveText('重点补充'); await expect(page.locator('.cm-note-table table')).toHaveCount(1);
  const saved = await source(page); validateData(await read(page));
  await page.reload(); expect(await source(page)).toBe(saved);
  await expect(second).toHaveText('进行中状态'); expect(errors).toEqual([]);
});

test('deleting formatting boundaries or its last character leaves no orphaned Markdown markers', async ({ page }) => {
  for (const [open, close] of [['**', '**'], ['*', '*'], ['~~', '~~'], ['`', '`'], ['[', '](https://example.com)']]) {
    await editor(page).fill(`${open}重点${close}`); await editor(page).press('Home'); await editor(page).press('Backspace');
    await expect.poll(() => source(page)).toBe('重点');
    await editor(page).fill(`${open}重点${close}`); await editor(page).press('End'); await editor(page).press('Delete');
    await expect.poll(() => source(page)).toBe('重点');
    await editor(page).fill(`${open}字${close}`); await editor(page).press('End'); await editor(page).press('Backspace');
    await expect.poll(() => source(page)).toBe('');
  }
  await editor(page).fill('**👨‍👩‍👦**'); await editor(page).press('End'); await editor(page).press('Backspace');
  await expect.poll(() => source(page)).toBe('');
});

test('format buttons and shortcuts edit the selected table cell without changing other document content', async ({ page }) => {
  await editor(page).fill('| 主题 | 状态 |\n| --- | --- |\n| 文字 | 内容 |');
  const cell = page.getByRole('textbox', { name: '表格第 2 行第 1 列', exact: true });
  await cell.click(); await cell.press('Control+a'); await page.getByRole('button', { name: '加粗', exact: true }).click();
  await expect(cell.locator('strong')).toHaveText('文字');
  await expect.poll(() => source(page)).toContain('| **文字** | 内容 |');
  await cell.press('Control+a'); await cell.press('Control+k');
  await expect(cell.locator('a')).toHaveText('文字');
  await expect.poll(() => source(page)).toContain('[**文字**](https://example.com)');
  await expect(page.getByRole('dialog', { name: '搜索全部', exact: true })).toHaveCount(0);
  const before = await source(page);
  await page.getByRole('button', { name: '标题', exact: true }).click();
  expect(await source(page)).toBe(before); await expect(page.locator('.cm-note-table table')).toHaveCount(1);
});

test('refocusing images keeps the image visible and deletion can still be undone', async ({ page }) => {
  await page.locator('#note-image-upload').setInputFiles({ name: '聚焦图片.png', mimeType: 'image/png', buffer: await pngFile(page) });
  const image = page.locator('.cm-note-image img');
  for (let index = 0; index < 2; index++) {
    await page.locator('#note-title').focus(); await image.click(); await expect(image).toBeVisible();
    await expect(editor(page)).not.toContainText('attachment:');
  }
  await page.getByRole('button', { name: '删除图片：聚焦图片.png', exact: true }).click();
  await expect(image).toHaveCount(0); await editor(page).press('Control+z'); await expect(image).toBeVisible();
});

test('select-all replaces the entire rendered document including its table and can be undone', async ({ page }) => {
  await editor(page).focus(); await editor(page).press('Control+a'); await page.keyboard.insertText('整篇替换');
  await expect.poll(() => source(page)).toBe('整篇替换'); await expect(page.locator('.cm-note-table')).toHaveCount(0);
  await editor(page).press('Control+z'); await expect.poll(() => source(page)).toBe(sample);
  await expect(page.locator('.cm-note-table table')).toHaveCount(1);
});

test('table edits preserve padded columns, escaped pipes, pasted text and Chinese composition', async ({ page }) => {
  await editor(page).fill('| 一 | 二 | 三 |\n| --- | --- | --- |\n| 原文 |\n| 下一行 | 内容 | 结尾 |');
  const cell = page.getByRole('textbox', { name: '表格第 2 行第 3 列', exact: true });
  await cell.fill('补齐'); await expect.poll(() => source(page)).toContain('| 原文 |  | 补齐 |');
  const last = page.getByRole('textbox', { name: '表格第 3 行第 3 列', exact: true });
  await last.fill('左|右'); await expect.poll(() => source(page)).toContain('左\\|右');
  await last.press('End');
  await last.evaluate(node => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', '<img src=x onerror=alert(1)>\n下一行');
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(last).toHaveText('左|右<img src=x onerror=alert(1)> 下一行'); await expect(last.locator('img')).toHaveCount(0);
  const before = await source(page);
  await cell.evaluate(node => {
    node.focus(); node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); node.textContent = '中文输入';
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText', data: '中文输入' }));
  });
  expect(await source(page)).toBe(before);
  await cell.dispatchEvent('compositionend', { data: '中文输入' });
  await expect.poll(() => source(page)).toContain('中文输入');
  await expect(page.locator('.cm-note-table table')).toHaveCount(1);
});

test('note images and live editing remain available offline', async ({ page, context }) => {
  await page.locator('#note-image-upload').setInputFiles({ name: '离线图片.png', mimeType: 'image/png', buffer: await pngFile(page) });
  await expect(page.locator('.cm-note-image img')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(page.locator('.cm-note-image img')).toHaveCount(1);
  expect(await page.locator('.cm-note-image img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(editor(page)).toBeVisible();
});

test('invalid images are rejected, and failed saves keep text available for export', async ({ page }) => {
  const before = await source(page);
  await page.locator('#note-image-upload').setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg onload="alert(1)"></svg>') });
  await expect(page.locator('#toast')).toContainText('请选择'); expect(await source(page)).toBe(before);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await editor(page).fill('保留未保存的内容'); await expect(page.locator('#toast')).toContainText('保存失败');
  await expect(editor(page)).toHaveText('保留未保存的内容'); expect(await source(page)).toBe(before);
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 .md', exact: true }).click();
  expect(await readFile(await (await event).path(), 'utf8')).toBe('保留未保存的内容');
});

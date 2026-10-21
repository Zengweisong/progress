import { test, expect } from '@playwright/test';
import { seedData, validateData } from '../public/data.js';
import { readFile } from 'node:fs/promises';
const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
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

test('active line exposes Markdown syntax, and task markers remain editable', async ({ page }) => {
  await page.locator('.cm-md-h1').click();
  await expect(page.locator('.cm-md-h1')).toContainText('# 写作与思考');
  await page.locator('#note-title').focus(); await expect(page.locator('.cm-md-h1')).toHaveText('写作与思考');
  await page.locator('.cm-md-task').last().check(); await expect.poll(() => source(page)).toContain('- [x] 写下第一稿');
  await editor(page).fill('- [ ] 新事项'); await editor(page).press('End'); await editor(page).press('Enter');
  await expect.poll(() => source(page)).toBe('- [ ] 新事项\n- [ ] ');
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

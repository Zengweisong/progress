import { test, expect } from '@playwright/test';
import { seedData, validateData } from '../public/data.js';
import { blankNoteTitle } from '../public/note-templates.js';
import { readFile } from 'node:fs/promises';
const key = 'shixu.workspace.v1';
const read = page => page.evaluate(async key => {
  const { hydrateWorkspace } = await import('/workspace-storage.js');
  return hydrateWorkspace(JSON.parse(localStorage.getItem(key)));
}, key);
const body = page => page.getByRole('textbox', { name: '笔记正文', exact: true });
const withoutTime = value => JSON.parse(JSON.stringify(value, (key, value) => key === 'updatedAt' ? undefined : value));

test.beforeEach(async ({ page }) => {
  const data = seedData();
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/#knowledge');
});

test('create immediately, show templates only for empty text, and keep an untitled page after reload', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const before = await read(page);
  await page.getByRole('button', { name: '新建页面', exact: true }).click();
  await expect(body(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#note-title')).toHaveValue('');
  await expect(page.locator('#note-title')).toHaveAttribute('placeholder', '请输入标题');
  await expect(page.getByRole('button', { name: '使用模板：会议记录', exact: true })).toBeVisible();
  expect((await read(page)).notes).toHaveLength(before.notes.length + 1);
  await page.screenshot({ path: `.tools/blank-note-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await body(page).fill('先记下想法');
  await expect(page.locator('#note-template-suggestions')).toBeHidden();
  await body(page).fill('');
  await expect(page.locator('#note-template-suggestions')).toBeVisible();
  await page.reload();
  await expect(page.locator('#note-title')).toHaveValue('');
  await expect(page.locator('#note-template-suggestions')).toBeVisible();
  validateData(await read(page)); expect(errors).toEqual([]);
});

test('use a built-in in the current page and preserve the entered title', async ({ page }) => {
  await page.getByRole('button', { name: '新建页面', exact: true }).click();
  await page.locator('#note-title').fill('周一讨论');
  const url = page.url();
  await page.getByRole('button', { name: '使用模板：会议记录', exact: true }).click();
  await expect(body(page)).toContainText('行动项');
  await expect(page.locator('#note-title')).toHaveValue('周一讨论');
  expect(page.url()).toBe(url); expect((await read(page)).notes).toHaveLength(8);
  await expect(page.locator('#note-template-suggestions')).toBeHidden();
  await page.reload(); await expect(body(page)).toContainText('会议信息');
});

test('mark a page as template, copy its content and attachments, and cancel the template', async ({ page }) => {
  await page.evaluate(key => {
    const data = JSON.parse(localStorage.getItem(key));
    data.notes[0].body = '## 我的流程\n\n![参考](attachment:asset1)';
    data.notes[0].attachments = [{ id: 'asset1', name: '参考.png', mime: 'image/png', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=' }];
    localStorage.setItem(key, JSON.stringify(data));
  }, key);
  await page.goto('/#knowledge/note/n1'); await page.reload();
  await page.getByRole('button', { name: '设为模板', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消模板', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  const original = (await read(page)).notes.find(n => n.id === 'n1');
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
  await page.locator('.page-heading .note-create-toggle').click();
  const picker = page.getByRole('dialog', { name: '从模板新建', exact: true });
  await picker.getByRole('button', { name: `从模板新建：${original.title}`, exact: true }).click();
  await expect(body(page)).toContainText('我的流程');
  const data = await read(page), copy = data.notes[0];
  expect(copy.id).not.toBe(original.id); expect(copy.isTemplate).toBeUndefined();
  expect(copy.attachments).toEqual(original.attachments); expect(copy.tags).toEqual(original.tags);
  expect(copy.projectIds).toEqual([]); validateData(data);
  await body(page).fill('独立的副本');
  expect((await read(page)).notes.find(n => n.id === 'n1')).toEqual(original);
  await page.goto('/#knowledge/note/n1');
  await page.getByRole('button', { name: '取消模板', exact: true }).click();
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
  await page.locator('.page-heading .note-create-toggle').click();
  await expect(page.getByRole('dialog').getByRole('button', { name: `从模板新建：${original.title}`, exact: true })).toHaveCount(0);
});

test('hover and keyboard reveal the template option; touch can open the picker directly', async ({ page, isMobile }) => {
  const control = page.locator('.page-heading .note-create-control');
  const option = control.locator('.note-create-options button');
  if (!isMobile) {
    const create = control.getByRole('button', { name: '新建页面', exact: true });
    await create.hover();
    await expect(option).toBeVisible();
    await create.focus(); await create.press('Escape');
    await expect(option).toBeHidden();
    await create.press('ArrowDown'); await expect(option).toBeFocused();
    await option.press('Enter');
  } else await control.locator('.note-create-toggle').click();
  const picker = page.getByRole('dialog', { name: '从模板新建', exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: '从模板新建：工作周报', exact: true }).click();
  await expect(page.locator('#note-title')).toHaveValue('工作周报');
  await expect(body(page)).toContainText('下周计划');
});

test('category creation stays in the destination section and templates use that category', async ({ page, isMobile }) => {
  if (isMobile) {
    await page.goto('/#inbox/category/' + encodeURIComponent('产品与设计'));
    await page.getByRole('button', { name: '在当前分类下新建页面', exact: true }).click();
  } else {
    await page.locator('[data-nav-expand="inbox"]').click();
    await page.locator('[data-create-menu="inbox"][data-create-category="产品与设计"]').hover();
    await page.getByRole('menuitem', { name: '新建页面', exact: true }).click();
  }
  await expect(body(page)).toBeVisible();
  expect((await read(page)).notes[0].category).toBe('产品与设计');
  await page.getByRole('button', { name: '使用模板：读书笔记', exact: true }).click();
  expect((await read(page)).notes[0]).toMatchObject({ title: '读书笔记', inbox: false, favorite: true, category: '产品与设计' });
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
  const control = page.locator(isMobile ? '.mobile-categories [data-create-menu="inbox"]' : '.sidebar [data-create-menu="inbox"][data-create-category="产品与设计"]');
  if (isMobile) await control.click(); else await control.hover();
  await page.getByRole('menuitem', { name: '从模板新建', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '从模板新建：个人规划', exact: true }).click();
  await expect(body(page)).toContainText('关键步骤');
  expect((await read(page)).notes[0]).toMatchObject({ title: '个人规划', inbox: false, favorite: true, category: '产品与设计' });
});

test('failed creation does not persist a partial note', async ({ page }) => {
  const before = await read(page), url = page.url();
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await page.getByRole('button', { name: '新建页面', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('保存失败');
  expect(page.url()).toBe(url); expect(await read(page)).toEqual(before);
});

test('template creation in another section does not reuse the current category', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Cross-section menus live in the desktop sidebar');
  await page.goto('/#knowledge/category/' + encodeURIComponent('技术实践'));
  await page.locator('.sidebar .nav-group-heading [data-create-menu="inbox"]').hover();
  await page.getByRole('menuitem', { name: '从模板新建', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '从模板新建：工作周报', exact: true }).click();
  await expect(body(page)).toContainText('下周计划');
  const note = (await read(page)).notes[0];
  expect(note).toMatchObject({ favorite: true, inbox: false });
  expect(note.category).not.toBe('技术实践');
});

for (const action of ['mark', 'apply']) {
  test(`failed template ${action} leaves the existing page intact`, async ({ page }) => {
    await page.getByRole('button', { name: '新建页面', exact: true }).click();
    await expect(body(page)).toBeVisible();
    const before = await read(page);
    await page.evaluate(key => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
    }, key);
    await page.getByRole('button', { name: action === 'mark' ? '设为模板' : '使用模板：会议记录', exact: true }).click();
    await expect(page.locator('#toast')).toContainText('保存失败');
    expect(await read(page)).toEqual(before);
    await expect(body(page).locator('.cm-placeholder')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 .md', exact: true }).click();
    expect(await readFile(await (await download).path(), 'utf8')).toBe('');
    await page.reload(); await expect(page.locator('#note-template-suggestions')).toBeVisible();
    await expect(page.getByRole('button', { name: '设为模板', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });
}

test('more templates apply to the existing blank page offline', async ({ page, context }) => {
  await page.getByRole('button', { name: '新建页面', exact: true }).click();
  await expect(body(page)).toBeVisible();
  const url = page.url();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true); await page.reload();
  await page.getByRole('button', { name: '更多模板', exact: false }).click();
  const dialog = page.getByRole('dialog', { name: '选择页面模板', exact: true });
  await dialog.getByRole('button', { name: '从模板新建：项目复盘', exact: true }).click();
  await expect(body(page)).toContainText('实际成果');
  expect(page.url()).toBe(url); expect((await read(page)).notes).toHaveLength(8);
  await body(page).press('Control+z');
  await expect.poll(async () => (await read(page)).notes[0].body).toBe('');
  expect((await read(page)).notes[0].title).toBe(blankNoteTitle);
  expect((await read(page)).notes).toHaveLength(8);
});

test('one editor Ctrl+Z restores the complete page after applying a template', async ({ page }) => {
  await page.getByRole('button', { name: '新建页面', exact: true }).click();
  await body(page).fill('  \n');
  const before = (await read(page)).notes[0], url = page.url(), count = (await read(page)).notes.length;
  await page.getByRole('button', { name: '使用模板：会议记录', exact: true }).click();
  await expect(body(page)).toContainText('会议信息');
  await expect(page.locator('#note-title')).toHaveValue('会议记录');
  await body(page).press('Control+z');
  await expect.poll(async () => withoutTime((await read(page)).notes.find(note => note.id === before.id))).toEqual(withoutTime(before));
  await expect(page.locator('#note-title')).toHaveValue('');
  await expect(page.locator('#note-template-suggestions')).toBeVisible();
  expect(page.url()).toBe(url); expect((await read(page)).notes).toHaveLength(count);
  await page.reload(); expect(withoutTime((await read(page)).notes.find(note => note.id === before.id))).toEqual(withoutTime(before));
});

test('undo restores custom-template tags and image attachments without changing the source template', async ({ page }) => {
  const data = await read(page), source = data.notes[0];
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  source.isTemplate = true; source.title = '图片页面模板'; source.tags = ['模板标签'];
  source.body = '## 模板内容\n\n![模板图片](attachment:new-image)';
  source.attachments = [{ id: 'new-image', name: '模板图片.png', mime: 'image/png', data: image }];
  data.notes.unshift({ id: 'template-target', title: blankNoteTitle, body: '', summary: '', category: '技术实践', tags: [], projectIds: ['p1'], favorite: true, inbox: false, updatedAt: source.updatedAt,
    attachments: [{ id: 'old-image', name: '原有图片.png', mime: 'image/png', data: image }] });
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data });
  await page.goto('/#knowledge/note/template-target');
  await page.reload(); await expect(body(page)).toBeVisible();
  const before = (await read(page)).notes.find(note => note.id === 'template-target');
  await page.getByRole('button', { name: '更多模板', exact: false }).click();
  await page.getByRole('dialog', { name: '选择页面模板', exact: true }).getByRole('button', { name: '从模板新建：图片页面模板', exact: true }).click();
  await expect(page.locator('.cm-note-image img')).toHaveCount(1);
  expect((await read(page)).notes.find(note => note.id === before.id).tags).toEqual(['模板标签']);
  await page.getByRole('button', { name: '设为模板', exact: true }).focus(); await page.keyboard.press('Control+z');
  await expect.poll(async () => withoutTime((await read(page)).notes.find(note => note.id === before.id))).toEqual(withoutTime(before));
  expect((await read(page)).notes.find(note => note.id === source.id)).toEqual(source);
  await expect(page.locator('.cm-note-image')).toHaveCount(0);
});

test('typing after a template undoes before the template as a separate step', async ({ page }) => {
  await page.getByRole('button', { name: '新建页面', exact: true }).click();
  await body(page).fill(' \n');
  const before = (await read(page)).notes[0];
  await page.getByRole('button', { name: '使用模板：工作周报', exact: true }).click();
  await expect(body(page)).toContainText('下周计划');
  const applied = (await read(page)).notes[0];
  await body(page).press('Control+End'); await page.keyboard.insertText('\n模板之后补充的文字');
  await expect.poll(async () => (await read(page)).notes[0].body).toContain('模板之后补充的文字');
  await body(page).press('Control+z');
  await expect.poll(async () => (await read(page)).notes[0].body).toBe(applied.body);
  expect((await read(page)).notes[0].title).toBe(applied.title);
  await body(page).press('Control+z');
  await expect.poll(async () => withoutTime((await read(page)).notes[0])).toEqual(withoutTime(before));
});

test('a failed template undo keeps both the applied page and its stored contents intact', async ({ page }) => {
  await page.getByRole('button', { name: '新建页面', exact: true }).click();
  await page.getByRole('button', { name: '使用模板：读书笔记', exact: true }).click();
  await expect(body(page)).toContainText('书籍信息');
  const applied = await read(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await body(page).press('Control+z');
  await expect(page.locator('#toast')).toContainText('保存失败');
  expect(await read(page)).toEqual(applied);
  await expect(page.locator('#note-title')).toHaveValue('读书笔记');
  await expect(body(page)).toContainText('书籍信息');
});

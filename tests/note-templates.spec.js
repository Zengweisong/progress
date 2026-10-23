import { test, expect } from '@playwright/test';
import { seedData, validateData } from '../public/data.js';
import { readFile } from 'node:fs/promises';
const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const body = page => page.getByRole('textbox', { name: '笔记正文', exact: true });

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
    const create = page.locator('[data-action="new-category-page"][data-section="inbox"][data-name="产品与设计"]');
    await create.locator('..').hover(); await create.click();
  }
  await expect(body(page)).toBeVisible();
  await expect(page.locator('#note-category')).toHaveValue('产品与设计');
  await page.getByRole('button', { name: '使用模板：读书笔记', exact: true }).click();
  expect((await read(page)).notes[0]).toMatchObject({ title: '读书笔记', inbox: true, category: '产品与设计' });
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
  const control = page.locator(isMobile ? '.mobile-categories .note-create-control' : '.nav-note-category[data-order-section="inbox"][data-order-category="产品与设计"] .note-create-control');
  if (isMobile) await control.locator('.note-create-toggle').click();
  else { await control.hover(); await control.locator('.note-create-options button').click(); }
  await page.getByRole('dialog').getByRole('button', { name: '从模板新建：个人规划', exact: true }).click();
  await expect(body(page)).toContainText('关键步骤');
  expect((await read(page)).notes[0]).toMatchObject({ title: '个人规划', inbox: true, category: '产品与设计' });
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
});

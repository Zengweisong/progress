import { test, expect } from '@playwright/test';
import { seedData } from '../public/data.js';

const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const picker = page => page.getByRole('dialog', { name: '选择页面模板', exact: true });
const ids = page => picker(page).locator('[data-common-template]').evaluateAll(cards => cards.map(card => card.dataset.commonTemplate));
const handle = (page, id) => picker(page).locator(`[data-template-drag="${id}"]`);
async function openPicker(page) { await page.getByRole('button', { name: '更多模板', exact: false }).click(); await expect(picker(page)).toBeVisible(); }
async function drag(page, from, target, cancel = false) {
  await from.scrollIntoViewIfNeeded(); await target.scrollIntoViewIfNeeded();
  const a = await from.boundingBox(), b = await target.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width * .2, b.y + b.height / 2, { steps: 16 });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  const data = seedData();
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/#knowledge'); await page.getByRole('button', { name: '新建页面', exact: true }).click();
});

test('common templates drag without applying, persist across reload and support keyboard undo', async ({ page }, info) => {
  const before = await read(page); await openPicker(page); const order = await ids(page);
  await drag(page, handle(page, 'weekly'), picker(page).locator('[data-common-template="meeting"]'));
  await expect.poll(() => ids(page)).toEqual(['weekly', 'meeting', ...order.slice(2)]);
  expect((await read(page)).notes).toEqual(before.notes); await expect(picker(page)).toBeVisible();
  await page.keyboard.press('Control+z'); await expect.poll(() => ids(page)).toEqual(order);
  await handle(page, 'planning').press('Alt+ArrowUp');
  const savedOrder = await ids(page); expect(savedOrder.at(-1)).toBe('reading');
  await page.reload(); await openPicker(page); expect(await ids(page)).toEqual(savedOrder);
  await page.screenshot({ path: `.tools/common-templates-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('editing common template Markdown saves with Ctrl+S and applies the edited content', async ({ page }, info) => {
  const before = await read(page); await openPicker(page);
  await picker(page).getByRole('button', { name: '编辑模板：会议记录', exact: true }).click();
  await page.getByRole('textbox', { name: '模板名称', exact: true }).fill('我的会议流程');
  await page.getByRole('textbox', { name: '模板简介', exact: true }).fill('议题、行动与验收');
  const editor = page.getByRole('textbox', { name: '模板正文', exact: true });
  await editor.fill('## 我的流程\n\n- [ ] 明确负责人\n\n**验收标准**');
  await page.screenshot({ path: `.tools/common-template-edit-${info.project.name}.png` });
  await editor.press('Control+s');
  await expect(picker(page)).toBeVisible();
  await expect(picker(page).getByRole('button', { name: '从模板新建：我的会议流程', exact: true })).toContainText('议题、行动与验收');
  expect((await read(page)).notes).toEqual(before.notes);
  await page.reload(); await openPicker(page);
  await picker(page).getByRole('button', { name: '从模板新建：我的会议流程', exact: true }).click();
  await expect.poll(async () => (await read(page)).notes[0].body).toBe('## 我的流程\n\n- [ ] 明确负责人\n\n**验收标准**');
  await expect(page.locator('#note-title')).toHaveValue('我的会议流程');
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).press('Control+z');
  await expect.poll(async () => (await read(page)).notes[0].body).toBe('');
  expect((await read(page)).templates.find(t => t.id === 'meeting').title).toBe('我的会议流程');
});

test('cancel and undo keep common template edits separate from the open page', async ({ page }) => {
  const before = await read(page); await openPicker(page);
  await picker(page).getByRole('button', { name: '编辑模板：会议记录', exact: true }).click();
  await page.getByRole('textbox', { name: '模板名称', exact: true }).fill('不保存的名称');
  await page.getByRole('textbox', { name: '模板正文', exact: true }).fill('不保存的正文');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(picker(page)).toBeVisible(); expect(await read(page)).toEqual(before);
  await picker(page).getByRole('button', { name: '编辑模板：会议记录', exact: true }).click();
  await page.getByRole('textbox', { name: '模板名称', exact: true }).fill('保存再撤销');
  await page.getByRole('button', { name: '保存模板', exact: true }).click();
  await page.keyboard.press('Control+z');
  await expect(picker(page).getByRole('button', { name: '从模板新建：会议记录', exact: true })).toBeVisible();
  expect((await read(page)).templates).toEqual(before.templates);
  expect((await read(page)).notes).toEqual(before.notes);
});

test('Escape cancels template dragging and failed writes preserve stored order and edit drafts', async ({ page }) => {
  await openPicker(page); const before = await read(page), order = await ids(page);
  await drag(page, handle(page, 'weekly'), picker(page).locator('[data-common-template="meeting"]'), true);
  expect(await ids(page)).toEqual(order); expect(await read(page)).toEqual(before);
  await picker(page).getByRole('button', { name: '编辑模板：会议记录', exact: true }).click();
  await page.getByRole('textbox', { name: '模板名称', exact: true }).fill('无法保存的名称');
  const body = page.getByRole('textbox', { name: '模板正文', exact: true }); await body.fill('保留可复制的草稿');
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await page.getByRole('button', { name: '保存模板', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('保存失败');
  await expect(page.getByRole('textbox', { name: '模板名称', exact: true })).toHaveValue('无法保存的名称');
  await expect(body).toHaveText('保留可复制的草稿'); expect(await read(page)).toEqual(before);
});

test('touch can reorder common template handles', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch surface'); await openPicker(page); const order = await ids(page);
  const from = handle(page, 'weekly'), target = picker(page).locator('[data-common-template="meeting"]');
  const a = await from.boundingBox(), b = await target.boundingBox(), cdp = await page.context().newCDPSession(page);
  const x = a.x + a.width / 2, y = a.y + a.height / 2, endX = b.x + b.width * .2, endY = b.y + b.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 16; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (endX - x) * step / 16, y: y + (endY - y) * step / 16 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => ids(page)).toEqual(['weekly', 'meeting', ...order.slice(2)]);
});

test('failed reorder writes leave the template grid and stored content unchanged', async ({ page }) => {
  await openPicker(page); const before = await read(page), order = await ids(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await handle(page, 'weekly').press('Alt+ArrowUp');
  await expect(page.locator('#toast')).toContainText('保存失败');
  expect(await ids(page)).toEqual(order); expect(await read(page)).toEqual(before);
});

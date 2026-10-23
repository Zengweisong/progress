import { test, expect } from '@playwright/test';
import { seedData } from '../public/data.js';

const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const stations = page => page.locator('[data-route-project="p1"]');
const input = (page, id) => page.locator(`[data-route-task="${id}"] > input`);
const order = page => stations(page).evaluateAll(nodes => nodes.map(node => node.dataset.routeTask));
test.beforeEach(async ({ page }) => {
  const data = seedData(); data.projects = data.projects.slice(0, 2); data.notes = [];
  data.projects[0].modules = [{ id: 'module', name: '界面' }];
  data.projects[0].tasks[4].moduleId = 'module';
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/');
});

async function drag(page, id, targetId) {
  await input(page, id).scrollIntoViewIfNeeded();
  const start = await input(page, id).boundingBox(), target = await input(page, targetId).boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, start.y + start.height / 2, { steps: 12 });
  await page.mouse.up();
}

test('dots reorder right and left without changing completion, module membership or project order', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const initial = await read(page), originalOrder = await order(page);
  const projectOrder = await page.locator('[data-select-project]').evaluateAll(nodes => nodes.map(node => node.dataset.selectProject));
  await drag(page, 'p1-t0', 'p1-t1');
  expect((await order(page)).slice(0, 2)).toEqual(['p1-t1', 'p1-t0']);
  await expect(page.locator('[data-select-project="p1"] small')).toHaveCount(0);
  expect((await read(page)).projects[0].tasks.filter(task => task.done)).toHaveLength(3);
  let saved = await read(page);
  expect([...saved.projects[0].tasks].sort((a, b) => a.id.localeCompare(b.id))).toEqual(initial.projects[0].tasks);
  expect(saved.projects[1]).toEqual(initial.projects[1]);
  expect(await page.locator('[data-select-project]').evaluateAll(nodes => nodes.map(node => node.dataset.selectProject))).toEqual(projectOrder);
  await page.reload();
  expect((await order(page)).slice(0, 2)).toEqual(['p1-t1', 'p1-t0']);
  await drag(page, 'p1-t0', 'p1-t1');
  expect(await order(page)).toEqual(originalOrder);
  await page.waitForTimeout(450);
  await input(page, 'p1-t0').uncheck();
  expect((await read(page)).projects[0].tasks[0].done).toBe(false);
  expect(errors).toEqual([]);
});

test('keyboard moves dots and Escape cancels a pointer drag', async ({ page }) => {
  await input(page, 'p1-t0').focus(); await page.keyboard.press('Alt+ArrowRight');
  expect((await order(page)).slice(0, 2)).toEqual(['p1-t1', 'p1-t0']);
  await expect(input(page, 'p1-t0')).toBeFocused();
  await page.keyboard.press('Alt+ArrowLeft');
  const before = await read(page), start = await input(page, 'p1-t0').boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
  await page.mouse.move(start.x + 160, start.y + start.height / 2, { steps: 10 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await read(page)).toEqual(before);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('failed save restores the old order and preserves capture draft', async ({ page }) => {
  await page.locator('#route-capture-body').fill('未提交的记录');
  const before = await read(page), originalOrder = await order(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await drag(page, 'p1-t0', 'p1-t1');
  expect(await order(page)).toEqual(originalOrder);
  expect(await read(page)).toEqual(before);
  await expect(page.locator('#route-capture-body')).toHaveValue('未提交的记录');
});

test('dragging near the right edge scrolls to later tasks', async ({ page }) => {
  const original = await read(page);
  const start = await input(page, 'p1-t0').boundingBox();
  const scroll = page.locator('.mr-route-line').filter({ has: page.locator('[data-select-project="p1"]') }).locator('.mr-stations-scroll').first();
  const bounds = await scroll.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 8, start.y + start.height / 2, { steps: 12 });
  await page.waitForTimeout(700); await page.mouse.up();
  expect((await order(page)).indexOf('p1-t0')).toBeGreaterThan(0);
  const saved = await read(page);
  expect(saved.projects[0].tasks.filter(task => task.done).length).toBe(original.projects[0].tasks.filter(task => task.done).length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('touch can move a dot horizontally', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Uses the mobile touch surface');
  const start = await input(page, 'p1-t0').boundingBox(), end = await input(page, 'p1-t1').boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x = start.x + start.width / 2, y = start.y + start.height / 2, endX = end.x + end.width / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 12; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (endX - x) * step / 12, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await order(page)).slice(0, 2)).toEqual(['p1-t1', 'p1-t0']);
  expect((await read(page)).projects[0].tasks.filter(task => task.done)).toHaveLength(3);
});

import { test, expect } from '@playwright/test';
import { seedData, validateData } from '../public/data.js';

const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const zone = (page, moduleId) => page.locator(`[data-task-zone][data-module-id="${moduleId}"]`).filter({ visible: true }).last();
const dragInput = (page, id, detail = false) => page.locator(detail ? `.project-detail [data-task-drag-handle="${id}"]` : `[data-route-task="${id}"] > input`);

test.beforeEach(async ({ page }) => {
  const data = seedData(); data.projects = data.projects.slice(0, 1); data.notes = [];
  data.projects[0].tag = '工作'; data.projects[0].pinned = false;
  data.projects[0].modules = [{ id: 'ui', name: '界面' }, { id: 'server', name: '服务端' }];
  data.projects[0].tasks = data.projects[0].tasks.slice(0, 3);
  data.projects[0].tasks[2].moduleId = 'ui';
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/');
});

async function drag(page, input, target, cancel = false) {
  await target.scrollIntoViewIfNeeded(); await input.scrollIntoViewIfNeeded();
  const start = await input.boundingBox(), end = await target.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
  await page.mouse.move(end.x + Math.min(end.width / 2, 45), end.y + Math.min(end.height / 2, 35), { steps: 20 });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
}

test('route dots move between modules, into empty modules and back to ungrouped without changing completion', async ({ page }) => {
  const before = await read(page), completed = before.projects[0].tasks.filter(task => task.done).length;
  await drag(page, dragInput(page, 'p1-t0'), zone(page, 'ui').locator('.mr-stations'));
  await expect(zone(page, 'ui').locator('[data-route-task="p1-t0"]')).toHaveCount(1);
  await drag(page, dragInput(page, 'p1-t2'), zone(page, 'server').locator('.mr-stations'));
  await expect(zone(page, 'server').locator('[data-route-task="p1-t2"]')).toHaveCount(1);
  await dragInput(page, 'p1-t2').focus(); await page.keyboard.press('Alt+ArrowUp'); await page.keyboard.press('Alt+ArrowUp');
  await expect(zone(page, '').locator('[data-route-task="p1-t2"]')).toHaveCount(1);
  const saved = await read(page); validateData(saved);
  expect(saved.projects[0].tasks.filter(task => task.done)).toHaveLength(completed);
  for (const task of before.projects[0].tasks) expect(saved.projects[0].tasks.find(item => item.id === task.id)).toMatchObject({ title: task.title, done: task.done });
  await page.reload(); await expect(zone(page, 'ui').locator('[data-route-task="p1-t0"]')).toHaveCount(1);
});

test('detail handles move tasks into an empty module and Escape cancels without opening an editor', async ({ page }) => {
  await page.locator('.mr-dock-title').click();
  const before = await read(page);
  await drag(page, dragInput(page, 'p1-t0', true), zone(page, 'ui').locator('.module-heading'), true);
  expect(await read(page)).toEqual(before);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await drag(page, dragInput(page, 'p1-t0', true), zone(page, 'ui').locator('.module-heading'));
  await expect(zone(page, 'ui').locator('[data-task-row="p1-t0"]')).toHaveCount(1);
  await drag(page, dragInput(page, 'p1-t2', true), zone(page, 'server').locator('.module-heading'));
  await expect(zone(page, 'server').locator('[data-task-row="p1-t2"]')).toHaveCount(1);
  await dragInput(page, 'p1-t2', true).focus(); await page.keyboard.press('Alt+ArrowLeft');
  await expect(zone(page, 'ui').locator('[data-task-row="p1-t2"]')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.screenshot({ path: `.tools/module-drag-detail-${test.info().project.name}.png` });
});

test('failed cross-module writes roll back both membership and order and preserve quick-add drafts', async ({ page }) => {
  const draft = zone(page, 'server').getByRole('textbox'); await draft.fill('保留这条草稿');
  const before = await read(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await drag(page, dragInput(page, 'p1-t0'), zone(page, 'ui').locator('.mr-stations'));
  expect(await read(page)).toEqual(before);
  await expect(zone(page, '').locator('[data-route-task="p1-t0"]')).toHaveCount(1);
  await expect(draft).toHaveValue('保留这条草稿');
});

test('detail handles reorder within a module and leave checkbox state unchanged', async ({ page }) => {
  await page.locator('.mr-dock-title').click();
  const before = await read(page);
  await drag(page, dragInput(page, 'p1-t0', true), zone(page, '').locator('[data-task-row="p1-t1"]'));
  expect(await zone(page, '').locator('[data-task-row]').evaluateAll(nodes => nodes.map(node => node.dataset.taskRow))).toEqual(['p1-t1', 'p1-t0']);
  await dragInput(page, 'p1-t0', true).focus(); await page.keyboard.press('Alt+ArrowUp');
  expect((await read(page)).projects[0].tasks).toEqual(before.projects[0].tasks);
});

test('dropping over another project cancels the move and does not open its detail', async ({ page }) => {
  const other = seedData().projects[1]; other.tasks = [];
  await page.evaluate(({ key, other }) => {
    const data = JSON.parse(localStorage.getItem(key));
    data.projects[0].modules = []; data.projects[0].tasks.forEach(task => { task.moduleId = ''; });
    data.projects.push(other); localStorage.setItem(key, JSON.stringify(data));
  }, { key, other });
  await page.reload();
  const before = await read(page), selected = await page.locator('[data-select-project][aria-pressed=true]').getAttribute('data-select-project');
  const target = page.locator('[data-task-zone][data-project-id="p2"] .mr-stations');
  await drag(page, dragInput(page, 'p1-t0'), target);
  expect(await read(page)).toEqual(before);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator(`[data-select-project="${selected}"]`)).toHaveAttribute('aria-pressed', 'true');
});

test('each route adds directly to its module and Enter keeps focus ready for another task', async ({ page }) => {
  const target = zone(page, 'server'), input = target.getByRole('textbox');
  await input.fill('实现快速添加'); await input.press('Enter');
  await expect(target.locator('[data-route-task]')).toHaveCount(1);
  await expect(input).toHaveValue(''); await expect(input).toBeFocused();
  await input.fill('连续添加事项'); await target.getByRole('button', { name: '添加到服务端', exact: true }).click();
  const saved = await read(page); validateData(saved);
  expect(saved.projects[0].tasks.filter(task => task.moduleId === 'server').map(task => task.title)).toEqual(['实现快速添加', '连续添加事项']);
  await page.reload(); await expect(target.locator('[data-route-task]')).toHaveCount(2);
  await page.screenshot({ path: `.tools/module-quick-add-${test.info().project.name}.png`, fullPage: true });
});

for (const detail of [false, true]) test(`touch moves a ${detail ? 'detail handle' : 'route dot'} to another module`, async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile touch surface');
  if (detail) await page.locator('.mr-dock-title').click();
  const input = dragInput(page, 'p1-t0', detail), target = zone(page, 'ui').locator(detail ? '.module-heading' : '.mr-stations');
  await target.scrollIntoViewIfNeeded(); await input.scrollIntoViewIfNeeded();
  const start = await input.boundingBox(), end = await target.boundingBox(), cdp = await page.context().newCDPSession(page);
  const x = start.x + start.width / 2, y = start.y + start.height / 2, endX = end.x + 45, endY = end.y + 20;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 20; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (endX - x) * step / 20, y: y + (endY - y) * step / 20 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(zone(page, 'ui').locator(detail ? '[data-task-row="p1-t0"]' : '[data-route-task="p1-t0"]')).toHaveCount(1);
});

import { test, expect } from '@playwright/test';
import { seedData, validateData } from '../public/data.js';
const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const category = (page, section, name) => page.locator(`[data-record-drag="category"][data-order-section="${section}"]`).filter({ has: page.locator('.nav-category-name', { hasText: new RegExp(`^${name}$`) }) });
const home = page => page.locator('[data-home-project]');
const homeIds = page => home(page).evaluateAll(rows => rows.map(row => row.dataset.homeProject));
const projectLink = (page, id) => page.locator(`[data-sidebar-project="${id}"]`);
async function drag(page, from, to, after = false, cancel = false) {
  await from.scrollIntoViewIfNeeded(); await to.scrollIntoViewIfNeeded();
  const a = await from.boundingBox(), b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + Math.min(b.width / 2, 50), b.y + b.height * (after ? .8 : .2), { steps: 16 });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
}
test.beforeEach(async ({ page }) => {
  const data = seedData(); data.projects = data.projects.slice(0, 4); data.projects.forEach((p, i) => { p.tag = i < 2 ? '工作' : '生活'; p.pinned = false; });
  data.notes = data.notes.slice(0, 4); data.notes.forEach((n, i) => { n.category = i < 2 ? '资料' : '随笔'; n.projectIds = ['p1']; n.inbox = false; });
  data.folders = [{ id: 'empty', section: 'projects', name: '空分类', updatedAt: data.projects[0].updatedAt }, { id: 'notes-empty', section: 'knowledge', name: '待整理', updatedAt: data.projects[0].updatedAt }];
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/#projects');
});
test('project categories reorder and projects move between categories, including folded empty categories', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop sidebar');
  const before = await read(page);
  await drag(page, category(page, 'projects', '生活'), category(page, 'projects', '工作'));
  await expect(page.locator('#nav-children-projects > [data-order-category][data-record-zone]')).toHaveCount(3);
  expect(await page.locator('#nav-children-projects > [data-order-category]').evaluateAll(rows => rows.map(row => row.dataset.orderCategory))).toEqual(['空分类', '生活', '工作']);
  await drag(page, projectLink(page, 'p2'), projectLink(page, 'p1'));
  expect(await page.locator('[data-order-category="工作"] [data-sidebar-project]').evaluateAll(rows => rows.map(row => row.dataset.sidebarProject))).toEqual(['p2', 'p1']);
  await category(page, 'projects', '空分类').click();
  await drag(page, projectLink(page, 'p1'), category(page, 'projects', '空分类'));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await read(page)).projects[0].tag).toBe('空分类');
  await page.reload();
  expect(await projectLink(page, 'p1').evaluate(el => el.closest('[data-order-category]').dataset.orderCategory)).toBe('空分类');
  const saved = await read(page); validateData(saved); expect(saved.projects[0].tasks).toEqual(before.projects[0].tasks); expect(saved.notes).toEqual(before.notes);
});
test('home project handles reorder filtered and complete lists, retain drafts and persist on reload', async ({ page }) => {
  const original = await homeIds(page), before = await read(page);
  await page.locator('#route-capture-body').fill('保留记录草稿');
  await drag(page, page.locator(`[data-home-project="${original[2]}"] .home-record-handle`), home(page).first());
  expect((await homeIds(page)).slice(0, 3)).toEqual([original[2], original[0], original[1]]);
  await expect(page.locator('#sort-select')).toHaveValue('manual');
  await expect(page.locator('#route-capture-body')).toHaveValue('保留记录草稿');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const ids = await homeIds(page); await page.reload(); expect(await homeIds(page)).toEqual(ids);
  const saved = await read(page); validateData(saved); expect(saved.projects.map(p => p.tasks)).toEqual(before.projects.map(p => p.tasks));
  for (const view of ['table', 'board', 'route']) { await page.locator(`[data-view="${view}"]`).click(); await expect(page.locator('#sort-select')).toHaveValue('manual'); }
  expect(await homeIds(page)).toEqual(ids);
});
test('knowledge categories and article titles can reorder and move without modifying note contents', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop sidebar');
  await page.goto('/#knowledge'); const expand = page.locator('[data-nav-expand="knowledge"]'); if (await expand.getAttribute('aria-expanded') !== 'true') await expand.click();
  const before = await read(page);
  await drag(page, category(page, 'knowledge', '随笔'), category(page, 'knowledge', '资料'));
  await drag(page, page.locator('[data-sidebar-note="n2"]'), page.locator('[data-sidebar-note="n1"]'));
  expect(await page.locator('[data-order-category="资料"] [data-sidebar-note]').evaluateAll(rows => rows.map(row => row.dataset.sidebarNote))).toEqual(['n2', 'n1']);
  await drag(page, page.locator('[data-sidebar-note="n1"]'), category(page, 'knowledge', '待整理'));
  const saved = await read(page); validateData(saved);
  expect(saved.notes[0].category).toBe('待整理'); expect(saved.notes.map(n => [n.body, n.projectIds])).toEqual(before.notes.map(n => [n.body, n.projectIds]));
  await page.reload(); expect(await page.locator('[data-sidebar-note="n1"]').evaluate(el => el.closest('[data-order-category]').dataset.orderCategory)).toBe('待整理');
});
test('note cards use their handles for ordering, including touch screens', async ({ page }) => {
  await page.goto('/#knowledge');
  const before = await read(page), cards = page.locator('[data-order-note]'), ids = await cards.evaluateAll(rows => rows.map(row => row.dataset.orderNote));
  await drag(page, cards.nth(1).locator('.note-record-handle'), cards.first());
  expect((await cards.evaluateAll(rows => rows.map(row => row.dataset.orderNote))).slice(0, 2)).toEqual([ids[1], ids[0]]);
  await expect(page.locator('.note-workspace')).toHaveCount(0);
  await page.reload(); expect((await cards.evaluateAll(rows => rows.map(row => row.dataset.orderNote)))[0]).toBe(ids[1]);
  const saved = await read(page); expect(saved.notes.map(n => [n.title, n.body, n.projectIds])).toEqual(before.notes.map(n => [n.title, n.body, n.projectIds]));
});
test('Escape, invalid targets and failed saves preserve order, categories and input drafts', async ({ page }) => {
  const ids = await homeIds(page), before = await read(page);
  const input = page.locator('[data-home-project="p1"] [data-task-add] input'); await input.fill('保留事项草稿');
  await drag(page, home(page).nth(1).locator('.home-record-handle'), home(page).first(), false, true);
  expect(await read(page)).toEqual(before); expect(await homeIds(page)).toEqual(ids);
  await drag(page, home(page).nth(1).locator('.home-record-handle'), page.locator('.stats-strip'));
  expect(await read(page)).toEqual(before);
  await page.evaluate(key => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); }; }, key);
  await drag(page, home(page).nth(1).locator('.home-record-handle'), home(page).first());
  expect(await read(page)).toEqual(before); expect(await homeIds(page)).toEqual(ids); await expect(input).toHaveValue('保留事项草稿');
});
test('Alt arrows reorder project handles and sidebar categories without activating them', async ({ page, isMobile }) => {
  const before = await homeIds(page), handle = page.locator(`[data-home-project="${before[1]}"] .home-record-handle`);
  await handle.focus(); await page.keyboard.press('Alt+ArrowUp');
  expect((await homeIds(page))[0]).toBe(before[1]);
  await expect(handle).toBeFocused();
  await page.keyboard.press('Alt+ArrowDown'); expect(await homeIds(page)).toEqual(before);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (!isMobile) {
    const first = category(page, 'projects', '空分类'); await first.focus(); await page.keyboard.press('Alt+ArrowDown');
    expect((await page.locator('#nav-children-projects > [data-order-category]').evaluateAll(rows => rows.map(row => row.dataset.orderCategory))).slice(0, 2)).toEqual(['工作', '空分类']);
  }
});
test('mobile touch can reorder home project handles', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile touch');
  const ids = await homeIds(page); const from = home(page).nth(1).locator('.home-record-handle');
  await from.scrollIntoViewIfNeeded();
  const to = home(page).first(); await to.scrollIntoViewIfNeeded();
  await from.scrollIntoViewIfNeeded(); const start = await from.boundingBox(), end = await to.boundingBox();
  const cdp = await page.context().newCDPSession(page), x = start.x + start.width / 2, y = start.y + start.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 16; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (end.y + 25 - y) * i / 16 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await homeIds(page)).slice(0, 2)).toEqual([ids[1], ids[0]]);
});

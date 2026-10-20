import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const password = 'test-password-12345';
const name = () => `user-${randomUUID().slice(0, 12)}`;
const dialog = page => page.locator('#sync-dialog');
async function openSync(page) {
  if (!await dialog(page).isVisible()) await page.getByRole('button', { name: '账号与多端同步', exact: true }).first().click();
}
async function closeSync(page) { await page.getByRole('button', { name: '关闭账号与多端同步', exact: true }).click(); }
async function account(page, username, register = false, mode = 'cloud') {
  await openSync(page);
  if (register) {
    await expect(page.getByRole('button', { name: '注册账号', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '注册账号', exact: true }).click();
  }
  await page.getByLabel('账号', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: register ? '创建账号' : '登录账号', exact: true }).click();
  await dialog(page).getByRole('button', { name: mode === 'merge' ? /同步本机工作区/ : /打开账号工作区/ }).click();
  await expect(dialog(page).locator('[data-sync-status]')).toHaveText('已同步');
  await closeSync(page);
}
async function sync(page) {
  await openSync(page);
  const button = dialog(page).getByRole('button', { name: '立即同步', exact: true });
  if (await button.count()) await button.click();
  await expect(dialog(page).locator('[data-sync-status]')).toHaveText('已同步');
  await closeSync(page);
}
async function editProject(page, title) {
  await page.goto('/#projects/project/p1');
  await page.getByRole('textbox', { name: '项目标题', exact: true }).fill(title);
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
}
async function stored(page, space = 'main') {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), space === 'main' ? 'shixu.workspace.v1' : 'shixu-layout-lab-v1');
}
async function secondDevice(browser, username) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4183', locale: 'zh-CN' });
  const page = await context.newPage(); await page.goto('/');
  await account(page, username);
  return { context, page };
}

test('real registration and two-device sync, editing deferral and offline reload merge', async ({ page, browser }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const username = name(); await page.goto('/'); await account(page, username, true, 'merge');
  const b = await secondDevice(browser, username);
  try {
    await editProject(page, '电脑端修改的项目'); await sync(page); await sync(b.page);
    expect((await stored(b.page)).projects[0].title).toBe('电脑端修改的项目');
    await b.page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => b.page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await b.context.setOffline(true);
    await editProject(b.page, '手机离线修改');
    await b.page.reload();
    expect((await stored(b.page)).projects[0].title).toBe('手机离线修改');
    await page.goto('/#knowledge/note/n1');
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('textbox', { name: '笔记正文' }).fill('电脑端独立新增的笔记内容');
    await page.getByRole('button', { name: '阅读', exact: true }).click();
    await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
    await sync(page);
    await b.context.setOffline(false); await sync(b.page); await sync(page);
    const aData = await stored(page), bData = await stored(b.page);
    expect(aData.projects[0].title).toBe('手机离线修改');
    expect(bData.notes[0].body).toBe('电脑端独立新增的笔记内容');
    expect(aData).toEqual(bData);
    expect(errors).toEqual([]);
    const cached = await b.page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat());
    expect(cached.some(url => url.includes('/api/'))).toBe(false);
  } finally { await b.context.close(); }
});

test('conflicting offline edits keep both versions and downloadable recovery', async ({ page, browser }, testInfo) => {
  const username = name(); await page.goto('/'); await account(page, username, true, 'merge');
  const b = await secondDevice(browser, username);
  try {
    await b.page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await b.context.setOffline(true);
    await editProject(b.page, '手机保留这一版');
    await editProject(page, '电脑保留另一版'); await sync(page);
    await b.context.setOffline(false); await openSync(b.page);
    await expect(dialog(b.page).locator('[data-sync-status]')).toHaveText('有冲突待处理', { timeout: 20000 });
    await b.page.screenshot({ path: 'docs/screenshots/sync-conflicts-desktop.png', animations: 'disabled' });
    await b.page.setViewportSize({ width: 390, height: 844 });
    expect(await b.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await b.page.screenshot({ path: 'docs/screenshots/sync-conflicts-mobile.png', animations: 'disabled' });
    await expect(dialog(b.page).getByRole('button', { name: '退出账号', exact: true })).toHaveCount(0);
    await b.page.getByRole('button', { name: '合并并保留冲突副本', exact: true }).click();
    await expect(dialog(b.page).locator('[data-sync-status]')).toHaveText('已同步');
    const downloadEvent = b.page.waitForEvent('download');
    await b.page.getByRole('button', { name: '导出数据与恢复备份', exact: true }).click();
    const download = await downloadEvent, backupPath = testInfo.outputPath('recovery.json');
    await download.saveAs(backupPath);
    const backup = JSON.parse(await readFile(backupPath, 'utf8'));
    expect(backup.archives.length).toBeGreaterThanOrEqual(3);
    expect(backup.archives.some(item => item.data.projects.some(project => project.title === '手机保留这一版'))).toBe(true);
    expect(backup.archives.some(item => item.data.projects.some(project => project.title === '电脑保留另一版'))).toBe(true);
    await closeSync(b.page); await sync(page);
    const data = await stored(page);
    expect(data.projects.some(project => project.title === '手机保留这一版')).toBe(true);
    expect(data.projects.some(project => project.title === '电脑保留另一版（冲突副本）')).toBe(true);
    expect(data.projects.length).toBe(9);
  } finally { await b.context.close(); }
});

test('new account opens an isolated workspace and lab sync stays separate', async ({ page }) => {
  const username = name(); await page.goto('/'); await account(page, username, true, 'merge');
  await editProject(page, '主工作区的专属项目'); await sync(page);
  await page.goto('/layouts.html?layout=focus&present=1'); await openSync(page);
  await dialog(page).getByRole('button', { name: /同步本机工作区/ }).click();
  await expect(dialog(page).locator('[data-sync-status]')).toHaveText('已同步'); await closeSync(page);
  expect((await stored(page, 'lab')).projects[0].title).toBe('个人知识库 2.0');
  expect((await stored(page)).projects[0].title).toBe('主工作区的专属项目');
  await page.goto('/'); await openSync(page);
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await expect(page.getByRole('button', { name: '注册账号', exact: true })).toBeVisible();
  await closeSync(page);
  await account(page, name(), true, 'cloud');
  expect((await stored(page)).projects).toHaveLength(0);
  const response = await page.request.get('/api/workspace?space=main');
  expect((await response.json()).data).toBeNull();
  await page.reload();
  await expect(page.locator('[data-sync-label]')).toHaveText('已同步');
  expect((await stored(page)).projects).toHaveLength(0);
});

test('route tasks and linked notes sync across devices while drafts and layouts stay local', async ({ page, browser }) => {
  const username = name(); await page.goto('/'); await account(page, username, true, 'merge');
  const b = await secondDevice(browser, username);
  try {
    await b.page.locator('[data-view="table"]').click();
    await page.locator('[data-select-project="p1"]').click();
    await page.locator('[data-task="p1-t3"][data-project-id="p1"]').check();
    await page.locator('#route-capture-body').fill('路线图上的同步笔记');
    await editProject(b.page, '另一台设备更新的项目'); await sync(b.page);
    await page.locator('[data-view="board"]').click();
    // Pending remote data must not replace the workspace while this view hides a draft.
    await openSync(page); await dialog(page).getByRole('button', { name: '立即同步', exact: true }).click(); await closeSync(page);
    expect((await stored(page)).projects[0].title).toBe('个人知识库 2.0');
    await page.locator('[data-view="route"]').click();
    await expect(page.locator('#route-capture-body')).toHaveValue('路线图上的同步笔记');
    await page.getByRole('button', { name: '保存记录', exact: true }).click();
    await sync(page); await sync(b.page);
    const aData = await stored(page), bData = await stored(b.page);
    expect(aData.projects.find(p => p.id === 'p1').title).toBe('另一台设备更新的项目');
    expect(bData.projects.find(p => p.id === 'p1').tasks.find(t => t.id === 'p1-t3').done).toBe(true);
    expect(bData.notes.find(n => n.title === '路线图上的同步笔记').projectIds).toEqual(['p1']);
    await expect(b.page.locator('[data-view="table"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-view="route"]')).toHaveAttribute('aria-pressed', 'true');
    const byId = items => [...items].sort((a, b) => a.id.localeCompare(b.id));
    expect({ ...aData, notes: byId(aData.notes), projects: byId(aData.projects) }).toEqual({ ...bData, notes: byId(bData.notes), projects: byId(bData.projects) });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.context().setOffline(true); await page.reload();
    await expect(page.locator('.view-route')).toBeVisible();
    const css = await page.evaluate(() => getComputedStyle(document.querySelector('.workspace-route')).getPropertyValue('--accent').trim());
    expect(css).toBe('#39796a');
    expect((await stored(page)).notes.find(n => n.title === '路线图上的同步笔记')).toBeTruthy();
  } finally { await page.context().setOffline(false); await b.context.close(); }
});

import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { seedData } from '../../public/data.js';

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
  return page.evaluate(async key => (await import('/workspace-storage.js')).hydrateWorkspace(JSON.parse(localStorage.getItem(key))), space === 'main' ? 'shixu.workspace.v1' : 'shixu-layout-lab-v1');
}
async function secondDevice(browser, username) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4183', locale: 'zh-CN' });
  const page = await context.newPage(); await page.goto('/');
  await account(page, username);
  return { context, page };
}

test('image references hydrate on another device and deleted notes can be restored and synced again', async ({ page, browser }) => {
  const username = name(); await page.goto('/'); await account(page, username, true, 'merge');
  const other = await secondDevice(browser, username);
  try {
    await page.goto('/#knowledge/note/n1');
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 4;
      canvas.getContext('2d').fillRect(0, 0, 4, 4); return canvas.toDataURL().split(',')[1];
    });
    await page.locator('#note-image-upload').setInputFiles({ name: '同步图片.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.locator('.cm-note-image img')).toHaveCount(1);
    const image = (await stored(page)).notes.find(n => n.id === 'n1').attachments[0].data;
    await sync(page); await sync(other.page);
    await other.page.goto('/#knowledge/note/n1');
    await expect(other.page.locator('.cm-note-image img')).toHaveCount(1);
    expect((await stored(other.page)).notes.find(n => n.id === 'n1').attachments[0].data).toBe(image);
    expect(await other.page.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')).notes.find(n => n.id === 'n1').attachments[0].data)).toBeUndefined();
    await page.getByRole('button', { name: '删除笔记', exact: true }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect.poll(async () => (await stored(page)).notes.some(n => n.id === 'n1')).toBe(false);
    await sync(page); await sync(other.page);
    expect((await stored(other.page)).notes.some(n => n.id === 'n1')).toBe(false);
    await page.getByRole('button', { name: '查看本机保存与备份状态', exact: true }).click();
    await page.getByRole('button', { name: /本机回收站/ }).click();
    await page.getByRole('button', { name: '恢复：让知识真正流动起来', exact: true }).click();
    await expect.poll(async () => (await stored(page)).notes.some(n => n.id === 'n1')).toBe(true);
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await sync(page); await sync(other.page);
    expect((await stored(other.page)).notes.find(n => n.id === 'n1').attachments[0].data).toBe(image);
    await other.page.reload(); await expect(other.page.locator('.cm-note-image img')).toHaveCount(1);
    // Logging out from the lab must hydrate the main workspace before comparing
    // it with the full sync baseline; local image references are not edits.
    await other.page.goto('/layouts.html'); await openSync(other.page);
    await other.page.getByRole('button', { name: '退出账号', exact: true }).click();
    await expect(dialog(other.page).getByRole('button', { name: '登录账号', exact: true })).toBeVisible();
  } finally { await other.context.close(); }
});

test('manual project and category order and note moves sync across devices and survive reload', async ({ page, browser }) => {
  const username = name(); await page.goto('/'); await account(page, username, true, 'merge');
  const other = await secondDevice(browser, username);
  try {
    const original = await stored(page);
    const projectHandles = page.locator('.home-record-handle'), secondId = await projectHandles.nth(1).getAttribute('data-order-id');
    await projectHandles.nth(1).focus(); await page.keyboard.press('Alt+ArrowUp');
    const categories = page.locator('#nav-children-projects [data-record-drag="category"]');
    await categories.last().focus(); await page.keyboard.press('Alt+ArrowUp');
    const order = await categories.evaluateAll(nodes => nodes.map(node => node.dataset.orderId));
    await page.goto('/#knowledge');
    const expand = page.locator('[data-nav-expand="knowledge"]'); if (await expand.getAttribute('aria-expanded') !== 'true') await expand.click();
    await page.locator('[data-sidebar-note="n1"]').focus(); await page.keyboard.press('Alt+ArrowRight');
    const local = await stored(page), note = local.notes.find(n => n.id === 'n1');
    expect(note.category).not.toBe(original.notes.find(n => n.id === 'n1').category);
    await sync(page); await sync(other.page);
    await expect(other.page.locator('[data-home-project]').first()).toHaveAttribute('data-home-project', secondId);
    expect(await other.page.locator('#nav-children-projects [data-record-drag="category"]').evaluateAll(nodes => nodes.map(node => node.dataset.orderId))).toEqual(order);
    const remote = await stored(other.page);
    expect(remote.notes.find(n => n.id === 'n1')).toEqual(note);
    expect(remote.projects.map(p => [p.id, p.order, p.tasks])).toEqual(local.projects.map(p => [p.id, p.order, p.tasks]));
    await other.page.reload(); await expect(other.page.locator('[data-home-project]').first()).toHaveAttribute('data-home-project', secondId);
    expect(remote.notes.map(n => [n.body, n.projectIds])).toEqual(original.notes.map(n => [n.body, n.projectIds]));
  } finally { await other.context.close(); }
});

test('project and task archives and restores sync to a second device without deleting records', async ({ page, browser }) => {
  const username = name(); await page.goto('/'); await account(page, username, true, 'merge');
  const before = await stored(page), project = before.projects[0], task = project.tasks[0];
  const other = await secondDevice(browser, username);
  try {
    await page.goto('/#projects/project/p1');
    await page.locator('.project-detail').getByRole('button', { name: `编辑任务：${task.title}`, exact: true }).click();
    await page.getByRole('button', { name: '归档事项', exact: true }).click();
    await page.getByRole('button', { name: '归档项目', exact: true }).click();
    await sync(page); await sync(other.page);
    const remote = await stored(other.page);
    expect(remote.projects[0].archived).toBe(true);
    expect(remote.projects[0].tasks[0].archived).toBe(true);
    expect(remote.notes).toEqual(before.notes);
    await expect(other.page.locator('[data-sidebar-project="p1"]')).toHaveCount(0);
    await other.page.getByRole('button', { name: '已归档项目 1', exact: true }).click();
    await other.page.getByRole('button', { name: `恢复项目：${project.title}`, exact: true }).click();
    await other.page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await other.page.goto('/#projects/project/p1');
    await other.page.getByRole('button', { name: '已归档事项 1', exact: true }).click();
    await other.page.getByRole('button', { name: `恢复事项：${task.title}`, exact: true }).click();
    await other.page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await other.page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
    await sync(other.page); await sync(page);
    const restored = await stored(page);
    expect(restored.projects[0].archived).toBe(false);
    expect(restored.projects[0].tasks[0]).toEqual({ ...task, archived: false });
    expect(restored.projects).toHaveLength(before.projects.length);
    expect(restored.notes).toEqual(before.notes);
  } finally { await other.context.close(); }
});

test('deleted default categories and modules stay deleted on a second device without losing contents', async ({ page, browser }) => {
  const data = seedData(); data.notes[0].category = '';
  data.projects[0].modules = [{ id: 'ui', name: '界面' }];
  await page.addInitScript(data => { if (!localStorage.getItem('shixu.workspace.v1')) localStorage.setItem('shixu.workspace.v1', JSON.stringify(data)); }, data);
  const username = name(); await page.goto('/'); await account(page, username, true, 'merge');
  const other = await secondDevice(browser, username);
  try {
    await page.goto('/#knowledge');
    const expand = page.locator('[data-nav-expand="knowledge"]');
    if (await expand.getAttribute('aria-expanded') !== 'true') await expand.click();
    const edit = page.getByRole('button', { name: '编辑未分类分类', exact: true });
    await edit.locator('..').hover(); await edit.click();
    await page.getByRole('button', { name: '删除分类', exact: true }).click();
    await page.getByRole('dialog', { name: '删除这个分类？', exact: true }).getByRole('button', { name: '删除分类', exact: true }).click();
    await page.goto('/#projects/project/p1');
    await page.locator('.project-detail').getByRole('button', { name: '重命名模块：默认模块', exact: true }).click();
    await page.getByRole('button', { name: '删除模块，事项移至首个模块', exact: true }).click();
    await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
    await sync(page); await sync(other.page);
    const remote = await stored(other.page);
    expect(remote.notes).toEqual(data.notes);
    expect(remote.folders).toContainEqual(expect.objectContaining({ section: 'knowledge', uncategorizedHidden: true }));
    expect(remote.projects[0].tasks).toEqual(data.projects[0].tasks.map(task => ({ ...task, moduleId: 'ui' })));
    await other.page.goto('/#knowledge'); await other.page.reload();
    await expect(other.page.locator('#nav-children-knowledge [data-note-fold=""]')).toHaveCount(0);
    await expect(other.page.locator('#nav-children-knowledge [data-sidebar-note="n1"]')).toHaveCount(1);
    await other.page.goto('/#projects/project/p1');
    await expect(other.page.locator('.project-detail [data-task-zone]')).toHaveCount(1);
  } finally { await other.context.close(); }
});

test('note image attachments sync to a second device and render without local files', async ({ page, browser }) => {
  const username = name(); await page.goto('/'); await account(page, username, true, 'merge');
  await page.goto('/#knowledge/note/n1');
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60; canvas.getContext('2d').fillRect(0, 0, 80, 60); return canvas.toDataURL('image/png').split(',')[1]; });
  await page.locator('#note-image-upload').setInputFiles({ name: '同步图片.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('.cm-note-image img')).toHaveCount(1);
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click(); await sync(page);
  const other = await secondDevice(browser, username);
  try {
    await other.page.goto('/#knowledge/note/n1');
    await expect(other.page.locator('.cm-note-image img')).toHaveCount(1);
    await expect.poll(() => other.page.locator('.cm-note-image img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    expect((await stored(other.page)).notes.find(note => note.id === 'n1').attachments).toHaveLength(1);
  } finally { await other.context.close(); }
});

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
    await page.getByRole('textbox', { name: '笔记正文' }).fill('电脑端独立新增的笔记内容');
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
    await b.page.goto('/?layout=table');
    await page.locator('[data-select-project="p1"]').click();
    await page.locator('[data-task="p1-t3"][data-project-id="p1"]').check();
    await page.locator('#route-capture-body').fill('路线图上的同步笔记');
    await editProject(b.page, '另一台设备更新的项目'); await sync(b.page);
    await page.goto('/#knowledge');
    // Pending remote data must not replace the workspace while this view hides a draft.
    await openSync(page); await dialog(page).getByRole('button', { name: '立即同步', exact: true }).click(); await closeSync(page);
    expect((await stored(page)).projects[0].title).toBe('个人知识库 2.0');
    await page.goto('/#projects');
    await expect(page.locator('#route-capture-body')).toHaveValue('路线图上的同步笔记');
    await page.getByRole('button', { name: '保存记录', exact: true }).click();
    await sync(page); await sync(b.page);
    const aData = await stored(page), bData = await stored(b.page);
    expect(aData.projects.find(p => p.id === 'p1').title).toBe('另一台设备更新的项目');
    expect(bData.projects.find(p => p.id === 'p1').tasks.find(t => t.id === 'p1-t3').done).toBe(true);
    expect(bData.notes.find(n => n.title === '路线图上的同步笔记').projectIds).toEqual(['p1']);
    await expect(b.page.locator('.project-table')).toBeVisible();
    await expect(page.locator('.workspace-route')).toBeVisible();
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

import { _android, chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const origin = 'https://8.147.235.91', pkg = 'app.shixu.workspace.debug';
const username = `qa-${randomUUID()}`, password = randomBytes(24).toString('base64url');
const result = { username, userId: null, passed: false, checks: [] };
const out = resolve('.tools/android-smoke'); await mkdir(out, { recursive: true });
let device, browser, page;
const dialog = p => p.locator('#sync-dialog');
async function openSync(p) { if (!await dialog(p).isVisible()) await p.getByRole('button', { name: '账号与多端同步', exact: true }).first().click(); }
async function closeSync(p) { await p.getByRole('button', { name: '关闭账号与多端同步', exact: true }).click(); }
async function sync(p) {
  await openSync(p); const button = p.getByRole('button', { name: '立即同步', exact: true });
  await expect(button).toBeEnabled(); await button.click(); await expect(button).toBeEnabled();
  await expect(dialog(p).locator('[data-sync-status]')).toHaveText('已同步'); await closeSync(p);
}
const current = p => p.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')));
async function waitForeground(packageName) {
  await expect.poll(async () => {
    const windows = (await device.shell('dumpsys window')).toString();
    return windows.split('\n').some(line => line.includes('mCurrentFocus=') && line.includes(packageName + '/'));
  }, {timeout: 30000}).toBe(true);
}
async function screenshot(name) { await writeFile(resolve(out, name), await device.screenshot()); }
async function editTitle(p, title) {
  await p.goto(origin + '/#projects/project/p1');
  await p.getByRole('textbox', { name: '项目标题', exact: true }).fill(title);
  await p.getByRole('button', { name: '关闭项目详情', exact: true }).click();
}
async function attach() {
  const view = await device.webView({ pkg }); const p = await view.page();
  p.setDefaultTimeout(20000); await expect(p.getByRole('heading', { name: '我的项目', exact: true })).toBeVisible();
  return p;
}
try {
  const devices = await _android.devices();
  device = devices.find(d => d.serial() === (process.env.SHIXU_ANDROID_SERIAL || '127.0.0.1:5559'));
  assert(device, 'The isolated QA emulator is not available.'); device.setDefaultTimeout(60000);
  await device.shell('am force-stop com.google.android.documentsui');
  await device.shell('am force-stop ' + pkg);
  await expect.poll(() => device.webViews().filter(view => view.pkg() === pkg).length).toBe(0);
  await device.shell('pm clear ' + pkg);
  await device.shell('am start -W -n ' + pkg + '/app.shixu.workspace.MainActivity');
  page = await attach(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await screenshot('android-home.png');
  assert.equal(await page.evaluate(() => typeof window.__shixuExport), 'function');
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  result.checks.push('android-webview-trusted-https-and-service-worker');
  await openSync(page);
  await page.getByRole('button', { name: '注册账号', exact: true }).click();
  await page.getByLabel('账号', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('注册邀请码', { exact: true }).fill(process.env.SHIXU_REGISTRATION_CODE || '');
  const registered = page.waitForResponse(r => r.url().endsWith('/api/register') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  const auth = await registered; assert(auth.ok()); result.userId = (await auth.json()).user.id;
  await dialog(page).getByRole('button', { name: /同步本机工作区/ }).click();
  await expect(dialog(page).locator('[data-sync-status]')).toHaveText('已同步'); await closeSync(page);
  await editTitle(page, 'Android 手机同步验证'); await sync(page);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext(); const pc = await context.newPage();
  await pc.goto(origin); await openSync(pc);
  await pc.getByLabel('账号', { exact: true }).fill(username); await pc.getByLabel('密码', { exact: true }).fill(password);
  await pc.getByRole('button', { name: '登录账号', exact: true }).click();
  await dialog(pc).getByRole('button', { name: /打开账号工作区/ }).click();
  await expect(dialog(pc).locator('[data-sync-status]')).toHaveText('已同步'); await closeSync(pc);
  assert.equal((await current(pc)).projects[0].title, 'Android 手机同步验证');
  result.checks.push('android-to-independent-desktop-sync');

  result.stage = 'native-json-export';
  const existingFiles = new Set((await device.shell('find /sdcard/Download -maxdepth 1 -type f')).toString().split('\n').map(line => line.trim()));
  await page.getByRole('button', { name: '查看本机保存与备份状态' }).click();
  await page.getByRole('button', { name: /导出完整数据/ }).click();
  await device.wait({ res: 'android:id/button1' });
  await screenshot('android-save-dialog.png');
  await device.tap({ res: 'android:id/button1' });
  let exportedPath;
  await expect.poll(async () => {
    const files = (await device.shell('find /sdcard/Download -maxdepth 1 -type f')).toString().split('\n').map(line => line.trim());
    exportedPath = files.find(file => !existingFiles.has(file) && /^\/sdcard\/Download\/拾序备份-\d{8}-\d{6}\.json$/.test(file));
    return Boolean(exportedPath);
  }).toBe(true);
  // Playwright's experimental ADB transport truncates multibyte shell commands.
  // The validated numeric suffix lets this command stay ASCII throughout.
  const suffix = exportedPath.match(/(\d{8}-\d{6}\.json)$/)[1];
  let backup;
  await expect.poll(async () => {
    try { backup = JSON.parse((await device.shell('cat /sdcard/Download/*-' + suffix)).toString()); return true; }
    catch { return false; }
  }).toBe(true);
  assert.equal(backup.projects[0].title, 'Android 手机同步验证');
  result.checks.push('native-document-picker-json-export');

  result.stage = 'native-json-import';
  await waitForeground(pkg);
  await page.getByRole('button', { name: /导入为独立副本/ }).click();
  await waitForeground('com.google.android.documentsui');
  const exportedName = new RegExp('.*-' + suffix.replace('.', '[.]'));
  await device.wait({ text: exportedName });
  await device.tap({ text: exportedName });
  await waitForeground(pkg);
  await expect(page.getByRole('dialog', { name: '导入为独立副本', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导入副本', exact: true }).click();
  await expect.poll(async () => (await current(page)).projects.length).toBe(16);
  result.checks.push('native-document-picker-json-import');

  result.stage = 'offline-and-restart';
  await page.context().setOffline(true); await page.reload();
  await expect(page.getByRole('heading', { name: '我的项目', exact: true })).toBeVisible();
  await editTitle(page, 'Android 离线记录验证'); await page.reload();
  assert.equal((await current(page)).projects[0].title, 'Android 离线记录验证');
  await page.context().setOffline(false); await sync(page); await sync(pc);
  await expect.poll(async () => (await current(pc)).projects[0].title).toBe('Android 离线记录验证');
  result.checks.push('offline-reload-edit-and-reconnect');
  await openSync(page); await device.shell('input keyevent KEYCODE_BACK'); await expect(dialog(page)).not.toBeVisible();
  result.checks.push('system-back-closes-dialog');
  await device.shell('am force-stop ' + pkg);
  await expect.poll(() => device.webViews().filter(view => view.pkg() === pkg).length).toBe(0);
  await device.shell('am start -W -n ' + pkg + '/app.shixu.workspace.MainActivity');
  page = await attach(); await openSync(page);
  await expect(dialog(page)).toContainText(username);
  await expect(dialog(page).locator('[data-sync-status]')).toHaveText('已同步');
  await closeSync(page); assert.equal((await current(page)).projects[0].title, 'Android 离线记录验证');
  result.checks.push('restart-retains-login-and-records');
  await page.goto(origin + '/layouts.html?layout=focus&present=1'); await expect(page.locator('#layout-main')).toBeVisible();
  await page.screenshot({ path: resolve(out, 'layout-webview.png') });
  await screenshot('android-layout.png');
  result.checks.push('layout-laboratory-and-safe-area');
  assert.deepEqual(errors, []); result.passed = true; delete result.stage;
} catch (error) {
  result.error = error.message.split('\n')[0].replaceAll(password, '[redacted]').replaceAll(process.env.SHIXU_REGISTRATION_CODE || '__NO_SECRET__', '[redacted]');
  result.errorLocation = error.stack?.split('\n').find(line => line.includes('verify-android.mjs'))?.trim();
  if (device && !['authentication'].includes(result.stage)) await screenshot('failure.png').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {}); await device?.close().catch(() => {});
  await writeFile(resolve(out, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
process.exit(result.passed ? 0 : 1);

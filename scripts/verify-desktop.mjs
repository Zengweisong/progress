import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve('.tools/desktop-smoke', randomUUID());
await mkdir(root, { recursive: true });
const username = `qa-${randomUUID()}`, password = randomBytes(24).toString('base64url');
const result = { username, userId: null, passed: false, checks: [] };
let app, desktop, browser;
const dialog = page => page.locator('#sync-dialog');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start() {
  app = spawn(resolve(process.env.SHIXU_DESKTOP_EXE || 'src-tauri/target/release/shixu.exe'), [], {
    windowsHide: true, stdio: 'ignore',
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9224 --remote-debugging-address=127.0.0.1 --enable-automation', WEBVIEW2_USER_DATA_FOLDER: resolve(root, 'profile') },
  });
  for (let i = 0; i < 50; i++) {
    try {
      const version = await fetch('http://127.0.0.1:9224/json/version');
      if (version.ok) break;
    } catch { /* Wait for the owned WebView process. */ }
    await pause(200);
  }
  desktop = await chromium.connectOverCDP('http://127.0.0.1:9224');
  const context = desktop.contexts()[0];
  const page = context.pages()[0] || await context.waitForEvent('page');
  page.setDefaultTimeout(20000);
  await expect(page.getByRole('heading', { name: '我的项目', exact: true })).toBeVisible();
  return page;
}
async function stop() {
  if (desktop) {
    const connection = await desktop.newBrowserCDPSession();
    await connection.send('Browser.close').catch(() => {});
    await desktop.close().catch(() => {});
    desktop = null;
  }
  if (app && app.exitCode === null) { app.kill(); await pause(600); }
}
async function openSync(page) {
  if (!await dialog(page).isVisible()) await page.getByRole('button', { name: '账号与多端同步', exact: true }).first().click();
}
async function closeSync(page) { await page.getByRole('button', { name: '关闭账号与多端同步', exact: true }).click(); }
async function sync(page) {
  await openSync(page);
  const button = page.getByRole('button', { name: '立即同步', exact: true });
  await expect(button).toBeEnabled(); await button.click();
  await expect(button).toBeEnabled();
  await expect(dialog(page).locator('[data-sync-status]')).toHaveText('已同步');
  await closeSync(page);
}
async function editTitle(page, title) {
  await page.goto('https://8.147.235.91/#projects/project/p1');
  await page.getByRole('textbox', { name: '项目标题', exact: true }).fill(title);
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
}
try {
  let page = await start();
  const runtimeErrors = []; page.on('pageerror', e => runtimeErrors.push(e.message));
  result.checks.push('release-executable-and-trusted-https');
  await page.screenshot({ path: resolve(root, 'desktop.png') });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await openSync(page);
  await expect(page.getByRole('button', { name: '注册账号', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '注册账号', exact: true }).click();
  await page.getByLabel('账号', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('注册邀请码', { exact: true }).fill(process.env.SHIXU_REGISTRATION_CODE || '');
  const auth = page.waitForResponse(response => response.url().endsWith('/api/register') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  const response = await auth; assert(response.ok()); result.userId = (await response.json()).user.id;
  await dialog(page).getByRole('button', { name: /同步本机工作区/ }).click();
  await expect(dialog(page).locator('[data-sync-status]')).toHaveText('已同步'); await closeSync(page);
  await editTitle(page, '桌面客户端同步验证'); await sync(page);

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const device = await browser.newContext(), phone = await device.newPage();
  await phone.goto('https://8.147.235.91/'); await openSync(phone);
  await phone.getByLabel('账号', { exact: true }).fill(username);
  await phone.getByLabel('密码', { exact: true }).fill(password);
  await phone.getByRole('button', { name: '登录账号', exact: true }).click();
  await dialog(phone).getByRole('button', { name: /打开账号工作区/ }).click();
  await expect(dialog(phone).locator('[data-sync-status]')).toHaveText('已同步'); await closeSync(phone);
  const title = p => p.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')).projects.find(p => p.id === 'p1').title);
  assert.equal(await title(phone), '桌面客户端同步验证'); result.checks.push('desktop-to-independent-browser-sync');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: resolve(root, 'downloads') });
  await page.getByRole('button', { name: '查看本机保存与备份状态' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出完整数据/ }).click();
  const download = await downloaded;
  const exportPath = resolve(root, 'downloads', download.suggestedFilename());
  await expect.poll(async () => { try { return JSON.parse(await readFile(exportPath, 'utf8')).projects.length; } catch { return 0; } }).toBeGreaterThan(0);
  result.checks.push('json-backup-download');
  await page.keyboard.press('Escape');

  await page.context().setOffline(true); await page.reload();
  await expect(page.getByRole('heading', { name: '我的项目', exact: true })).toBeVisible();
  await editTitle(page, '桌面离线记录验证'); await page.reload();
  assert.equal(await title(page), '桌面离线记录验证');
  await page.context().setOffline(false); await sync(page); await sync(phone);
  await expect.poll(() => title(phone)).toBe('桌面离线记录验证'); result.checks.push('offline-reload-edit-and-reconnect');
  await page.goto('https://8.147.235.91/layouts.html?layout=focus&present=1');
  await expect(page.locator('#layout-main')).toBeVisible();
  result.checks.push('layout-laboratory');
  await page.goto('https://8.147.235.91/'); await sync(page);
  await stop(); page = await start(); await openSync(page);
  await expect(dialog(page)).toContainText(username);
  await expect(dialog(page).locator('[data-sync-status]')).toHaveText('已同步');
  await closeSync(page); assert.equal(await title(page), '桌面离线记录验证');
  result.checks.push('restart-retains-login-and-records');
  assert.deepEqual(runtimeErrors, []); result.passed = true;
} catch (error) {
  result.error = error.message.split('\n')[0].replaceAll(password, '[redacted]').replaceAll(process.env.SHIXU_REGISTRATION_CODE || '__NO_SECRET__', '[redacted]');
  result.errorLocation = error.stack?.split('\n').find(line => line.includes('verify-desktop.mjs'))?.trim();
  if (typeof error.actual === 'string') result.actual = error.actual.slice(0, 120);
  if (typeof error.expected === 'string') result.expected = error.expected.slice(0, 120);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {}); await stop();
  await writeFile(resolve(root, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}

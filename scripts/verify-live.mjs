import { chromium, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

// Run manually after deployment. Credentials live only in this process and the
// two temporary browser contexts; no trace, screenshot, or credential file is saved.
// The account remains for the operator to inspect and remove by its reported ID.
const origin = process.env.SHIXU_ORIGIN || 'https://8.147.235.91';
const registrationCode = process.env.SHIXU_REGISTRATION_CODE || '';
const username = `qa-${randomUUID()}`;
const password = randomBytes(32).toString('base64url');
const result = { username, userId: null, pass: false };
const timeout = 30000;
const dialog = page => page.locator('#sync-dialog');
let browser;

async function openSync(page) {
  if (!await dialog(page).isVisible()) await page.getByRole('button', { name: '账号与多端同步', exact: true }).first().click();
}

async function closeSync(page) {
  await page.getByRole('button', { name: '关闭账号与多端同步', exact: true }).click();
}

async function readLocal(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')));
}

async function joinWorkspace(page, register) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await openSync(page);
  if (register) {
    const registerTab = page.getByRole('button', { name: '注册账号', exact: true });
    await expect(registerTab).toBeEnabled({ timeout });
    await registerTab.click();
  }
  await page.getByLabel('账号', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  if (register && await page.getByLabel('注册邀请码', { exact: true }).count()) {
    assert(registrationCode, 'An invitation is required.');
    await page.getByLabel('注册邀请码', { exact: true }).fill(registrationCode);
  }
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === `/api/${register ? 'register' : 'login'}` && response.request().method() === 'POST'),
    page.getByRole('button', { name: register ? '创建账号' : '登录账号', exact: true }).click(),
  ]);
  assert(response.ok(), 'Authentication failed.');
  const { user } = await response.json();
  assert(user?.id && user.username === username, 'Unexpected account identity.');
  if (register) result.userId = user.id;
  else assert.equal(user.id, result.userId);
  const choice = dialog(page).getByRole('button', { name: register ? /同步本机工作区/ : /打开账号工作区/ });
  await expect(choice).toBeEnabled({ timeout });
  await choice.click();
  await expect(dialog(page).locator('[data-sync-status]')).toHaveText('已同步', { timeout });
  await closeSync(page);
}

async function sync(page) {
  await openSync(page);
  const button = dialog(page).getByRole('button', { name: '立即同步', exact: true });
  await expect(button).toBeEnabled({ timeout });
  await button.click();
  await expect(dialog(page).locator('[data-sync-status]')).toHaveText('已同步', { timeout });
  await closeSync(page);
}

try {
  const parsed = new URL(origin);
  assert(parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash, 'Use an HTTPS origin.');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const contextOptions = { baseURL: parsed.origin, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 1000 } };
  // Default TLS verification remains enabled: this also tests the public certificate.
  const [deviceA, deviceB] = await Promise.all([browser.newContext(contextOptions), browser.newContext(contextOptions)]);
  deviceA.setDefaultTimeout(timeout); deviceB.setDefaultTimeout(timeout);
  deviceA.setDefaultNavigationTimeout(timeout); deviceB.setDefaultNavigationTimeout(timeout);
  const [pageA, pageB] = await Promise.all([deviceA.newPage(), deviceB.newPage()]);
  const browserErrors = [];
  pageA.on('pageerror', () => browserErrors.push('A'));
  pageB.on('pageerror', () => browserErrors.push('B'));

  await joinWorkspace(pageA, true);
  const initial = await readLocal(pageA);
  assert(initial?.projects?.some(project => project.id === 'p1'), 'The sample workspace was not uploaded.');
  await joinWorkspace(pageB, false);
  assert.deepEqual(await readLocal(pageB), initial);

  const title = `生产双设备同步验证 ${username}`;
  await pageA.goto('/#projects/project/p1');
  await pageA.getByRole('textbox', { name: '项目标题', exact: true }).fill(title);
  await pageA.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await sync(pageA);
  await sync(pageB);
  await expect.poll(async () => (await readLocal(pageB))?.projects?.find(project => project.id === 'p1')?.title, { timeout }).toBe(title);

  const response = await deviceB.request.get('/api/workspace?space=main');
  assert(response.ok(), 'Cloud read failed.');
  const cloud = await response.json();
  assert.equal(cloud.userId, result.userId);
  assert(cloud.revision >= 2, 'The edit was not persisted.');
  assert.equal(cloud.data.projects.find(project => project.id === 'p1')?.title, title);
  assert.deepEqual(await readLocal(pageA), cloud.data);
  assert.deepEqual(await readLocal(pageB), cloud.data);
  assert.equal(browserErrors.length, 0, 'A browser runtime error occurred.');
  result.pass = true;
} catch {
  // Playwright errors can include form values. Do not log them or write artifacts.
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => { result.pass = false; process.exitCode = 1; });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

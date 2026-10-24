import { test, expect } from '@playwright/test';

const key = 'shixu.appearance.v1';
const workspace = page => page.evaluate(() => localStorage.getItem('shixu.workspace.v1'));
const theme = page => page.locator('html');
const toggle = page => page.locator('[data-theme-toggle]');
test.use({ colorScheme: 'light' });

test('theme switches without losing drafts, persists on reload and leaves workspace data intact', async ({ page }, info) => {
  await page.goto('/');
  const original = await workspace(page);
  await page.locator('#route-capture-body').fill('切换主题也保留这段记录');
  await toggle(page).click();
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await expect(toggle(page)).toHaveAttribute('aria-label', '切换到浅色模式');
  await expect(page.locator('#route-capture-body')).toHaveValue('切换主题也保留这段记录');
  expect(await workspace(page)).toBe(original);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `.tools/theme-${info.project.name}-route.png`, fullPage: true, animations: 'disabled' });
  await page.goto('/#knowledge');
  await page.getByRole('button', { name: '新建页面', exact: true }).click();
  await page.getByRole('textbox', { name: '笔记标题', exact: true }).fill('主题切换时保留标题');
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('主题切换时保留正文');
  const savedBeforeThemeSwitch = await workspace(page);
  await toggle(page).click(); await toggle(page).click();
  await expect(page.getByRole('textbox', { name: '笔记标题', exact: true })).toHaveValue('主题切换时保留标题');
  await expect(page.getByRole('textbox', { name: '笔记正文', exact: true })).toHaveText('主题切换时保留正文');
  await page.screenshot({ path: `.tools/theme-${info.project.name}-create.png`, fullPage: true, animations: 'disabled' });
  await page.goto('/#knowledge/note/n1');
  await page.reload();
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await workspace(page)).toBe(savedBeforeThemeSwitch);
  await page.screenshot({ path: `.tools/theme-${info.project.name}-note.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '搜索全部', exact: true })).toBeVisible();
  await page.screenshot({ path: `.tools/theme-${info.project.name}-search.png`, fullPage: true, animations: 'disabled' });
});

test('system appearance updates until an explicit choice is saved', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await toggle(page).click();
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('dark');
});

test('sidebar shortcuts appear between personal space and workspace and both remain usable', async ({ page }) => {
  test.skip(page.viewportSize().width <= 700, 'The desktop sidebar is hidden on phones');
  await page.goto('/');
  const sidebar = page.getByRole('complementary', { name: '主导航', exact: true });
  const workspaceButton = await sidebar.locator('.workspace').boundingBox();
  const shortcuts = await sidebar.locator('.sidebar-shortcuts').boundingBox();
  const caption = await sidebar.locator(':scope > .nav-caption').boundingBox();
  expect(shortcuts.y).toBeGreaterThan(workspaceButton.y + workspaceButton.height);
  expect(shortcuts.y + shortcuts.height).toBeLessThanOrEqual(caption.y);
  await expect(sidebar.locator('[data-action="quick-note"]')).toHaveCount(1);
  await expect(sidebar.locator('[data-action="search"]')).toHaveCount(1);
  await sidebar.getByRole('button', { name: '搜索全部', exact: false }).click();
  await expect(page.getByRole('dialog', { name: '搜索全部', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭搜索', exact: true }).click();
  await sidebar.locator('[data-action="quick-note"]').click();
  await expect(page).toHaveURL(/#knowledge\/note\//);
});

test('theme switching remains usable when preference storage fails', async ({ page }) => {
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, key);
  await page.goto('/');
  await toggle(page).click();
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await page.goto('/#knowledge');
  await toggle(page).click();
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
});

test('cached theme assets keep dark appearance available offline', async ({ page, context }) => {
  await page.goto('/');
  await toggle(page).click();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(23, 29, 27)');
  await toggle(page).click();
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
});

test('project details, calendar and account dialogs use dark surfaces', async ({ page }, info) => {
  await page.goto('/'); await toggle(page).click();
  await page.goto('/#projects/project/p1');
  const detail = page.locator('.project-detail');
  await expect(detail).toBeVisible();
  expect(await detail.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(32, 42, 37)');
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByRole('button', { name: '截止日期（可选）', exact: true }).click();
  const calendar = page.locator('.calendar-popover');
  await expect(calendar).toBeVisible();
  expect(await calendar.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(32, 42, 37)');
  await page.screenshot({ path: `.tools/theme-${info.project.name}-calendar.png`, fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '账号与多端同步', exact: true }).click();
  const account = page.locator('#sync-dialog');
  await expect(account).toBeVisible();
  expect(await account.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(32, 42, 37)');
  expect(await account.locator('.sync-primary').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(121, 182, 154)');
  await page.screenshot({ path: `.tools/theme-${info.project.name}-account.png`, fullPage: true, animations: 'disabled' });
});

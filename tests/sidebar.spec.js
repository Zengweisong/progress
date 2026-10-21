import { test, expect } from '@playwright/test';

const preferenceKey = 'shixu.sidebar.layout.v1';
const workspaceKey = 'shixu.workspace.v1';
const sidebar = page => page.getByRole('complementary', { name: '主导航', exact: true });
const resizer = page => page.getByRole('separator', { name: '调整侧边栏宽度', exact: true });
const width = page => sidebar(page).evaluate(element => Math.round(element.getBoundingClientRect().width));
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), preferenceKey);
const workspace = page => page.evaluate(key => localStorage.getItem(key), workspaceKey);
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

async function drag(page, delta) {
  const box = await resizer(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, 100);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, 120, { steps: 8 });
}

test('sidebar drag follows the pointer, keeps drafts and persists through navigation and reload', async ({ page }) => {
  test.skip(page.viewportSize().width <= 700, 'Desktop sidebar is hidden on phones');
  await page.goto('/');
  const original = await workspace(page), initial = await width(page);
  await page.locator('#route-capture-body').fill('保留正在输入的草稿');
  await drag(page, 70);
  const expected = Math.min(initial + 70, page.viewportSize().width - 500, 400);
  expect(await width(page)).toBe(expected);
  await expect(page.locator('body')).toHaveClass(/is-sidebar-resizing/);
  await page.mouse.up();
  await expect(page.locator('body')).not.toHaveClass(/is-sidebar-resizing/);
  await expect(page.locator('#route-capture-body')).toHaveValue('保留正在输入的草稿');
  expect(await saved(page)).toEqual({ width: expected, collapsed: false });
  await page.locator('.nav-item[href="#knowledge"]').click();
  await expect(page).toHaveURL(/#knowledge$/);
  expect(await width(page)).toBe(expected);
  expect(await workspace(page)).toBe(original);
  await page.reload();
  expect(await width(page)).toBe(expected);
  expect(await noOverflow(page)).toBe(true);
});

test('collapse frees the content area, survives reload and restores the chosen width', async ({ page }) => {
  test.skip(page.viewportSize().width <= 700, 'Desktop sidebar is hidden on phones');
  await page.goto('/');
  const original = await workspace(page);
  await resizer(page).focus();
  await page.keyboard.press('ArrowRight');
  const chosen = await width(page);
  await page.locator('#route-capture-body').fill('收起也不丢失草稿');
  await page.getByRole('button', { name: '收起侧边栏', exact: true }).click();
  await expect(page.getByRole('button', { name: '展开侧边栏', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(resizer(page)).toHaveCount(0);
  expect(await page.locator('.sidebar').evaluate(element => element.inert)).toBe(true);
  expect((await page.locator('.main-wrap').boundingBox()).x).toBe(0);
  await expect(page.locator('#route-capture-body')).toHaveValue('收起也不丢失草稿');
  await page.reload();
  await expect(page.getByRole('button', { name: '展开侧边栏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '展开侧边栏', exact: true }).click();
  await expect(sidebar(page)).toBeVisible();
  expect(await width(page)).toBe(chosen);
  expect((await page.locator('.main-wrap').boundingBox()).x).toBe(chosen);
  expect(await workspace(page)).toBe(original);
});

test('drag and keyboard resizing obey bounds; Escape cancels the current drag', async ({ page }) => {
  test.skip(page.viewportSize().width <= 700, 'Desktop sidebar is hidden on phones');
  await page.goto('/');
  const maximum = Math.min(400, page.viewportSize().width - 500);
  await drag(page, -150);
  await page.mouse.up();
  expect(await width(page)).toBe(200);
  await drag(page, 300);
  await page.mouse.up();
  expect(await width(page)).toBe(maximum);
  await resizer(page).focus();
  await page.keyboard.press('Home');
  expect(await width(page)).toBe(200);
  await page.keyboard.press('Shift+ArrowRight');
  expect(await width(page)).toBe(240);
  await page.keyboard.press('ArrowLeft');
  expect(await width(page)).toBe(230);
  const previous = await saved(page);
  await drag(page, 40);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await width(page)).toBe(230);
  expect(await saved(page)).toEqual(previous);
  await expect(page.locator('body')).not.toHaveClass(/is-sidebar-resizing/);
  await page.keyboard.press('End');
  expect(await width(page)).toBe(maximum);
  await expect(resizer(page)).toHaveAttribute('aria-valuenow', String(maximum));
  expect(await noOverflow(page)).toBe(true);
});

test('desktop preferences preserve the phone navigation and adapt to smaller windows', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ width: 390, collapsed: false })), preferenceKey);
  await page.goto('/');
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await width(page)).toBe(390);
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await width(page)).toBe(268);
  expect(await noOverflow(page)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('[data-sidebar-toggle]')).toBeHidden();
  await expect(page.locator('[data-sidebar-resize]')).toBeHidden();
  await expect(page.getByRole('navigation', { name: '手机导航' })).toBeVisible();
  expect((await page.locator('.main-wrap').boundingBox()).x).toBe(0);
  expect(await noOverflow(page)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(sidebar(page)).toBeVisible();
  expect(await width(page)).toBe(390);
});

test('sidebar controls work when preference storage is unavailable', async ({ page }) => {
  test.skip(page.viewportSize().width <= 700, 'Desktop sidebar is hidden on phones');
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, preferenceKey);
  await page.goto('/');
  await resizer(page).focus();
  await page.keyboard.press('Home');
  expect(await width(page)).toBe(200);
  await page.getByRole('button', { name: '收起侧边栏', exact: true }).click();
  await page.getByRole('button', { name: '展开侧边栏', exact: true }).click();
  expect(await width(page)).toBe(200);
  await expect(page.locator('.storage-warning')).toHaveCount(0);
});

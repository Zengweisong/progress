import { test, expect } from '@playwright/test';

const menu = page => page.getByRole('menu', { name: '新建内容', exact: true });
const rootButton = (page, mobile, section = 'knowledge') => page.locator(`${mobile ? '.mobile-categories' : '.sidebar .nav-group-heading'} [data-create-menu="${section}"]`);

test('hovering new opens page and template choices, creates in the chosen section and dismisses on leave', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'Touch opens the menu by tapping');
  await page.goto('/#projects');
  const button = rootButton(page, false);
  await button.hover();
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('menuitem')).toHaveCount(3);
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const sidebarBounds = await page.locator('.sidebar').boundingBox();
  const menuBounds = await menu(page).boundingBox();
  expect(menuBounds.x).toBeGreaterThanOrEqual(sidebarBounds.x + sidebarBounds.width);
  await expect(page).toHaveURL(/#projects$/);
  await page.screenshot({ path: `.tools/sidebar-create-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
  await menu(page).getByRole('menuitem', { name: '新建分类', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建二级分类', exact: true });
  await expect(dialog).toContainText('知识库');
  await expect(menu(page)).toBeHidden();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await button.hover();
  await page.mouse.move(page.viewportSize().width - 10, page.viewportSize().height - 100);
  await expect(menu(page)).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.hover();
  await menu(page).getByRole('menuitem', { name: '新建页面', exact: true }).click();
  await expect(page).toHaveURL(/#knowledge\/note\//);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')).notes[0])).toMatchObject({ title: '未命名页面', body: '' });
  await expect(page.getByRole('textbox', { name: '笔记正文', exact: true })).toBeVisible();
});

test('keyboard and touch can open the menu, Escape dismisses it and category creation remains available', async ({ page, isMobile }) => {
  await page.goto('/#knowledge');
  const button = rootButton(page, isMobile);
  if (isMobile) await button.tap();
  else { await button.focus(); await button.press('ArrowDown'); }
  await expect(menu(page)).toBeVisible();
  await page.getByRole('menuitem', { name: '新建分类', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: '新建页面', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await expect(button).toBeFocused();
  if (isMobile) await button.tap(); else await button.click();
  await page.getByRole('menuitem', { name: '新建分类', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新建二级分类', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('category menus keep their context for both notes and projects', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The mobile category page has its own direct create control');
  await page.goto('/#knowledge');
  await page.locator('.nav-category-create[data-create-menu="knowledge"][data-create-category="技术实践"]').hover();
  await menu(page).getByRole('menuitem', { name: '新建页面', exact: true }).click();
  await expect.poll(() => decodeURIComponent(page.url().split('#')[1])).toMatch(/^knowledge\/category\/技术实践\/note\//);
  await page.locator('#note-title').fill('菜单创建的笔记');
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('保留分类');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')).notes[0].category)).toBe('技术实践');
  await page.goto('/#projects');
  const expand = page.locator('[data-nav-expand="projects"]');
  if (await expand.getAttribute('aria-expanded') !== 'true') await expand.click();
  await page.locator('.nav-category-create[data-create-menu="projects"][data-create-category="生活"]').hover();
  await expect(menu(page).getByRole('menuitem')).toHaveCount(2);
  await menu(page).getByRole('menuitem', { name: '新建页面', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新建项目', exact: true }).getByLabel('分类（可选）', { exact: true })).toHaveValue('生活');
});

test('dark menus preserve the focused editor and close on navigation', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'No hover on phones');
  await page.goto('/#knowledge/new-note');
  await page.locator('[data-theme-toggle]').click();
  await page.locator('#note-title').fill('保留标题');
  const editor = page.getByRole('textbox', { name: '笔记正文', exact: true });
  await editor.fill('菜单不会清空草稿');
  await rootButton(page, false).hover();
  await expect(editor).toBeFocused();
  await expect(menu(page)).toBeVisible();
  expect(await menu(page).evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(32, 42, 37)');
  await page.screenshot({ path: `.tools/sidebar-create-${info.project.name}-dark.png`, fullPage: false, animations: 'disabled' });
  await page.mouse.move(page.viewportSize().width - 10, 50);
  await expect(menu(page)).toBeHidden();
  await expect(editor).toContainText('菜单不会清空草稿');
  await expect(page.locator('#note-title')).toHaveValue('保留标题');
});

import { test, expect } from '@playwright/test';
import { seedData } from '../public/data.js';

const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const note = async (page, id = 'n1') => (await read(page)).notes.find(note => note.id === id);
const star = page => page.locator('[data-action="toggle-note-favorite"]');
const editor = page => page.getByRole('textbox', { name: '笔记正文', exact: true });
test.use({ colorScheme: 'light' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, data }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
  }, { key, data: seedData() });
});

test('starring collects a single shared note and removing its star keeps it in knowledge', async ({ page }, info) => {
  await page.goto('/#knowledge/note/n1');
  const original = await note(page), count = (await read(page)).notes.length;
  await editor(page).evaluate(el => el.dataset.favoriteCheck = 'same-editor');
  await star(page).click();
  await expect(star(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(star(page)).toHaveAttribute('aria-label', '取消收藏');
  await expect(editor(page)).toHaveAttribute('data-favorite-check', 'same-editor');
  const saved = await note(page);
  expect(saved).toEqual({ ...original, favorite: true, updatedAt: saved.updatedAt });
  expect((await read(page)).notes).toHaveLength(count);
  await page.screenshot({ path: `.tools/favorites-${info.project.name}-note.png`, fullPage: true, animations: 'disabled' });
  await page.goto('/#inbox');
  await expect(page.getByRole('heading', { name: '收藏夹', exact: true })).toBeVisible();
  await expect(page.locator('.note-card')).toHaveCount(2);
  await page.getByRole('button', { name: `打开笔记：${original.title}`, exact: true }).click();
  await expect(page).toHaveURL(/#inbox\/note\/n1$/);
  await page.reload();
  await expect(star(page)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-theme-toggle]').click();
  await page.screenshot({ path: `.tools/favorites-${info.project.name}-dark.png`, fullPage: true, animations: 'disabled' });
  await star(page).click();
  await expect(star(page)).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(1);
  await expect(page.locator('.note-card[data-note="n1"]')).toHaveCount(0);
  await page.goto('/#knowledge');
  await expect(page.locator('.note-card[data-note="n1"]')).toHaveCount(1);
  expect((await read(page)).notes).toHaveLength(count);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('old inbox content remains accessible and can be removed from favorites', async ({ page }) => {
  await page.goto('/#inbox');
  await expect(page.locator('.note-card[data-note="n7"]')).toHaveCount(1);
  await page.locator('.note-card[data-note="n7"]').click();
  await expect(star(page)).toHaveAttribute('aria-pressed', 'true');
  const before = await note(page, 'n7');
  await star(page).click();
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
  await expect(page.getByRole('heading', { name: '还没有收藏的笔记' })).toBeVisible();
  await page.goto('/#knowledge');
  await expect(page.locator('.note-card[data-note="n7"]')).toHaveCount(1);
  expect(await note(page, 'n7')).toMatchObject({ body: before.body, inbox: true, favorite: false });
});

test('new drafts can be starred before creation while quick records begin unstarred', async ({ page }) => {
  await page.goto('/#knowledge/new-note');
  const before = (await read(page)).notes.length;
  await page.locator('#note-title').fill('创建时收藏的笔记');
  await editor(page).fill('收藏前写下的内容');
  await star(page).click();
  await expect(star(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#note-title')).toHaveValue('创建时收藏的笔记');
  await expect(editor(page)).toContainText('收藏前写下的内容');
  expect((await read(page)).notes).toHaveLength(before);
  await page.getByRole('button', { name: '创建笔记', exact: true }).click();
  const saved = (await read(page)).notes[0];
  expect(saved).toMatchObject({ favorite: true, inbox: false, title: '创建时收藏的笔记' });
  await page.goto('/#inbox');
  await expect(page.locator('.note-card').filter({ hasText: saved.title })).toHaveCount(1);
  await page.goto('/#projects');
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/#knowledge\/note\//);
  await expect(star(page)).toHaveAttribute('aria-pressed', 'false');
  expect((await read(page)).notes).toHaveLength(before + 2);
  expect((await read(page)).notes[0]).toMatchObject({ title: '未命名页面', body: '', favorite: false, inbox: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('a failed star save rolls back its state and leaves content intact', async ({ page }) => {
  await page.goto('/#knowledge/note/n1');
  const before = await read(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('No room', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, key);
  await star(page).click();
  await expect(page.locator('#toast')).toContainText('保存失败');
  await expect(star(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await read(page)).toEqual(before);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.getByRole('button', { name: '关闭搜索', exact: true }).click();
  await expect(star(page)).toHaveAttribute('aria-pressed', 'false');
});

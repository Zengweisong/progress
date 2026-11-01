import { test, expect } from '@playwright/test';
import { seedData } from '../public/data.js';
const key = 'shixu.workspace.v1';
const body = '首段\n\n中段\n\n尾段';
const source = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).notes.find(note => note.id === 'n1').body, key);
const handle = (page, number) => page.getByRole('button', { name: `第 ${number} 行：拖动或修改样式`, exact: true });
test.beforeEach(async ({ page }) => {
  const data = seedData(); data.notes[0].body = body;
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/#knowledge/note/n1'); await expect(handle(page, 1)).toHaveCount(1);
});

test('line menu converts only its line, preserves Markdown presentation and supports undo and reload', async ({ page }) => {
  await handle(page, 3).click();
  const menu = page.getByRole('menu', { name: '行样式和排序' });
  await menu.getByRole('menuitem', { name: '标题 2', exact: true }).click();
  await expect.poll(() => source(page)).toBe('首段\n\n## 中段\n\n尾段');
  await expect(page.locator('.cm-md-h2')).toHaveText('中段');
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).press('Control+z');
  await expect.poll(() => source(page)).toBe(body);
  await handle(page, 3).click(); await menu.getByRole('menuitem', { name: '待办事项', exact: true }).click();
  await expect.poll(() => source(page)).toBe('首段\n\n- [ ] 中段\n\n尾段');
  await handle(page, 3).click(); await menu.getByRole('menuitem', { name: '正文', exact: true }).click();
  await expect.poll(() => source(page)).toBe(body);
  await handle(page, 1).click(); await menu.getByRole('menuitem', { name: '引用', exact: true }).click();
  await page.reload(); await expect(page.locator('.cm-md-quote')).toHaveText('首段');
  expect(await source(page)).toBe('> 首段\n\n中段\n\n尾段');
});

test('pointer dragging reorders a line and escape cancels a drag without changing content', async ({ page }) => {
  const drag = async cancel => {
    const from = await handle(page, 5).boundingBox(), to = await handle(page, 1).boundingBox();
    await page.mouse.move(from.x + 12, from.y + 12); await page.mouse.down();
    await page.mouse.move(to.x + 12, to.y + 1, { steps: 12 });
    await expect(page.locator('.note-line-drop')).toBeVisible();
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  };
  await drag(true); expect(await source(page)).toBe(body);
  await drag(false); await expect.poll(() => source(page)).toBe('尾段\n首段\n\n中段\n');
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).press('Control+z');
  await expect.poll(() => source(page)).toBe(body);
});

test('keyboard movement keeps multiline code and tables together and menus stay inside the viewport', async ({ page }) => {
  const text = '首段\n```js\nconst value = 1;\n```\n尾段\n| A | B |\n| --- | --- |\n| 一 | 二 |';
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill(text);
  await expect(handle(page, 2)).toHaveCount(1); await expect(handle(page, 3)).toHaveCount(0);
  await handle(page, 2).press('Alt+ArrowUp');
  await expect.poll(() => source(page)).toBe('```js\nconst value = 1;\n```\n首段\n尾段\n| A | B |\n| --- | --- |\n| 一 | 二 |');
  await handle(page, 6).press('Alt+ArrowUp');
  await expect.poll(() => source(page)).toBe('```js\nconst value = 1;\n```\n首段\n| A | B |\n| --- | --- |\n| 一 | 二 |\n尾段');
  await handle(page, 4).click(); const menu = page.getByRole('menu', { name: '行样式和排序' });
  const box = await menu.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('touch opens the style menu and drags a line', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch surface');
  await handle(page, 3).tap();
  await page.getByRole('menuitem', { name: '标题 2', exact: true }).tap();
  await expect.poll(() => source(page)).toBe('首段\n\n## 中段\n\n尾段');
  const from = await handle(page, 5).boundingBox(), to = await handle(page, 1).boundingBox();
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x + 12, y: from.y + 12 }] });
  for (let step = 1; step <= 8; step++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + 12, y: from.y + 12 + (to.y - from.y - 12) * step / 8 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => source(page)).toBe('尾段\n首段\n\n## 中段\n');
});

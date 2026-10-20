import { test, expect } from '@playwright/test';
import { seedData, validateData } from '../public/data.js';

const key = 'shixu.workspace.v1';
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const trigger = page => page.getByRole('button', { name: '截止日期', exact: true });
const calendar = page => page.getByRole('dialog', { name: '选择截止日期', exact: true });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T04:00:00Z'));
  const data = seedData(); data.projects = [data.projects[0]]; data.notes = [];
  data.projects[0].due = '2026-10-28';
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key, data });
  await page.goto('/'); await page.locator('.mr-dock-title').click();
});

test('calendar selects, clears and picks today, preserving project contents after reload', async ({ page }, info) => {
  const original = await read(page);
  await trigger(page).click(); await expect(calendar(page)).toBeVisible();
  await expect(calendar(page).locator('[aria-current="date"]')).toHaveAttribute('data-calendar-date', '2026-10-20');
  const bounds = await calendar(page).boundingBox(), viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  await page.screenshot({ path: `.tools/calendar-${info.project.name}.png` });
  await calendar(page).getByRole('button', { name: '2026年10月22日', exact: true }).click();
  await expect(calendar(page)).toHaveCount(0); await expect(trigger(page)).toContainText('2026/10/22');
  await expect(trigger(page)).toBeFocused();
  await page.reload(); await expect(trigger(page)).toContainText('2026/10/22');
  await trigger(page).click(); await calendar(page).getByRole('button', { name: '清除日期', exact: true }).click();
  await expect(trigger(page)).toContainText('选择日期');
  await trigger(page).click(); await calendar(page).getByRole('button', { name: '今天', exact: true }).click();
  await expect(trigger(page)).toContainText('2026/10/20');
  const saved = await read(page); validateData(saved);
  expect(saved.projects[0]).toEqual({ ...original.projects[0], due: '2026-10-20', updatedAt: saved.projects[0].updatedAt });
});

test('keyboard navigation, focus loop and Escape stay within the date selection flow', async ({ page }) => {
  await trigger(page).click();
  await expect(calendar(page).getByRole('button', { name: '2026年10月28日', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('PageDown'); await page.keyboard.press('Home');
  await expect(calendar(page).getByRole('button', { name: '2026年11月23日', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(trigger(page)).toContainText('2026/11/23');
  await trigger(page).click(); await calendar(page).getByRole('button', { name: '清除日期', exact: true }).focus();
  await page.keyboard.press('Tab'); await expect(calendar(page).getByRole('button', { name: '上个月', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(calendar(page)).toHaveCount(0); await expect(page.locator('.project-detail')).toBeVisible(); await expect(trigger(page)).toBeFocused();
  await trigger(page).click(); await trigger(page).click(); await expect(calendar(page)).toHaveCount(0);
  await trigger(page).click(); await page.locator('#project-title').click(); await expect(calendar(page)).toHaveCount(0);
});

test('new project date uses month and year selection and submits the chosen value', async ({ page }) => {
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('新的日期选择');
  await page.getByRole('button', { name: '截止日期（可选）', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择截止日期（可选）', exact: true });
  await picker.getByRole('button', { name: '选择年月', exact: true }).click();
  await picker.getByRole('button', { name: '下一年', exact: true }).click();
  await picker.getByRole('button', { name: '2027年2月', exact: true }).click();
  await picker.getByRole('button', { name: '2027年2月5日', exact: true }).click();
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  expect((await read(page)).projects[0].due).toBe('2027-02-05');
  await expect(trigger(page)).toContainText('2027/02/05');
});

test('failed writes leave the selected date unchanged and the calendar open', async ({ page }) => {
  const original = await read(page);
  await trigger(page).click();
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('No room', 'QuotaExceededError'); return original.call(this, name, value); };
  }, key);
  await calendar(page).getByRole('button', { name: '2026年10月22日', exact: true }).click();
  await expect(calendar(page)).toBeVisible(); await expect(trigger(page)).toContainText('2026/10/28');
  expect(await read(page)).toEqual(original);
  await page.keyboard.press('Escape'); await expect(page.locator('.project-detail')).toBeVisible();
});

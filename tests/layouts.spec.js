import { test, expect } from '@playwright/test';
import { seedData } from '../public/data.js';

const layouts = ['focus', 'journal', 'matrix', 'route'];
const layoutKey = 'shixu-layout-lab-v1';
const workspaceKey = 'shixu.workspace.v1';

const capture = page => page.locator('form.quick-capture').first();
const layoutButton = (page, id) => page.locator(`button[data-layout="${id}"]`).first();

async function openProject(page, id = 'p1') {
  await page.locator(`#layout-main [data-project="${id}"]`).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const layout of layouts) {
  test(`${layout}: readable layout and direct capture fit each viewport`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/layouts.html?layout=${layout}`);
    await expect(page.locator('.layout-surface')).toHaveAttribute('data-layout', layout);
    await expect(page.locator('#layout-main h1')).toBeVisible();
    await expect(capture(page).getByRole('textbox', { name: '记录内容', exact: true })).toBeVisible();
    await expect(capture(page).locator('button[type="submit"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.locator('#layout-main').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `docs/screenshots/layout-${layout}-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}

test('quick capture needs no modal and remains searchable across layouts and reload', async ({ page }) => {
  const title = '把此刻的想法马上记下来';
  await page.goto('/layouts.html?layout=focus');
  const form = capture(page);
  await form.getByRole('textbox', { name: '记录内容', exact: true }).fill(`${title}\n下一步用一个真实项目试用。`);
  await form.locator('button[type="submit"]').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(form.getByRole('textbox', { name: '记录内容', exact: true })).toHaveValue('');
  await expect(page.getByRole('status').filter({ hasText: /已保存|已记录|已添加/ }).first()).toBeVisible();

  for (const layout of layouts) {
    await layoutButton(page, layout).click();
    await expect(page.locator('.layout-surface')).toHaveAttribute('data-layout', layout);
    await page.getByRole('searchbox', { name: '搜索项目与记录', exact: true }).fill(title);
    await expect(page.locator('#layout-main [data-note]').filter({ hasText: title }).first()).toBeVisible();
  }
  await page.reload();
  await page.getByRole('searchbox', { name: '搜索项目与记录', exact: true }).fill(title);
  await expect(page.locator('#layout-main [data-note]').filter({ hasText: title }).first()).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), layoutKey)).toContain(title);
});

test('multiline task capture updates project progress and completion survives reload', async ({ page }) => {
  await page.goto('/layouts.html?layout=matrix');
  const form = capture(page);
  await form.getByRole('combobox', { name: '记录类型', exact: true }).selectOption('task');
  await form.getByRole('combobox', { name: '关联项目', exact: true }).selectOption('p1');
  await form.getByRole('textbox', { name: '记录内容', exact: true }).fill('验证快捷记录\n整理验证反馈');
  await form.locator('button[type="submit"]').click();
  let dialog = await openProject(page);
  await expect(dialog).toContainText('43%');
  await dialog.getByRole('checkbox', { name: '验证快捷记录', exact: true }).check();
  await dialog.getByRole('checkbox', { name: '整理验证反馈', exact: true }).check();
  await expect(dialog).toContainText('71%');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await layoutButton(page, 'route').click();
  dialog = await openProject(page);
  await expect(dialog.getByRole('checkbox', { name: '验证快捷记录', exact: true })).toBeChecked();
  await expect(dialog).toContainText('71%');
  await page.reload();
  dialog = await openProject(page);
  await expect(dialog.getByRole('checkbox', { name: '整理验证反馈', exact: true })).toBeChecked();
  await expect(dialog).toContainText('71%');
});

test('drafts survive layout switches and keyboard capture respects Chinese composition', async ({ page }) => {
  await page.goto('/layouts.html?layout=focus');
  const initialSnapshot = await page.evaluate(key => localStorage.getItem(key), layoutKey);
  await page.locator('#layout-main').focus();
  await page.keyboard.press('n');
  let field = capture(page).getByRole('textbox', { name: '记录内容', exact: true });
  await expect(field).toBeFocused();
  await field.fill('还在输入的中文想法');
  for (const layout of ['journal', 'matrix', 'route']) {
    await layoutButton(page, layout).click();
    field = capture(page).getByRole('textbox', { name: '记录内容', exact: true });
    await expect(field).toHaveValue('还在输入的中文想法');
  }
  await field.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true });
  await expect(field).toHaveValue('还在输入的中文想法');
  expect(await page.evaluate(key => localStorage.getItem(key), layoutKey)).toBe(initialSnapshot);
  await field.press('Control+Enter');
  await expect(field).toHaveValue('');
  await expect(page.getByRole('status').filter({ hasText: /已保存/ }).first()).toBeVisible();
});

test('project and note details support keyboard dismissal and return focus', async ({ page }) => {
  await page.goto('/layouts.html?layout=focus');
  const projectTrigger = page.locator('#layout-main [data-project="p1"]').first();
  await projectTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(projectTrigger).toBeFocused();

  await page.getByRole('searchbox', { name: '搜索项目与记录', exact: true }).fill('让知识真正流动起来');
  const noteTrigger = page.locator('#layout-main [data-note="n1"]').first();
  await noteTrigger.click();
  await expect(page.getByRole('dialog')).toContainText('让知识真正流动起来');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(noteTrigger).toBeFocused();
});

test('search narrows projects and recovers after a no-result query', async ({ page }) => {
  await page.goto('/layouts.html?layout=journal');
  const search = page.getByRole('searchbox', { name: '搜索项目与记录', exact: true });
  await search.fill('独立博客改版');
  await expect(page.locator('#layout-main [data-project="p2"]').first()).toBeVisible();
  await expect(page.locator('#layout-main [data-project="p1"]')).toHaveCount(0);
  await search.fill('没有任何匹配项-0123456789');
  await expect(page.locator('#layout-main [data-project]')).toHaveCount(0);
  await expect(page.locator('#layout-main [data-note]')).toHaveCount(0);
  await search.clear();
  await expect(page.locator('#layout-main [data-project="p1"]').first()).toBeVisible();
});

test('captured markup stays text and layout edits preserve the real workspace', async ({ page }) => {
  const original = JSON.stringify(seedData());
  await page.goto('/');
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: workspaceKey, value: original });
  await page.goto('/layouts.html?layout=journal');
  const body = '安全渲染测试\n<img src=x onerror="window.__layoutInjection=true">\n<script>window.__layoutInjection=true</script>';
  await capture(page).getByRole('textbox', { name: '记录内容', exact: true }).fill(body);
  await capture(page).locator('button[type="submit"]').click();
  await page.getByRole('searchbox', { name: '搜索项目与记录', exact: true }).fill('安全渲染测试');
  await page.locator('#layout-main [data-note]').filter({ hasText: '安全渲染测试' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('<img src=x');
  await expect(page.getByRole('dialog').locator('img, script')).toHaveCount(0);
  expect(await page.evaluate(() => window.__layoutInjection)).toBeUndefined();
  expect(await page.evaluate(key => localStorage.getItem(key), workspaceKey)).toBe(original);
  await page.goto('/#projects/project/p1');
  await expect(page.locator('.drawer .module-task input[type="checkbox"]:checked')).toHaveCount(3);
  expect(await page.evaluate(key => localStorage.getItem(key), workspaceKey)).toBe(original);
});

test('record destination can be cleared and project-specific forms keep their context', async ({ page }) => {
  await page.goto('/layouts.html?layout=route');
  let form = capture(page);
  await form.getByRole('combobox', { name: '关联项目', exact: true }).selectOption('');
  await expect(form.getByRole('combobox', { name: '关联项目', exact: true })).toHaveValue('');
  await form.getByRole('textbox', { name: '记录内容', exact: true }).fill('先放进收集箱');
  await form.locator('button[type="submit"]').click();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), layoutKey);
  expect(saved.notes[0].inbox).toBe(true);
  expect(saved.notes[0].projectIds).toEqual([]);
  await layoutButton(page, 'matrix').click();
  const details = page.locator('details[data-project-details="p2"]');
  await details.locator('summary').click();
  form = details.locator('form.quick-capture');
  await expect(form.getByRole('combobox', { name: '关联项目', exact: true })).toHaveValue('p2');
  await form.getByRole('textbox', { name: '记录内容', exact: true }).fill('写给博客的进展');
  await form.locator('button[type="submit"]').click();
  const later = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), layoutKey);
  expect(later.notes[0].projectIds).toEqual(['p2']);
});

test('comparison and phone preview share saved records without rebuilding other frames', async ({ page }, testInfo) => {
  await page.goto('/layouts.html?compare=1');
  await expect(page.locator('.compare-viewport iframe')).toHaveCount(4);
  const first = page.frameLocator('.compare-viewport iframe').nth(0);
  const second = page.frameLocator('.compare-viewport iframe').nth(1);
  await second.locator('.quick-capture textarea').fill('另一版未完成的草稿');
  await first.locator('.quick-capture textarea').fill('并排比较中的记录');
  await first.locator('.quick-capture button[type=submit]').click();
  await expect(second.locator('.quick-capture textarea')).toHaveValue('另一版未完成的草稿');
  await expect(second.locator('[data-note]').filter({ hasText: '并排比较中的记录' }).first()).toBeVisible();
  if (testInfo.project.name === 'desktop') await page.screenshot({ path: 'docs/screenshots/layout-comparison-desktop.png', fullPage: true, animations: 'disabled' });
  await layoutButton(page, 'focus').click();
  await page.getByRole('button', { name: '手机预览', exact: true }).click();
  const phone = page.frameLocator('.phone-stage iframe');
  await expect(phone.locator('.layout-surface')).toBeVisible();
  await phone.locator('.quick-capture textarea').fill('手机尺寸下的记录');
  await phone.locator('.quick-capture button[type=submit]').click();
  await page.getByRole('button', { name: '桌面预览', exact: true }).click();
  await expect(page.locator('#layout-main [data-note]').filter({ hasText: '手机尺寸下的记录' }).first()).toBeVisible();
});

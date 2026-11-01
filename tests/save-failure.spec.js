import { test, expect } from '@playwright/test';

test('failed project creation keeps the draft and retries without duplicating the project', async ({ page }) => {
  await page.goto('/');
  await page.locator('.workspace-projects .toolbar').getByRole('button', { name: '新建项目' }).click();
  const dialog = page.getByRole('dialog', { name: '新建项目', exact: true });
  await dialog.getByRole('textbox', { name: '项目名称', exact: true }).fill('保存失败后重试');
  await dialog.getByRole('textbox', { name: '项目说明', exact: true }).fill('这份草稿需要保留');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.rejectWorkspaceWrite = true;
    Storage.prototype.setItem = function(key, value) {
      if (window.rejectWorkspaceWrite && key === 'shixu.workspace.v1') throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await dialog.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#form-error')).toContainText('尚未保存');
  await expect(dialog.getByRole('textbox', { name: '项目说明', exact: true })).toHaveValue('这份草稿需要保留');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')).projects.some(p => p.title === '保存失败后重试'))).toBe(false);
  await page.evaluate(() => { window.rejectWorkspaceWrite = false; });
  await dialog.getByRole('textbox', { name: '项目名称', exact: true }).press('Control+s');
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByRole('dialog', { name: '项目详情：保存失败后重试' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')).projects.filter(p => p.title === '保存失败后重试').length)).toBe(1);
});

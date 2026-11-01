import { test, expect } from '@playwright/test';

test('failed note association keeps checked choices and retries without changing the saved records', async ({ page }) => {
  await page.goto('/#projects/project/p1');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')).notes);
  await page.getByRole('button', { name: '关联笔记', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '关联已有笔记', exact: true });
  const checkbox = dialog.getByRole('checkbox').first();
  const checked = !await checkbox.isChecked();
  await checkbox.setChecked(checked);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.rejectWorkspaceWrite = true;
    Storage.prototype.setItem = function(key, value) {
      if (window.rejectWorkspaceWrite && key === 'shixu.workspace.v1') throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await dialog.getByRole('button', { name: '保存关联', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(checkbox).toBeChecked({ checked });
  await expect(dialog.locator('#form-error')).toContainText('尚未保存');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')).notes)).toEqual(before);
  await page.evaluate(() => { window.rejectWorkspaceWrite = false; });
  await dialog.getByRole('button', { name: '保存关联', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')).notes[0].projectIds.includes('p1'))).toBe(checked);
});

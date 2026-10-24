import { test, expect } from '@playwright/test';
import { seedData } from '../public/data.js';

test('task description conflicts show both versions with line breaks and escaped markup', async ({ page }) => {
  const project = seedData().projects[0];
  const local = structuredClone(project), remote = structuredClone(project);
  const localDescription = '## 本机步骤\n先核对内容\n<img src=x onerror="window.conflictInjected=true">';
  const remoteDescription = '## 云端步骤\n完成另一端验收\n<script>window.conflictInjected=true</script>';
  local.tasks[0].description = localDescription;
  remote.tasks[0].description = remoteDescription;
  await page.goto('/');
  await page.evaluate(async ({ local, remote }) => {
    const { createSyncUI } = await import('/sync-ui.js');
    document.querySelector('#sync-dialog')?.remove();
    const client = { getStatus: () => ({
      state: 'conflict', user: { id: 'conflict-user', username: '说明冲突验证' }, pending: true,
      conflicts: [{ collection: 'projects', id: local.id, local, remote, reason: '同一任务详细说明在两端修改' }],
    }) };
    createSyncUI(client).open();
  }, { local, remote });
  const localContent = page.getByLabel('本机项目内容', { exact: true });
  const remoteContent = page.getByLabel('云端项目内容', { exact: true });
  await expect(localContent.locator('.sync-task-description')).toHaveCount(1);
  await expect(remoteContent.locator('.sync-task-description')).toHaveCount(1);
  expect(await localContent.locator('.sync-task-description').innerText()).toBe(localDescription);
  expect(await remoteContent.locator('.sync-task-description').innerText()).toBe(remoteDescription);
  await expect(page.locator('.sync-conflict-values img,.sync-conflict-values script')).toHaveCount(0);
  expect(await page.evaluate(() => window.conflictInjected)).toBeUndefined();
});

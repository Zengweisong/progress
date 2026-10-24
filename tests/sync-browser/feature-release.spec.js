import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const key = 'shixu.workspace.v1';
const password = 'test-password-12345';
const dialog = page => page.locator('#sync-dialog');
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const byId = items => [...items].sort((a, b) => a.id.localeCompare(b.id));
async function openSync(page) {
  if (!await dialog(page).isVisible()) await page.getByRole('button', { name: '账号与多端同步', exact: true }).first().click();
}
async function closeSync(page) { await page.getByRole('button', { name: '关闭账号与多端同步', exact: true }).click(); }
async function connect(page, username, register = false) {
  await openSync(page);
  if (register) await page.getByRole('button', { name: '注册账号', exact: true }).click();
  await page.getByLabel('账号', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: register ? '创建账号' : '登录账号', exact: true }).click();
  await dialog(page).getByRole('button', { name: register ? /同步本机工作区/ : /打开账号工作区/ }).click();
  await expect(dialog(page).locator('[data-sync-status]')).toHaveText('已同步');
  await closeSync(page);
}
async function sync(page) {
  await openSync(page);
  const button = dialog(page).getByRole('button', { name: '立即同步', exact: true });
  if (await button.count()) await button.click();
  await expect(dialog(page).locator('[data-sync-status]')).toHaveText('已同步');
  await closeSync(page);
}

test('template edits, ordering and task Markdown merge across devices and remote refresh clears old undo', async ({ page, browser }) => {
  const username = `release-${randomUUID().slice(0, 12)}`;
  await page.goto('/'); await connect(page, username, true);
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4183', locale: 'zh-CN' });
  const other = await context.newPage();
  try {
    await other.goto('/'); await connect(other, username);
    await context.setOffline(true);
    const checkbox = other.locator('[data-route-task="p1-t0"] > input');
    const checked = await checkbox.isChecked(); await checkbox.setChecked(!checked);
    const localTask = (await stored(other)).projects[0].tasks.find(task => task.id === 'p1-t0');

    await page.goto('/#knowledge');
    await page.getByRole('button', { name: '新建页面', exact: true }).click();
    await page.getByRole('button', { name: '更多模板', exact: false }).click();
    const picker = page.getByRole('dialog', { name: '选择页面模板', exact: true });
    await picker.getByRole('button', { name: '编辑模板：会议记录', exact: true }).click();
    await page.getByRole('textbox', { name: '模板名称', exact: true }).fill('跨设备会议模板');
    await page.getByRole('textbox', { name: '模板正文', exact: true }).fill('## 同步议题\n\n- [ ] 明确负责人');
    await page.getByRole('button', { name: '保存模板', exact: true }).click();
    await picker.locator('[data-template-drag="weekly"]').press('Alt+ArrowUp');
    const templates = (await stored(page)).templates;
    const templatePageId = (await stored(page)).notes[0].id;
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await page.goto('/#projects/project/p1');
    const description = '## 两端共同验收\n\n- [ ] 检查模板和事项说明';
    await page.locator('[data-task-description="p1-t0"] .cm-content').fill(description);
    await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
    await sync(page);

    await context.setOffline(false); await sync(other);
    await expect.poll(async () => byId((await stored(other)).templates)).toEqual(byId(templates));
    await expect.poll(async () => (await stored(other)).projects[0].tasks.find(task => task.id === 'p1-t0')).toMatchObject({ description, done: localTask.done, status: localTask.status });
    await other.evaluate(() => document.activeElement?.blur());
    const merged = await stored(other);
    await other.keyboard.press('Control+z');
    expect(await stored(other)).toEqual(merged);
    await expect(checkbox).toBeChecked({ checked: !checked });

    await other.goto(`/#knowledge/note/${templatePageId}`);
    await expect(other.locator('[data-common-template]').first()).toHaveAttribute('data-common-template', 'weekly');
    await expect(other.getByRole('button', { name: '使用模板：跨设备会议模板', exact: true })).toBeVisible();
    await other.reload();
    expect(byId((await stored(other)).templates)).toEqual(byId(templates));
    await expect(other.locator('[data-common-template]').first()).toHaveAttribute('data-common-template', 'weekly');
    await other.goto('/#projects/project/p1');
    const taskEditor = other.locator('[data-task-description="p1-t0"] .cm-content');
    await expect.poll(() => taskEditor.evaluate(async node => {
      const { EditorView } = await import('/vendor/editor/codemirror.js');
      return EditorView.findFromDOM(node).state.doc.toString();
    })).toBe(description);
    await sync(page);
    expect((await stored(page)).projects[0].tasks.find(task => task.id === 'p1-t0')).toMatchObject({ description, done: localTask.done, status: localTask.status });
  } finally { await context.close(); }
});

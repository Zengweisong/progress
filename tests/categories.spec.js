import { test, expect } from '@playwright/test';

const readData = page => page.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')));
const path = (section, category) => `${section}/category/${encodeURIComponent(category)}`;

async function newPageInCategory(page, section, category, mobile) {
  if (mobile) {
    await page.goto(`/#${path(section, category)}`);
    await page.getByRole('button', { name: '在当前分类下新建页面', exact: true }).click();
  } else {
    const expand = page.locator(`[data-nav-expand="${section}"]`);
    if (await expand.getAttribute('aria-expanded') !== 'true') await expand.click();
    const button = page.locator(`#nav-children-${section}`).getByRole('button', { name: `在${category || '未分类'}下新建页面`, exact: true });
    await button.locator('..').hover(); await button.click();
  }
}

async function chooseCategory(page, section, name, mobile) {
  if (mobile) {
    if (!page.url().includes(`#${section}`)) await page.goto(`/#${section}`);
    await page.getByRole('combobox', { name: '二级分类', exact: true }).selectOption(path(section, name));
  } else {
    const expand = page.locator(`[data-nav-expand="${section}"]`);
    if (await expand.getAttribute('aria-expanded') !== 'true') await expand.click();
    await page.locator(`#nav-children-${section}`).getByRole('link', { name: new RegExp(`^${name || '未分类'}`) }).click();
  }
}

async function createCategory(page, section, name, mobile) {
  if (mobile) await page.getByRole('button', { name: '新建二级分类', exact: true }).click();
  else {
    const expand = page.locator(`[data-nav-expand="${section}"]`);
    if (await expand.getAttribute('aria-expanded') !== 'true') await expand.click();
    await (section === 'projects' ? page.getByRole('button', { name: '新建项目分类', exact: true }) : page.getByRole('button', { name: `新建${section === 'knowledge' ? '知识库' : '收集箱'}分类`, exact: true })).click();
  }
  const dialog = page.getByRole('dialog', { name: '新建二级分类', exact: true });
  await dialog.getByRole('textbox', { name: '分类名称', exact: true }).fill(name);
  await dialog.getByRole('button', { name: '创建分类', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#${section}/category/`));
}

async function editCategory(page, section, name, mobile) {
  if (mobile) await page.getByRole('button', { name: '编辑当前分类', exact: true }).click();
  else {
    const button = page.locator(`#nav-children-${section}`).getByRole('button', { name: `编辑${name}分类`, exact: true });
    await button.locator('..').hover(); await button.click();
  }
  return page.getByRole('dialog', { name: '编辑二级分类', exact: true });
}

test('custom project categories support creation, assignment, rename, deletion and reload', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto('/#projects');
  await createCategory(page, 'projects', '工作 / 个人', mobile);
  await expect(page.locator('.mr-route-line')).toHaveCount(0);
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  const form = page.getByRole('dialog', { name: '新建项目', exact: true });
  await expect(form.getByLabel('分类（可选）', { exact: true })).toHaveValue('工作 / 个人');
  await form.getByRole('textbox', { name: '项目名称', exact: true }).fill('归类项目');
  await form.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await expect(page.locator('.mr-route-line')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.mr-route-line')).toContainText('归类项目');
  await page.goto('/#projects/project/p1');
  await page.getByRole('combobox', { name: '项目分类', exact: true }).selectOption('工作 / 个人');
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await chooseCategory(page, 'projects', '工作 / 个人', mobile);
  await expect(page.locator('.mr-route-line')).toHaveCount(2);
  for (const view of ['board', 'table', 'route']) {
    await page.locator(`[data-view="${view}"]`).click();
    await expect(page.locator(view === 'board' ? '.project-card' : view === 'table' ? '.project-table tbody tr' : '.mr-route-line')).toHaveCount(2);
  }
  let dialog = await editCategory(page, 'projects', '工作 / 个人', mobile);
  await dialog.getByRole('textbox', { name: '分类名称', exact: true }).fill('重点项目');
  await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
  expect((await readData(page)).projects.find(project => project.id === 'p1').tag).toBe('重点项目');
  await page.reload(); await expect(page.locator('.mr-route-line')).toHaveCount(2);
  dialog = await editCategory(page, 'projects', '重点项目', mobile);
  await dialog.getByRole('button', { name: '删除分类', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这个分类？', exact: true }).getByRole('button', { name: '删除分类', exact: true }).click();
  await expect(page.locator('.mr-route-line')).toHaveCount(2);
  const data = await readData(page);
  expect(data.projects).toHaveLength(9);
  expect(data.projects.find(project => project.id === 'p1').tag).toBe('');
  expect(data.folders.some(folder => folder.name === '重点项目')).toBe(false);
  expect(data.notes).toHaveLength(7);
});

test('knowledge and inbox categories are independent and default new notes to their current category', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile';
  for (const [section, title] of [['knowledge', '知识分类笔记'], ['inbox', '收集箱分类想法']]) {
    await page.goto(`/#${section}`);
    await createCategory(page, section, '学习资料', mobile);
    if (section === 'inbox') {
      await page.locator('.page-heading').getByRole('button', { name: '快速记录', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '记下一个想法', exact: true });
      await expect(dialog.getByRole('combobox', { name: '分类', exact: true })).toHaveValue('学习资料');
      await dialog.getByRole('textbox', { name: '标题', exact: true }).fill(title);
      await dialog.getByRole('textbox', { name: '内容', exact: true }).fill('## 分类中的 Markdown');
      await dialog.getByRole('button', { name: '保存到收集箱', exact: true }).click();
    } else {
      await page.locator('.page-heading').getByRole('button', { name: '新建页面', exact: true }).click();
      await page.locator('#note-title').fill(title);
      await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('## 分类中的 Markdown');
    }
    await expect(page.locator('#note-category')).toHaveValue('学习资料');
    await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
    await page.reload();
    await expect(page.locator('.note-card')).toHaveCount(1);
    await expect(page.locator('.note-card')).toContainText(title);
  }
  await page.goto('/#knowledge');
  await chooseCategory(page, 'knowledge', '学习资料', mobile);
  const dialog = await editCategory(page, 'knowledge', '学习资料', mobile);
  await dialog.getByRole('textbox', { name: '分类名称', exact: true }).fill('设计资料');
  await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
  const data = await readData(page);
  expect(data.notes.find(note => note.title === '知识分类笔记').category).toBe('设计资料');
  expect(data.notes.find(note => note.title === '收集箱分类想法').category).toBe('学习资料');
});

test('category management rejects duplicates and safely renders custom names', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile', name = '<img src=x onerror=alert(1)>';
  await page.goto('/#projects');
  await createCategory(page, 'projects', name, mobile);
  await page.reload();
  await expect(page.locator('.breadcrumb')).toContainText(name);
  await expect(page.locator('.sidebar img')).toHaveCount(0);
  if (mobile) await page.getByRole('button', { name: '新建二级分类', exact: true }).click();
  else await page.getByRole('button', { name: '新建项目分类', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建二级分类', exact: true });
  await dialog.getByRole('textbox', { name: '分类名称', exact: true }).fill(name);
  await dialog.getByRole('button', { name: '创建分类', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('同名分类');
  await expect(dialog).toBeVisible();
  expect((await readData(page)).folders.filter(folder => folder.name === name)).toHaveLength(1);
});

test('backup import restores empty category definitions', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto('/#projects');
  await createCategory(page, 'projects', '备份分类', mobile);
  await page.getByRole('button', { name: '查看本机保存与备份状态', exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整数据', exact: false }).click();
  const backup = info.outputPath('categories.json');
  await (await event).saveAs(backup);
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  const dialog = await editCategory(page, 'projects', '备份分类', mobile);
  await dialog.getByRole('button', { name: '删除分类', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这个分类？', exact: true }).getByRole('button', { name: '删除分类', exact: true }).click();
  expect((await readData(page)).folders).toHaveLength(0);
  await page.getByRole('button', { name: '查看本机保存与备份状态', exact: true }).click();
  await page.locator('#import-file').setInputFiles(backup);
  await page.getByRole('dialog', { name: '导入为独立副本', exact: true }).getByRole('button', { name: '导入副本', exact: true }).click();
  const data = await readData(page);
  expect(data.folders).toHaveLength(1);
  expect(data.folders[0]).toMatchObject({ section: 'projects', name: '备份分类' });
  expect(data.projects).toHaveLength(16);
  await chooseCategory(page, 'projects', '备份分类', mobile);
  await expect(page.locator('.mr-route-line')).toHaveCount(0);
});

for (const [section, category, title] of [
  ['projects', '学习', '分类旁新建的项目'],
  ['knowledge', '技术实践', '分类旁新建的笔记'],
  ['inbox', '产品与设计', '分类旁新建的想法'],
]) {
  test(`category plus creates a page in ${section}/${category || 'uncategorized'}`, async ({ page }, info) => {
    const mobile = info.project.name === 'mobile';
    await page.goto(section === 'inbox' ? '/#projects' : '/#inbox');
    const initial = await readData(page), initialURL = page.url();
    await newPageInCategory(page, section, category, mobile);
    if (section === 'projects') {
      let dialog = page.getByRole('dialog', { name: '新建项目', exact: true });
      await expect(dialog.getByLabel('分类（可选）', { exact: true })).toHaveValue(category);
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      expect(await readData(page)).toEqual(initial);
      if (!mobile) expect(page.url()).toBe(initialURL);
      await newPageInCategory(page, section, category, mobile);
      dialog = page.getByRole('dialog', { name: '新建项目', exact: true });
      await dialog.getByRole('textbox', { name: '项目名称', exact: true }).fill(title);
      await dialog.getByRole('button', { name: '创建项目', exact: true }).click();
    } else {
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('#note-category')).toHaveValue(category);
      await page.locator('#note-title').fill(title);
      await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('## 分类中直接创建\n\n**保留 Markdown**');
    }
    const expectedParent = `#${path(section, category)}`;
    await expect.poll(() => decodeURIComponent(page.url().split('#')[1])).toContain(`${section}/category/${category}/${section === 'projects' ? 'project' : 'note'}/`);
    const saved = await readData(page);
    if (section === 'projects') {
      expect(saved.projects).toHaveLength(initial.projects.length + 1);
      expect(saved.projects[0]).toMatchObject({ title, tag: category });
      await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
      await expect(page.locator('.mr-route-line').filter({ hasText: title })).toHaveCount(1);
    } else {
      expect(saved.notes).toHaveLength(initial.notes.length + 1);
      expect(saved.notes[0]).toMatchObject({ title, category, inbox: section === 'inbox', projectIds: [] });
      await expect(page.locator('#note-body')).toContainText('保留 Markdown');
      await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
      await expect(page.locator('.note-card').filter({ hasText: title })).toHaveCount(1);
    }
    await expect.poll(() => page.url().split('#')[1]).toBe(expectedParent.slice(1));
    await page.reload();
    await expect(page.locator(section === 'projects' ? '.mr-route-line' : '.note-card').filter({ hasText: title })).toHaveCount(1);
  });
}

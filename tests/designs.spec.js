import { test, expect } from '@playwright/test';

const themes = ['clarity', 'paper', 'midnight'];
const screens = ['projects', 'detail', 'library', 'reader'];

for (const theme of themes) {
  test(`${theme}: all four Apple design layouts adapt without errors`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const screen of screens) {
      await page.goto(`/designs.html?theme=${theme}&screen=${screen}&present=1`);
      await expect(page.locator('.product-surface')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.product-surface')).toHaveAttribute('data-screen', screen);
      await expect(page.locator('#design-main h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('#design-main').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      if (testInfo.project.name === 'desktop' || (testInfo.project.name === 'mobile' && ['projects', 'reader'].includes(screen))) {
        await page.screenshot({ path: `docs/screenshots/apple-${theme}-${testInfo.project.name}-${screen}.png`, animations: 'disabled' });
      }
      if (testInfo.project.name === 'mobile') await expect(page.getByRole('navigation', { name: '预览内导航' })).toBeInViewport();
    }
    expect(errors).toEqual([]);
  });
}

test('design controls, comparison and phone preview are navigable', async ({ page }, testInfo) => {
  await page.goto('/designs.html');
  await page.locator('[data-theme=paper].theme-option').click();
  await expect(page.locator('.product-surface')).toHaveAttribute('data-theme', 'paper');
  await page.locator('.screen-picker').getByRole('button', { name: '笔记阅读', exact: true }).click();
  await expect(page.locator('.product-surface')).toHaveAttribute('data-screen', 'reader');
  await page.getByRole('button', { name: '手机预览', exact: true }).click();
  await expect(page.locator('.design-stage')).toHaveClass(/phone-stage/);
  await page.getByRole('button', { name: '并排比较', exact: true }).click();
  await expect(page.locator('.comparison-frame iframe')).toHaveCount(3);
  for (const frame of page.frames().filter(frame => frame !== page.mainFrame())) {
    await expect(frame.locator('.d-reading-paper h1')).toBeVisible();
  }
  await page.locator('.comparison-item').last().getByRole('button', { name: '放大', exact: true }).click();
  await expect(page.locator('.product-surface')).toHaveAttribute('data-theme', 'midnight');
  await page.getByRole('button', { name: '桌面预览', exact: true }).click();
  await page.locator('.screen-picker').getByRole('button', { name: '知识库', exact: true }).click();
  await page.getByRole('button', { name: '并排比较', exact: true }).click();
  for (const frame of page.frames().filter(frame => frame !== page.mainFrame())) await expect(frame.locator('.d-library h1')).toBeVisible();
  if (testInfo.project.name === 'desktop') await page.screenshot({ path: 'docs/screenshots/apple-comparison.png', fullPage: true, animations: 'disabled' });
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '并排比较', exact: true }).click();
    await page.screenshot({ path: 'docs/screenshots/apple-lab-mobile.png', fullPage: true, animations: 'disabled' });
  }
});

test('preview interactions leave the real workspace untouched and honor accessibility preferences', async ({ page }) => {
  await page.goto('/?layout=board');
  await expect(page.locator('.project-card')).toHaveCount(8);
  if (page.viewportSize().width > 700) await page.getByRole('link', { name: 'Apple Design 版面探索' }).click();
  else await page.goto('/designs.html');
  await page.locator('.d-project-card[data-project=p1]').click();
  await page.getByLabel('完成检索与快速记录流程', { exact: true }).check();
  await expect(page.locator('.d-task-progress')).toContainText('80%');
  await page.locator('.d-related-note[data-note=n1]').click();
  await expect(page.locator('.d-reading-paper h1')).toHaveText('让知识真正流动起来');
  await page.getByRole('button', { name: '切换专注阅读', exact: true }).click();
  await expect(page.locator('body')).toHaveClass(/reading-focus/);
  await page.locator('.d-reader-tools').getByRole('button', { name: '知识库', exact: true }).click();
  await page.getByRole('button', { name: '记一篇笔记', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '接住一个想法' })).toBeVisible();
  await page.getByRole('textbox', { name: '写下此刻的想法' }).fill('设计预览中的独立想法');
  await page.getByRole('button', { name: '记录想法', exact: true }).click();
  await expect(page.locator('.d-library-card', { hasText: '设计预览中的独立想法' })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
  await page.getByRole('button', { name: '搜索示例内容', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索示例项目与笔记' }).fill('独立想法');
  await page.locator('#design-search-results button').click();
  await expect(page.locator('.d-reading-paper h1')).toHaveText('设计预览中的独立想法');
  await page.goto('/#projects/project/p1');
  await expect(page.locator('.drawer .module-task input[type="checkbox"]:checked')).toHaveCount(3);
  await page.getByRole('button', { name: '关闭项目详情', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(8);
});

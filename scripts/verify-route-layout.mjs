import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Uses isolated, signed-out browser contexts. Edits stay in those contexts;
// this check does not register accounts or upload any workspace records.
const origin = process.env.SHIXU_ORIGIN || 'https://8.147.235.91';
const key = 'shixu.workspace.v1';
const health = await fetch(`${origin}/api/health`);
assert(health.ok, 'Health endpoint failed');
for (const file of ['app.js', 'index.html', 'layouts.js', 'sw.js', 'workspace-route.css']) {
  const response = await fetch(`${origin}/${file}`);
  assert(response.ok, `Resource failed: ${file}`);
  const actual = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  const expected = createHash('sha256').update(await readFile(new URL(`../public/${file}`, import.meta.url))).digest('hex');
  assert.equal(actual, expected, `Resource differs from release: ${file}`);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const context = await browser.newContext({ baseURL: origin, viewport: { width, height }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/?layout=route');
      await expect(page.locator('[data-view="route"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.mr-route-line')).toHaveCount(8);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflows');
      await page.screenshot({ path: `docs/screenshots/workspace-route-live-${name}.png`, fullPage: true, animations: 'disabled' });
      const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
      await page.locator('[data-select-project="p1"]').click();
      await page.locator('[data-task="p1-t3"][data-project-id="p1"]').check();
      await page.locator('#route-capture-body').fill('线上布局本机验证笔记');
      await page.getByRole('button', { name: '保存记录', exact: true }).click();
      await page.locator('[data-view="table"]').click(); await page.reload();
      await expect(page.locator('[data-view="table"]')).toHaveAttribute('aria-pressed', 'true');
      const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
      assert.equal(after.projects.find(p => p.id === 'p1').tasks.find(t => t.id === 'p1-t3').done, true);
      assert.equal(after.notes.length, before.notes.length + 1);
      assert.deepEqual(after.notes[0].projectIds, ['p1']);
      await page.goto('/layouts.html?layout=route');
      await page.getByRole('link', { name: '应用到我的工作区' }).click();
      await expect(page.locator('[data-view="route"]')).toHaveAttribute('aria-pressed', 'true');
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      await context.setOffline(true); await page.reload();
      await expect(page.locator('.view-route')).toBeVisible();
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.workspace-route')).getPropertyValue('--accent').trim()), '#39796a');
      assert.deepEqual(errors, []);
      console.log(`${name}: real TLS, layout switching, local edits, apply link and offline reload passed`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log('Health and deployed resource hashes passed. No production accounts or workspace records were created.');

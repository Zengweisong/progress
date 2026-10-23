import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// Frozen v17 shell: it deliberately has no v18 module or stylesheet paths.
// Keeping the fixture here makes the regression independent of Git refs.
const legacyShell = [
  '/', '/index.html', '/layouts.html', '/designs.html', '/favicon.svg',
  '/app.js', '/data.js', '/styles.css', '/designs.js', '/designs.css',
  '/workspace-route.css', '/project-tasks.js', '/select-control.js', '/project-tasks.css', '/route-task-drag.js', '/record-order.js',
  '/sidebar.js', '/sidebar.css', '/sidebar-create.js', '/theme.js', '/theme.css',
  '/note-editor.js', '/note-editor.css', '/markdown.js', '/categories.js',
  '/live-note-editor.js', '/live-note-editor.css', '/note-images.js', '/vendor/editor/codemirror.js',
  '/date-picker.js', '/date-picker.css', '/vendor/markdown/marked.js', '/vendor/markdown/purify.js',
  '/layouts.js', '/layouts.css', '/layouts-focus-journal.js', '/layouts-focus-journal.css',
  '/layouts-matrix-route.js', '/layouts-matrix-route.css',
  '/sync-client.js', '/sync-db.js', '/sync-merge.js', '/sync-ui.js', '/sync-ui.css',
  '/vendor/pretext/layout.js', '/vendor/pretext/prepare.js', '/vendor/pretext/measurement.js',
  '/vendor/pretext/analysis.js', '/vendor/pretext/graphemes.js', '/vendor/pretext/line-break.js',
  '/vendor/pretext/line-breaks.js', '/vendor/pretext/line-text.js', '/vendor/pretext/rich-inline.js',
  '/vendor/pretext/han-kerning.js', '/vendor/pretext/gecko-line-breaks.js',
  '/vendor/pretext/generated/engine-break-data.js', '/vendor/pretext/generated/webkit-generic-families.js',
];
const legacyWorker = `
const CACHE = 'shixu-shell-v17';
const SHELL = ${JSON.stringify(legacyShell)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('shixu-shell-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || !SHELL.includes(url.pathname)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(url.pathname, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(url.pathname);
      if (cached) return cached;
      throw error;
    }
  })());
});`;

test.use({ serviceWorkers: 'allow' });

test('v17 upgrades with its old client open and v18 dependencies boot offline without a forced refresh', async ({ page, context, baseURL }) => {
  test.setTimeout(60000);
  let upgrading = false;
  const proxy = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (path === '/sw.js') {
        const script = upgrading ? await readFile(new URL('../public/sw.js', import.meta.url), 'utf8') : legacyWorker;
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
        response.end(script); return;
      }
      const upstream = await fetch(new URL(request.url, baseURL), { signal: AbortSignal.timeout(20000) });
      const headers = Object.fromEntries([...upstream.headers].filter(([name]) => !['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(name)));
      response.writeHead(upstream.status, headers);
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      response.writeHead(502, { 'Content-Type': 'text/plain' }); response.end(error.message);
    }
  });
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${proxy.address().port}`;
  try {
    await page.goto(origin);
    await expect(page.locator('.workspace-route')).toBeVisible();
    await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    // This navigation lets the old worker cache the newly deployed app while
    // continuing to exclude the imports that were introduced in v18.
    await page.reload();
    await expect(page.locator('.workspace-route')).toBeVisible();
    const before = await page.evaluate(async () => {
      const old = await caches.open('shixu-shell-v17'), app = await old.match('/app.js');
      window.__oldUpgradeController = navigator.serviceWorker.controller;
      window.__upgradeDocumentToken = 'same-document';
      return { newApp: (await app.text()).includes('./workspace-storage.js'), newDependencyCached: Boolean(await old.match('/workspace-storage.js')) };
    });
    expect(before).toEqual({ newApp: true, newDependencyCached: false });
    await page.locator('#route-capture-body').fill('升级期间仍未提交的草稿');
    upgrading = true;
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== window.__oldUpgradeController && navigator.serviceWorker.controller?.state === 'activated')).toBe(true);
    await expect(page.locator('#route-capture-body')).toHaveValue('升级期间仍未提交的草稿');
    expect(await page.evaluate(() => window.__upgradeDocumentToken)).toBe('same-document');
    for (const path of ['/workspace-storage.js', '/workspace-search.js', '/recycle-bin.js', '/workspace-tools.css']) {
      expect(await page.evaluate(async path => Boolean(await caches.match(path)), path)).toBe(true);
    }
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.workspace-route')).toBeVisible();
    await page.locator('#route-capture-body').fill('升级完成后的离线记录');
    await page.getByRole('button', { name: '保存记录', exact: true }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shixu.workspace.v1')).notes.some(note => note.body === '升级完成后的离线记录'))).toBe(true);
  } finally {
    try {
      await context.setOffline(false);
      if (!page.isClosed()) await page.goto('about:blank');
    } finally {
      await new Promise(resolve => { proxy.close(resolve); proxy.closeAllConnections(); });
    }
  }
});

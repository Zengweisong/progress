const CACHE = 'shixu-shell-v19';
const SHELL = [
  '/', '/index.html', '/layouts.html', '/designs.html', '/favicon.svg',
  '/app.js', '/data.js', '/styles.css', '/designs.js', '/designs.css',
  '/workspace-route.css', '/project-tasks.js', '/select-control.js', '/project-tasks.css', '/route-task-drag.js', '/record-order.js',
  '/sidebar.js', '/sidebar.css', '/sidebar-create.js',
  '/theme.js', '/theme.css',
  '/note-templates.js', '/note-editor.js', '/note-editor.css', '/markdown.js', '/categories.js',
  '/live-note-editor.js', '/live-note-editor.css', '/note-images.js', '/vendor/editor/codemirror.js',
  '/workspace-storage.js', '/workspace-search.js', '/recycle-bin.js', '/workspace-tools.css',
  '/date-picker.js', '/date-picker.css',
  '/vendor/markdown/marked.js', '/vendor/markdown/purify.js',
  '/layouts.js', '/layouts.css', '/layouts-focus-journal.js', '/layouts-focus-journal.css',
  '/layouts-matrix-route.js', '/layouts-matrix-route.css',
  '/sync-client.js', '/sync-db.js', '/sync-merge.js', '/sync-ui.js', '/sync-ui.css',
  '/vendor/pretext/layout.js', '/vendor/pretext/prepare.js', '/vendor/pretext/measurement.js',
  '/vendor/pretext/analysis.js', '/vendor/pretext/graphemes.js', '/vendor/pretext/line-break.js',
  '/vendor/pretext/line-breaks.js', '/vendor/pretext/line-text.js', '/vendor/pretext/rich-inline.js',
  '/vendor/pretext/han-kerning.js', '/vendor/pretext/gecko-line-breaks.js',
  '/vendor/pretext/generated/engine-break-data.js', '/vendor/pretext/generated/webkit-generic-families.js',
];
self.addEventListener('install', event => {
  // Take over only after every dependency is cached. An older active worker
  // does not know how to serve the new modules during an offline reload.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('shixu-shell-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Account and workspace responses always use the network, never a shared cache.
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
});

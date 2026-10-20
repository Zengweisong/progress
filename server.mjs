import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSyncAPI } from './server/sync-api.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
export function createAppServer(options = {}) {
const api = createSyncAPI(options);
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (await api.handle(req, res, url)) return;
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    const pathname = decodeURIComponent(url.pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('页面不存在'); }
});
server.on('close', () => api.close());
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const production = process.env.NODE_ENV === 'production';
  const publicOrigin = process.env.PUBLIC_ORIGIN;
  if (production && (!publicOrigin || !publicOrigin.startsWith('https://'))) throw new Error('生产环境必须设置 HTTPS PUBLIC_ORIGIN。');
  const server = createAppServer({
    databasePath: resolve(process.env.DATA_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '.data'), 'shixu.sqlite'),
    publicOrigin,
    secureCookies: production || publicOrigin?.startsWith('https://'),
    allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
    registrationCode: process.env.REGISTRATION_CODE || '',
  });
  const host = process.env.HOST || '127.0.0.1';
  server.listen(Number(process.env.PORT || 4173), host, () => console.log(`拾序：http://${host}:${server.address().port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    server.close(() => { process.exitCode = 0; });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

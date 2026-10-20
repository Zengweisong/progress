import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = resolve(root, 'public/vendor/markdown');
await mkdir(target, { recursive: true });
for (const [source, name] of [
  ['marked/lib/marked.esm.js', 'marked.js'],
  ['dompurify/dist/purify.es.mjs', 'purify.js'],
]) {
  const code = await readFile(resolve(root, 'node_modules', source), 'utf8');
  await writeFile(resolve(target, name), code.replace(/^\/\/# sourceMappingURL=.*$/gm, ''));
}
await copyFile(resolve(root, 'node_modules/marked/LICENSE'), resolve(target, 'MARKED-LICENSE'));
await copyFile(resolve(root, 'node_modules/dompurify/LICENSE'), resolve(target, 'DOMPURIFY-LICENSE'));
await copyFile(resolve(root, 'node_modules/dompurify/LICENSE-MPL'), resolve(target, 'DOMPURIFY-LICENSE-MPL'));
console.log('Markdown browser modules and licenses copied.');

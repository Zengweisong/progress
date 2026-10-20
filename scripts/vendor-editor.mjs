import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = resolve(root, 'public/vendor/editor');
await mkdir(target, { recursive: true });
const result = await build({
  stdin: { contents: `export { EditorState, StateField, EditorSelection, Transaction } from '@codemirror/state';
export { EditorView, Decoration, WidgetType, keymap, placeholder, drawSelection } from '@codemirror/view';
export { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
export { markdown, markdownKeymap } from '@codemirror/lang-markdown';
export { syntaxTree, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
export { StateEffect } from '@codemirror/state';
export { GFM } from '@lezer/markdown';`, resolveDir: root, sourcefile: 'editor-entry.js' },
  bundle: true, format: 'esm', target: 'es2022', minify: true, metafile: true, outfile: resolve(target, 'codemirror.js'), legalComments: 'linked',
});
const packages = new Set(Object.keys(result.metafile.inputs).filter(file => file.startsWith('node_modules/')).map(file => {
  const parts = file.slice(13).split('/'); return parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}));
const licenses = [];
for (const name of [...packages].sort()) {
  const info = JSON.parse(await readFile(resolve(root, 'node_modules', name, 'package.json'), 'utf8'));
  const license = await readFile(resolve(root, 'node_modules', name, 'LICENSE'), 'utf8').catch(() => 'See package license.');
  licenses.push(`${name} ${info.version}\n${license}`);
}
await writeFile(resolve(target, 'LICENSES.txt'), licenses.join('\n\n---\n\n'));
await writeFile(resolve(target, 'README.md'), 'CodeMirror 6 browser bundle. Rebuild with `npm run vendor:editor`. Versions are pinned in package-lock.json; bundled package licenses are in LICENSES.txt.\n');
console.log(`Editor bundled with ${packages.size} licensed packages.`);

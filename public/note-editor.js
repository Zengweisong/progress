import { isNoteFavorite } from './categories.js';

const tools = [
  ['heading', '标题', 'H₂'], ['bold', '加粗', '<b>B</b>', 'Ctrl+B'],
  ['italic', '斜体', '<i>I</i>', 'Ctrl+I'], ['quote', '引用', '“'],
  ['bullet', '无序列表', '• ≡'], ['ordered', '有序列表', '1.'],
  ['task', '待办列表', '☑'], ['link', '插入链接', 'link', 'Ctrl+K'],
  ['code', '代码块', '&lt;/&gt;'], ['table', '插入表格', 'table'],
];

export function renderMarkdownTools(icon, images = false) {
  return `<div class="markdown-tools" role="group" aria-label="Markdown 格式">${tools.map(([action, label, glyph, shortcut]) => `<button type="button" data-md-action="${action}" aria-label="${label}" title="${label}${shortcut ? ` (${shortcut})` : ''}">${glyph === 'link' || glyph === 'table' ? icon(glyph) : `<span aria-hidden="true">${glyph}</span>`}</button>`).join('')}${images ? '<button type="button" data-action="insert-note-image" aria-label="插入图片" title="插入图片，也可直接粘贴或拖入"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2"/><circle cx="7" cy="7" r="1"/><path d="m3 14 4-4 3 3 3-5 4 6"/></svg></button>' : ''}</div>`;
}

export function renderNotePage({ note, esc, icon, fullWidth = false, creating = false }) {
  const widthLabel = fullWidth ? '切换为标准宽度' : '切换为全宽';
  const favorite = isNoteFavorite(note), favoriteLabel = favorite ? '取消收藏' : '收藏笔记';
  return `<section ${creating ? 'data-note-creating' : ''} class="note-workspace ${fullWidth ? 'is-full-width' : ''}" aria-label="${creating ? '新建笔记' : `笔记编辑器：${esc(note.title)}`}">
    <h1 class="note-sr-only" tabindex="-1">笔记编辑器</h1>
    <header class="note-page-toolbar">
      <button class="note-back" data-action="${creating ? 'cancel-note-create' : 'close-drawer'}" aria-label="${creating ? '取消新建笔记' : '关闭笔记'}">${icon('back')}<span>返回工作区</span></button>
      <span class="note-location">${favorite ? '收藏夹' : '知识库'}<span>/</span>Markdown 文档</span>
      ${renderMarkdownTools(icon, true)}
      <div class="note-page-actions"><button type="button" class="icon-button note-favorite" data-action="toggle-note-favorite" aria-label="${favoriteLabel}" aria-pressed="${favorite}" title="${favoriteLabel}">${icon('star')}</button><button type="button" class="icon-button note-width-toggle" data-action="toggle-note-width" aria-label="${widthLabel}" aria-pressed="${fullWidth}" title="${widthLabel}">${icon('width')}</button>${creating ? '<button class="button small primary" data-action="create-note" aria-label="创建笔记"><span class="note-create-label-full">创建笔记</span><span class="note-create-label-short">创建</span></button>' : ''}<button class="button small subtle" data-action="export-note" aria-label="导出 .md">${icon('download')}<span>导出 .md</span></button></div>
    </header>
    <div class="note-document">
      <div class="note-document-heading"><input class="note-page-title" id="note-title" data-edit-note="title" value="${esc(note.title)}" placeholder="未命名笔记" maxlength="200" aria-label="笔记标题" required></div>
      <div class="note-paper note-live-paper"><div id="live-note-editor" class="live-note-editor"></div></div>
      <input id="note-image-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple hidden>
      ${creating ? '<p id="note-create-error" class="note-create-error" role="alert"></p>' : ''}
      <footer class="note-document-footer"><span>${icon('shield')}${creating ? '创建后自动保存' : '修改自动保存在本机'}</span><span id="note-word-count">${note.body.trim().length.toLocaleString('zh-CN')} 字</span>${creating ? '<button class="note-delete" data-action="cancel-note-create">取消</button>' : `<button class="note-delete" data-action="delete-note" data-id="${esc(note.id)}">${icon('trash')}删除笔记</button>`}</footer>
    </div>
  </section>`;
}

export function applyMarkdownFormat(editor, action) {
  const start = editor.selectionStart, end = editor.selectionEnd;
  const selected = editor.value.slice(start, end);
  const inline = { bold: ['**', '**', '加粗文字'], italic: ['*', '*', '斜体文字'], link: ['[', '](https://example.com)', '链接文字'] };
  let replacement, selectionStart = start, selectionEnd;
  if (inline[action]) {
    const [before, after, fallback] = inline[action];
    replacement = before + (selected || fallback) + after;
    selectionStart += before.length;
    selectionEnd = selectionStart + (selected || fallback).length;
  } else {
    const prefixes = { heading: '## ', quote: '> ', bullet: '- ', ordered: '1. ', task: '- [ ] ' };
    if (prefixes[action]) {
      replacement = (selected || '内容').split('\n').map((line, index) => (action === 'ordered' ? `${index + 1}. ` : prefixes[action]) + line).join('\n');
    } else if (action === 'code') replacement = '```\n' + (selected || '代码') + '\n```';
    else if (action === 'table') replacement = '| 标题 | 内容 |\n| --- | --- |\n| 项目 | 说明 |';
    else return false;
    if (start && editor.value[start - 1] !== '\n') replacement = '\n' + replacement;
    if (end < editor.value.length && editor.value[end] !== '\n') replacement += '\n';
    selectionEnd = start + replacement.length;
  }
  if (editor.value.length - (end - start) + replacement.length > editor.maxLength) return false;
  const scrollTop = editor.scrollTop;
  editor.setRangeText(replacement, start, end, 'select');
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(selectionStart, selectionEnd);
  editor.scrollTop = scrollTop;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

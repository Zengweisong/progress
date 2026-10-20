import { renderMarkdown } from './markdown.js';

const tools = [
  ['heading', '标题', 'H₂'], ['bold', '加粗', '<b>B</b>', 'Ctrl+B'],
  ['italic', '斜体', '<i>I</i>', 'Ctrl+I'], ['quote', '引用', '“'],
  ['bullet', '无序列表', '• ≡'], ['ordered', '有序列表', '1.'],
  ['task', '待办列表', '☑'], ['link', '插入链接', 'link', 'Ctrl+K'],
  ['code', '代码块', '&lt;/&gt;'], ['table', '插入表格', 'table'],
];

export function renderMarkdownTools(icon) {
  return `<div class="markdown-tools" role="group" aria-label="Markdown 格式">${tools.map(([action, label, glyph, shortcut]) => `<button type="button" data-md-action="${action}" aria-label="${label}" title="${label}${shortcut ? ` (${shortcut})` : ''}">${glyph === 'link' || glyph === 'table' ? icon(glyph) : `<span aria-hidden="true">${glyph}</span>`}</button>`).join('')}</div>`;
}

export function renderNotePage({ note, mode, esc, icon, categories, getProject }) {
  const editing = mode !== 'preview';
  const preview = mode !== 'edit';
  return `<section class="note-workspace" aria-label="笔记编辑器：${esc(note.title)}">
    <h1 class="note-sr-only" tabindex="-1">笔记编辑器</h1>
    <header class="note-page-toolbar">
      <button class="note-back" data-action="close-drawer" aria-label="关闭笔记">${icon('back')}<span>返回工作区</span></button>
      <span class="note-location">${note.inbox ? '收集箱' : '知识库'}<span>/</span>Markdown 文档</span>
      <div class="note-page-actions">${note.inbox ? `<button class="button small" data-action="organize-note" data-id="${esc(note.id)}">${icon('book')}移入知识库</button>` : ''}<button class="button small subtle" data-action="export-note">${icon('download')}<span>导出 .md</span></button></div>
    </header>
    <div class="note-document">
      <div class="note-document-heading"><input class="note-page-title" id="note-title" data-edit-note="title" value="${esc(note.title)}" maxlength="200" aria-label="笔记标题" required></div>
      <div class="note-properties">
        <label class="note-property" for="note-category"><span>分类</span><select id="note-category" data-edit-note="category">${categories.map(category => `<option value="${esc(category)}" ${note.category === category ? 'selected' : ''}>${esc(category || '未分类')}</option>`).join('')}</select></label>
        <label class="note-property note-tags-property" for="note-tags"><span>标签</span><input id="note-tags" data-edit-note="tags" maxlength="300" value="${esc(note.tags.join('，'))}" placeholder="添加标签，用逗号分隔"></label>
        <div class="note-property note-projects-property"><span>关联项目</span><div class="project-links">${note.projectIds.map(id => { const project = getProject(id); return project ? `<button class="project-link-chip" data-project="${esc(id)}">${icon(project.icon)}${esc(project.title)}</button>` : ''; }).join('')}<button class="note-link-project" data-action="link-projects" data-id="${esc(note.id)}" aria-label="关联">${icon('plus')}关联</button></div></div>
      </div>
      <div class="note-mode-bar"><span class="note-format-label">Markdown</span><div class="note-mode-tabs" role="group" aria-label="文档模式">${[['edit', '编辑'], ['split', '分屏预览'], ['preview', '阅读']].map(([value, label]) => `<button data-editor-mode="${value}" class="${mode === value ? 'active' : ''} ${value === 'split' ? 'note-split-toggle' : ''}" aria-pressed="${mode === value}">${label}</button>`).join('')}</div></div>
      <div class="note-paper ${mode === 'split' ? 'is-split' : ''} ${mode === 'preview' ? 'is-reading' : ''}">
        ${editing ? renderMarkdownTools(icon) : ''}
        <div class="note-panes">
          ${editing ? `<div class="note-source-pane"><div class="note-pane-label">MARKDOWN</div><textarea class="note-source" id="note-body" data-edit-note="body" aria-label="笔记正文" maxlength="200000" spellcheck="false" placeholder="从这里开始写作，支持 Markdown…">${esc(note.body)}</textarea></div>` : ''}
          ${preview ? `<div class="note-preview-pane"><div class="note-pane-label">${mode === 'split' ? '实时预览' : '阅读'}</div><article class="markdown note-markdown" id="note-preview">${renderMarkdown(note.body)}</article></div>` : ''}
        </div>
      </div>
      <footer class="note-document-footer"><span>${icon('shield')}修改自动保存在本机</span><span id="note-word-count">${note.body.trim().length.toLocaleString('zh-CN')} 字</span><button class="note-delete" data-action="delete-note" data-id="${esc(note.id)}">${icon('trash')}删除笔记</button></footer>
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

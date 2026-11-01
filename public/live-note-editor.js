import { EditorView, EditorState, StateField, EditorSelection, Transaction, Decoration, WidgetType, keymap, placeholder, drawSelection, history, historyKeymap, defaultKeymap, indentWithTab, isolateHistory, markdown, markdownKeymap, GFM, syntaxTree, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from './vendor/editor/codemirror.js';
import { persistAttachments } from './workspace-storage.js';
import { textMatches } from './workspace-search.js';
import { renderMarkdown } from './markdown.js';
import { imageSource, readNoteImage, MAX_NOTE_IMAGE_DATA } from './note-images.js';
import { installLineTools } from './editor-line-tools.js';

class Bullet extends WidgetType {
  toDOM() { const span = document.createElement('span'); span.className = 'cm-md-bullet'; span.textContent = '•'; return span; }
}
class Task extends WidgetType {
  constructor(from, checked) { super(); this.from = from; this.checked = checked; }
  eq(other) { return this.from === other.from && this.checked === other.checked; }
  toDOM(view) {
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = this.checked; input.tabIndex = -1; input.className = 'cm-md-task'; input.setAttribute('aria-label', '完成事项');
    input.addEventListener('change', () => view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert: input.checked ? 'x' : ' ' } })); return input;
  }
}
class ImagePreview extends WidgetType {
  constructor(src, alt, from, to) { super(); Object.assign(this, { src, alt, from, to }); }
  eq(other) { return this.src === other.src && this.alt === other.alt && this.from === other.from && this.to === other.to; }
  toDOM(view) {
    const figure = document.createElement('figure'); figure.className = 'cm-note-image';
    const image = document.createElement('img'); image.src = this.src; image.alt = this.alt; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.draggable = false;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `删除图片：${this.alt || '图片'}`);
    remove.addEventListener('click', event => { event.preventDefault(); view.dispatch({ changes: { from: this.from, to: this.to, insert: '' }, selection: { anchor: this.from }, userEvent: 'delete' }); view.focus(); });
    figure.append(image, remove);
    figure.addEventListener('click', event => { if (event.target === remove) return; view.dispatch({ selection: EditorSelection.range(this.from, this.to) }); view.focus(); });
    return figure;
  }
}
class TablePreview extends WidgetType {
  constructor(text, from, cells) { super(); Object.assign(this, { text, from, cells }); }
  eq(other) { return other.text === this.text && other.from === this.from; }
  updateDOM(element) {
    const preview = document.createElement('div'); preview.innerHTML = renderMarkdown(this.text);
    const cells = [...element.querySelectorAll('th,td')], next = [...preview.querySelectorAll('th,td')];
    if (cells.length !== next.length || element.querySelectorAll('tr').length !== preview.querySelectorAll('tr').length) return false;
    element.tableWidget = this;
    cells.forEach((cell, index) => {
      if (element.localEdit && cell === document.activeElement) return;
      if (cell.innerHTML === next[index].innerHTML) return;
      cell.innerHTML = next[index].innerHTML;
      if (cell === document.activeElement) { const selection = document.getSelection(); selection.selectAllChildren(cell); selection.collapseToEnd(); }
    });
    return true;
  }
  toDOM(view) {
    const element = document.createElement('div'); element.className = 'cm-note-table markdown'; element.innerHTML = renderMarkdown(this.text);
    element.tableWidget = this;
    const cells = [...element.querySelectorAll('th,td')];
    const commit = cell => {
      const range = element.tableWidget.cells[cell.parentElement.rowIndex]?.[cell.cellIndex]; if (!range) return;
      const text = cellMarkdown(cell);
      if (view.state.doc.sliceString(range.from, range.to) === text) return;
      const previous = view.state.doc;
      element.localEdit = true;
      try { view.dispatch({ changes: { from: range.from, to: range.to, insert: (range.prefix || '') + text + (range.suffix || '') }, userEvent: 'input' }); }
      finally { element.localEdit = false; }
      if (view.state.doc === previous) element.tableWidget.updateDOM(element);
    };
    cells.forEach((cell, index) => {
      cell.contentEditable = 'true'; cell.spellcheck = false; cell.setAttribute('role', 'textbox');
      cell.setAttribute('aria-label', `表格第 ${cell.parentElement.rowIndex + 1} 行第 ${cell.cellIndex + 1} 列`);
      cell.addEventListener('input', event => { if (!event.isComposing) commit(cell); });
      cell.addEventListener('compositionend', () => commit(cell));
      cell.addEventListener('beforeinput', event => { if (['insertParagraph', 'insertLineBreak'].includes(event.inputType)) event.preventDefault(); });
      cell.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
          event.preventDefault(); event.stopPropagation(); const selection = document.getSelection(), range = document.createRange();
          range.selectNodeContents(cell); selection.removeAllRanges(); selection.addRange(range); return;
        }
        const action = (event.ctrlKey || event.metaKey) && { b: 'bold', i: 'italic', k: 'link' }[event.key.toLowerCase()];
        if (action) { event.preventDefault(); event.stopPropagation(); formatTableCell(cell, action); }
        else if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
          event.preventDefault(); event.stopPropagation();
          view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, bubbles: true, cancelable: true }));
        } else if (event.key === 'Tab' || event.key === 'Enter' && !event.isComposing) {
          event.preventDefault(); const next = cells[index + (event.shiftKey ? -1 : 1)];
          if (next) next.focus();
          else { view.dispatch({ selection: { anchor: event.shiftKey ? element.tableWidget.from : element.tableWidget.from + element.tableWidget.text.length } }); view.focus(); }
        }
      });
      cell.addEventListener('paste', event => {
        event.preventDefault(); const selection = document.getSelection();
        if (!selection.rangeCount || !cell.contains(selection.anchorNode) || !cell.contains(selection.focusNode)) return;
        const range = selection.getRangeAt(0), text = document.createTextNode(event.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' '));
        range.deleteContents(); range.insertNode(text); range.setStartAfter(text); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); commit(cell);
      });
    });
    return element;
  }
}

function selectedTableCell(view) {
  const node = document.getSelection()?.anchorNode;
  const cell = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('.cm-note-table [contenteditable=true]');
  return cell && view.dom.contains(cell) ? cell : null;
}

function formatTableCell(cell, action) {
  const tag = { bold: 'strong', italic: 'em', link: 'a', code: 'code' }[action], selection = document.getSelection();
  if (!tag || !selection?.rangeCount || !cell.contains(selection.anchorNode) || !cell.contains(selection.focusNode)) return false;
  const range = selection.getRangeAt(0).cloneRange();
  const parent = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  if (parent.closest(tag) && cell.contains(parent.closest(tag))) return true;
  cell.focus({ preventScroll: true });
  const wrapper = document.createElement(tag); wrapper.append(range.extractContents());
  if (!wrapper.textContent) wrapper.textContent = action === 'link' ? '链接文字' : '内容';
  if (tag === 'a') { wrapper.href = 'https://example.com'; wrapper.target = '_blank'; wrapper.rel = 'noopener noreferrer'; }
  range.insertNode(wrapper); range.selectNodeContents(wrapper); selection.removeAllRanges(); selection.addRange(range);
  cell.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'format' }));
  return true;
}

function cellMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/[\\`*_[\]~|]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  const text = [...node.childNodes].map(cellMarkdown).join('');
  const markers = { B: '**', STRONG: '**', I: '*', EM: '*', S: '~~', DEL: '~~' };
  if (markers[node.nodeName]) return markers[node.nodeName] + text + markers[node.nodeName];
  if (node.nodeName === 'CODE') { const fence = '`'.repeat(Math.max(0, ...(node.textContent.match(/`+/g) || []).map(value => value.length)) + 1); return `${fence} ${node.textContent.replace(/\|/g, '\\|')} ${fence}`; }
  if (node.nodeName === 'A' && node.hasAttribute('href')) return `[${text}](${node.getAttribute('href').replace(/[()\s]/g, char => char === '(' ? '%28' : char === ')' ? '%29' : encodeURIComponent(char))})`;
  return node.nodeName === 'BR' ? ' ' : text;
}

function tableCells(node, state) {
  const rows = []; let width;
  for (let row = node.firstChild; row; row = row.nextSibling) {
    if (!['TableHeader', 'TableRow'].includes(row.name)) continue;
    const spans = []; let from = row.from;
    for (const pipe of row.getChildren('TableDelimiter')) { spans.push({ from, to: pipe.from }); from = pipe.to; }
    spans.push({ from, to: row.to });
    if (!state.doc.sliceString(spans[0].from, spans[0].to).trim()) spans.shift();
    if (spans.length && !state.doc.sliceString(spans.at(-1).from, spans.at(-1).to).trim()) spans.pop();
    width ??= spans.length;
    const cells = spans.slice(0, width).map(span => {
      const text = state.doc.sliceString(span.from, span.to);
      const start = span.from + text.length - text.trimStart().length;
      return { from: start, to: Math.max(start, span.to - (text.length - text.trimEnd().length)) };
    });
    const trailingPipe = state.doc.sliceString(row.to - 1, row.to) === '|';
    while (cells.length < width) {
      cells.push({ from: row.to, to: row.to, prefix: (trailingPipe ? ' ' : ' | ') + ' | '.repeat(cells.length - spans.length), suffix: trailingPipe ? ' |' : '' });
    }
    rows.push(cells);
  }
  return rows;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
function deleteFormatting(view, forward) {
  const { state } = view, selection = state.selection.main, pos = forward ? selection.from : selection.to;
  for (let node = syntaxTree(state).resolveInner(pos, forward ? 1 : -1); node; node = node.parent) {
    const marker = { StrongEmphasis: 'EmphasisMark', Emphasis: 'EmphasisMark', Strikethrough: 'StrikethroughMark', InlineCode: 'CodeMark', Link: 'LinkMark' }[node.name];
    if (!marker) continue;
    const delimiters = node.getChildren(marker), close = node.name === 'Link' ? delimiters.find(mark => state.doc.sliceString(mark.from, mark.to) === ']') : delimiters.at(-1);
    if (delimiters.length < 2 || !close) continue;
    const from = delimiters[0].to, to = close.from;
    const atStart = selection.empty && pos === from, atEnd = selection.empty && pos === to;
    const unwrap = forward ? atEnd : atStart;
    const content = state.doc.sliceString(from, to);
    const remove = !selection.empty && selection.from === from && selection.to === to ||
      (forward ? atStart : atEnd) && [...graphemes.segment(content)].length === 1;
    if (!unwrap && !remove) continue;
    const changes = remove ? [{ from: node.from, to: node.to }] : [{ from: node.from, to: from }, { from: to, to: node.to }];
    view.dispatch({ changes, selection: { anchor: remove ? node.from : pos - (from - node.from) }, userEvent: forward ? 'delete.forward' : 'delete.backward', scrollIntoView: true });
    return true;
  }
  return false;
}

function liveDecorations(state, attachments, input = null) {
  const marks = [], atomic = [], lineClasses = new Map(), formats = [], pending = [];
  const known = new Set(input?.previous.formats.map(node => `${node.name}:${input.changes.mapPos(node.from, 1)}`));
  const waiting = input?.previous.pending.map(node => ({ name: node.name, from: input.changes.mapPos(node.from, -1), to: input.changes.mapPos(node.to, 1) })) || [];
  const lineClass = (from, className) => { const pos = state.doc.lineAt(from).from; lineClasses.set(pos, `${lineClasses.get(pos) || ''} ${className}`); };
  const replace = (from, to, spec = {}) => { if (to > from) { const range = Decoration.replace(spec).range(from, to); marks.push(range); atomic.push(range); } };
  const hide = (from, to) => replace(from, to);
  syntaxTree(state).iterate({ enter(node) {
    const name = node.name, source = state.doc.sliceString(node.from, node.to);
    if (/^(ATXHeading[1-6]|Blockquote|FencedCode|StrongEmphasis|Emphasis|Strikethrough|InlineCode|Link|Image|Table|ListMark|TaskMarker)$/.test(name)) {
      formats.push({ name, from: node.from, to: node.to });
      const confirmed = input?.spaces.some(line => node.from <= line.to && node.to >= line.from);
      if (input && !confirmed && (waiting.some(range => range.from === node.from && range.name === name || range.from <= node.from && range.to >= node.to) || input.typing && !known.has(`${name}:${node.from}`))) {
        pending.push({ name, from: node.from, to: node.to });
        marks.push(Decoration.mark({ class: 'cm-md-pending' }).range(node.from, node.to)); return false;
      }
      if (/^ATXHeading/.test(name) && /^#{1,6}$/.test(source) || name === 'Blockquote' && /^>+$/.test(source)) return false;
    }
    if (name === 'Image') {
      const line = state.doc.lineAt(node.from), match = /^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)$/.exec(source);
      const src = match && imageSource(match[2], attachments);
      if (src && line.text.trim() === source) {
        // Keep CodeMirror's editable caret buffers around an image-only line.
        // A block replacement covering the entire document has no native text
        // insertion point, so select-all followed by typing would do nothing.
        const decoration = Decoration.replace({ widget: new ImagePreview(src, match[1], line.from, line.to) }).range(line.from, line.to);
        marks.push(decoration); atomic.push(decoration); return false;
      }
    }
    if (name === 'Table') {
      replace(node.from, node.to, { widget: new TablePreview(source, node.from, tableCells(node.node, state)), block: true }); return false;
    }
    if (/^ATXHeading[1-6]$/.test(name)) lineClass(node.from, `cm-md-heading cm-md-h${name.at(-1)}`);
    if (name === 'Blockquote') for (let line = state.doc.lineAt(node.from); line.from <= node.to; line = state.doc.line(line.number + 1)) { lineClass(line.from, 'cm-md-quote'); if (line.number === state.doc.lines) break; }
    if (name === 'FencedCode') for (let line = state.doc.lineAt(node.from); line.from <= node.to; line = state.doc.line(line.number + 1)) { lineClass(line.from, 'cm-md-code-line'); if (line.number === state.doc.lines) break; }
    const inline = { StrongEmphasis: 'cm-md-strong', Emphasis: 'cm-md-em', Strikethrough: 'cm-md-strike', InlineCode: 'cm-md-inline-code', Link: 'cm-md-link' };
    if (inline[name]) marks.push(Decoration.mark({ class: inline[name] }).range(node.from, node.to));
    if (name === 'Link') {
      const delimiters = node.node.getChildren('LinkMark'), close = delimiters.find(mark => state.doc.sliceString(mark.from, mark.to) === ']');
      if (close) { hide(node.from, delimiters[0].to); hide(close.from, node.to); }
    }
    if (name === 'HeaderMark' || name === 'QuoteMark') hide(node.from, Math.min(state.doc.lineAt(node.from).to, node.to + (state.doc.sliceString(node.to, node.to + 1) === ' ' ? 1 : 0)));
    else if (['EmphasisMark', 'StrikethroughMark', 'CodeMark', 'CodeInfo'].includes(name)) hide(node.from, node.to);
    else if (name === 'ListMark' && /^[-+*]$/.test(source)) {
      if (node.node.parent?.getChild('Task')) hide(node.from, node.to + 1);
      else replace(node.from, node.to, { widget: new Bullet() });
    }
    else if (name === 'TaskMarker') replace(node.from, node.to, { widget: new Task(node.from, /x/i.test(source)) });
  } });
  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    if (!line.length) lineClass(line.from, 'cm-md-emptyline');
  }
  for (const [from, className] of lineClasses) marks.push(Decoration.line({ class: className.trim() }).range(from));
  return { decorations: Decoration.set(marks, true), atomic: Decoration.set(atomic, true), formats, pending };
}

export function createLiveNoteEditor({ onChange, getNote, notify, contentId = 'note-body', label = '笔记正文', placeholderText = '从这里开始写作，输入 Markdown，或粘贴、拖入图片…', maxLength = 200000, allowImages = true, limitMessage = '笔记内容已达长度上限。', onFocus, onUndo }) {
  let view = null, noteId = null, alive = 0, importing = false, hydrating = false, lineTools = null;
  const field = StateField.define({
    create: state => liveDecorations(state, getNote(noteId)?.attachments || []),
    update(value, tr) {
      if (!tr.docChanged && syntaxTree(tr.startState) === syntaxTree(tr.state)) return value;
      // Confirm newly typed syntax with a space; existing and pasted Markdown
      // keeps its rendered presentation throughout ordinary edits.
      let typing = false, preservePending = tr.isUserEvent('delete') || tr.isUserEvent('input.type.compose') || !tr.docChanged; const spaces = [];
      tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        const text = inserted.toString();
        if (tr.isUserEvent('input.type') && fromA === toA) preservePending = true;
        if (tr.isUserEvent('input.type') && [...graphemes.segment(text)].length === 1) {
          typing = true;
          if (text === ' ' && !tr.isUserEvent('input.type.compose')) spaces.push(tr.state.doc.lineAt(toB));
        }
      });
      const previous = typing || preservePending ? value : { formats: value.formats, pending: [] };
      return liveDecorations(tr.state, getNote(noteId)?.attachments || [], { previous, changes: tr.changes, typing, spaces });
    },
    provide: field => EditorView.decorations.from(field, value => value.decorations),
  });
  function format(action) {
    if (!view) return false;
    const cell = selectedTableCell(view);
    if (cell) { if (!formatTableCell(cell, action)) notify('表格中可使用加粗、斜体、链接和行内代码。'); return true; }
    const { from, to } = view.state.selection.main, selected = view.state.doc.sliceString(from, to);
    const inline = { bold: ['**', '**', '加粗文字'], italic: ['*', '*', '斜体文字'], link: ['[', '](https://example.com)', '链接文字'] };
    let insert, anchor = from, head;
    if (inline[action]) {
      const [before, after, fallback] = inline[action]; insert = before + (selected || fallback) + after;
      anchor += before.length; head = anchor + (selected || fallback).length;
    } else {
      const prefix = { heading: '## ', quote: '> ', bullet: '- ', ordered: '1. ', task: '- [ ] ' }[action];
      if (prefix) insert = (selected || '内容').split('\n').map((line, i) => `${action === 'ordered' ? `${i + 1}. ` : prefix}${line}`).join('\n');
      else if (action === 'code') insert = '```\n' + (selected || '代码') + '\n```';
      else if (action === 'table') insert = '| 标题 | 内容 |\n| --- | --- |\n| 项目 | 说明 |';
      else return false;
      if (from && view.state.doc.sliceString(from - 1, from) !== '\n') insert = '\n' + insert;
      if (to < view.state.doc.length && view.state.doc.sliceString(to, to + 1) !== '\n') insert += '\n';
      head = from + insert.length;
    }
    view.dispatch({ changes: { from, to, insert }, selection: { anchor, head }, userEvent: 'input' }); view.focus(); return true;
  }
  async function images(files) {
    if (!allowImages || !view || importing || !files.length) return;
    const token = alive, targetId = noteId; importing = true;
    try {
      const assets = [];
      for (const file of files) assets.push(await readNoteImage(file));
      await persistAttachments({ notes: [{ attachments: assets }] });
      if (token !== alive || !view || targetId !== noteId) return;
      const note = getNote(targetId), current = note.attachments || [];
      if (current.length + assets.length > 50 || [...current, ...assets].reduce((total, asset) => total + asset.data.length, 0) > MAX_NOTE_IMAGE_DATA) throw new Error('这篇笔记的图片已达容量上限，请压缩图片后再插入。');
      const insert = assets.map(asset => `![${asset.name.replace(/[\[\]\\\r\n]/g, '').slice(0, 100)}](attachment:${asset.id})`).join('\n\n');
      const { from, to } = view.state.selection.main, prefix = from && view.state.doc.sliceString(from - 1, from) !== '\n' ? '\n\n' : '';
      if (view.state.doc.length - (to - from) + prefix.length + insert.length + 2 > maxLength) throw new Error(limitMessage);
      note.attachments = [...current, ...assets];
      view.dispatch({ changes: { from, to, insert: prefix + insert + '\n\n' }, selection: { anchor: from + prefix.length + insert.length + 2 }, userEvent: 'input' }); view.focus();
    } catch (error) { notify(error.message || '图片无法读取，请换一张图片。'); }
    finally { importing = false; }
  }
  function mount(parent, note) {
    if (view && noteId === note.id) {
      parent.append(view.dom);
      if (view.state.doc.toString() !== note.body) {
        hydrating = true;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: note.body }, annotations: Transaction.addToHistory.of(false) }); hydrating = false;
      }
      view.requestMeasure(); lineTools?.refresh(); return;
    }
    destroy(); noteId = note.id;
    view = new EditorView({ parent, state: EditorState.create({ doc: note.body, extensions: [
      markdown({ extensions: GFM }), history(), drawSelection(), bracketMatching(), syntaxHighlighting(defaultHighlightStyle), EditorView.lineWrapping,
      placeholder(placeholderText), field,
      EditorView.atomicRanges.of(view => view.state.field(field).atomic),
      EditorView.contentAttributes.of({ id: contentId, 'aria-label': label, spellcheck: 'false' }),
      keymap.of([{ key: 'Mod-z', run: () => onUndo?.() || false }, { key: 'Backspace', run: editor => deleteFormatting(editor, false) }, { key: 'Delete', run: editor => deleteFormatting(editor, true) }, { key: 'Mod-b', run: () => format('bold') }, { key: 'Mod-i', run: () => format('italic') }, { key: 'Mod-k', run: () => format('link') }, ...markdownKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorState.changeFilter.of(tr => { if (tr.newDoc.length <= maxLength) return true; queueMicrotask(() => notify(limitMessage)); return false; }),
      EditorView.updateListener.of(update => { if (update.docChanged && !hydrating) onChange(noteId, update.state.doc.toString()); lineTools?.refresh(); }),
      EditorView.domEventHandlers({
        beforeinput: (event, editor) => {
          if (event.target !== editor.contentDOM || event.isComposing || event.data === null || !['insertText', 'insertReplacementText'].includes(event.inputType)) return false;
          const selection = document.getSelection(), current = editor.state.selection.main;
          if (!selection?.rangeCount || !editor.contentDOM.contains(selection.anchorNode) || !editor.contentDOM.contains(selection.focusNode)) return false;
          const anchor = editor.posAtDOM(selection.anchorNode, selection.anchorOffset), head = editor.posAtDOM(selection.focusNode, selection.focusOffset);
          const from = current.empty ? Math.min(anchor, head) : current.from, to = current.empty ? Math.max(anchor, head) : current.to;
          if (from === to) return false;
          // Native replacement can leave non-editable block widgets behind.
          event.preventDefault();
          editor.dispatch({ changes: { from, to, insert: event.data }, selection: { anchor: from + event.data.length }, userEvent: 'input.type' });
          return true;
        },
        click: (event, editor) => {
          if (!event.ctrlKey && !event.metaKey) return false;
          const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY }); if (pos === null) return false;
          let node = syntaxTree(editor.state).resolveInner(pos, 1);
          while (node && node.name !== 'Link') node = node.parent;
          const url = node?.getChild('URL'), href = url && editor.state.doc.sliceString(url.from, url.to);
          if (href && /^https?:\/\//i.test(href)) { event.preventDefault(); window.open(href, '_blank', 'noopener,noreferrer'); return true; }
          return false;
        },
        // Flush CodeMirror's deferred focus update before a browser selection
        // (such as select-all) can be overwritten by its cached selection.
        focus: (_, editor) => { editor.dispatch({}); onFocus?.(); },
        blur: (_, editor) => { editor.dispatch({}); },
        focusin: (event, editor) => { if (event.target !== editor.contentDOM) onFocus?.(); },
        paste: event => { const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/')); if (!allowImages || !files.length) return false; event.preventDefault(); void images(files); return true; },
        dragover: event => { if (allowImages && [...(event.dataTransfer?.types || [])].includes('Files')) { event.preventDefault(); return true; } return false; },
        drop: (event, editor) => { const files = [...(event.dataTransfer?.files || [])]; if (!allowImages || !files.length) return false; event.preventDefault(); const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY }); if (pos !== null) editor.dispatch({ selection: { anchor: pos } }); void images(files); return true; },
      }),
    ] }) });
    if (contentId === 'note-body') lineTools = installLineTools(view);
  }
  function destroy() { alive++; lineTools?.destroy(); lineTools = null; view?.destroy(); view = null; noteId = null; }
  function focusMatch(query) {
    if (!view || !query) return;
    const match = textMatches(view.state.doc.toString(), query).next().value;
    if (match) view.dispatch({ selection: { anchor: match.from, head: match.to }, scrollIntoView: true });
    view.focus();
  }
  function setSelection(selection) {
    if (!view || !selection) return;
    const length = view.state.doc.length;
    view.dispatch({ selection: EditorSelection.create(selection.ranges.map(range => EditorSelection.range(Math.min(range.anchor, length), Math.min(range.head, length))), selection.mainIndex) });
  }
  function focus() {
    if (!view) return;
    view.focus();
    // Reparenting can reset the browser range while CodeMirror retains its
    // cached range. Restore the actual DOM range before its next observation.
    const { anchor, head } = view.state.selection.main, from = view.domAtPos(anchor), to = view.domAtPos(head);
    view.contentDOM.ownerDocument.getSelection()?.setBaseAndExtent(from.node, from.offset, to.node, to.offset);
  }
  return { mount, destroy, format, images, focusMatch, setSelection, getSelection: () => view?.state.selection, focus, isolateUndo: () => view?.dispatch({ annotations: isolateHistory.of('full') }), isBusy: () => importing || Boolean(lineTools?.isDragging()) };
}

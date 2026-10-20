import { EditorView, EditorState, StateField, StateEffect, EditorSelection, Transaction, Decoration, WidgetType, keymap, placeholder, drawSelection, history, historyKeymap, defaultKeymap, indentWithTab, markdown, markdownKeymap, GFM, syntaxTree, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from './vendor/editor/codemirror.js';
import { renderMarkdown } from './markdown.js';
import { imageSource, readNoteImage, MAX_NOTE_IMAGE_DATA } from './note-images.js';

const focusEffect = StateEffect.define();
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
  constructor(text, from) { super(); this.text = text; this.from = from; }
  eq(other) { return other.text === this.text && other.from === this.from; }
  toDOM(view) {
    const element = document.createElement('div'); element.className = 'cm-note-table markdown'; element.innerHTML = renderMarkdown(this.text);
    element.addEventListener('click', () => { view.dispatch({ selection: { anchor: this.from } }); view.focus(); }); return element;
  }
}

function liveDecorations(state, focused, attachments) {
  const marks = [], atomic = [], lineClasses = new Map();
  const active = state.selection.ranges.map(range => [state.doc.lineAt(range.from).from, state.doc.lineAt(range.to).to]);
  const editing = (from, to) => focused && active.some(([a, b]) => from <= b && to >= a);
  const lineClass = (from, className) => { const pos = state.doc.lineAt(from).from; lineClasses.set(pos, `${lineClasses.get(pos) || ''} ${className}`); };
  const hide = (from, to) => { if (to > from) marks.push(Decoration.replace({}).range(from, to)); };
  syntaxTree(state).iterate({ enter(node) {
    const name = node.name, source = state.doc.sliceString(node.from, node.to);
    if (name === 'Image') {
      const line = state.doc.lineAt(node.from), match = /^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)$/.exec(source);
      const src = match && imageSource(match[2], attachments);
      if (src && line.text.trim() === source) {
        const decoration = Decoration.replace({ widget: new ImagePreview(src, match[1], line.from, line.to), block: true }).range(line.from, line.to);
        marks.push(decoration); atomic.push(decoration); return false;
      }
    }
    if (name === 'Table' && !editing(node.from, node.to)) {
      marks.push(Decoration.replace({ widget: new TablePreview(source, node.from), block: true }).range(node.from, node.to)); return false;
    }
    if (/^ATXHeading[1-6]$/.test(name)) lineClass(node.from, `cm-md-heading cm-md-h${name.at(-1)}`);
    if (name === 'Blockquote') for (let line = state.doc.lineAt(node.from); line.from <= node.to; line = state.doc.line(line.number + 1)) { lineClass(line.from, 'cm-md-quote'); if (line.number === state.doc.lines) break; }
    if (name === 'FencedCode') for (let line = state.doc.lineAt(node.from); line.from <= node.to; line = state.doc.line(line.number + 1)) { lineClass(line.from, 'cm-md-code-line'); if (line.number === state.doc.lines) break; }
    const inline = { StrongEmphasis: 'cm-md-strong', Emphasis: 'cm-md-em', Strikethrough: 'cm-md-strike', InlineCode: 'cm-md-inline-code', Link: 'cm-md-link' };
    if (inline[name]) marks.push(Decoration.mark({ class: inline[name] }).range(node.from, node.to));
    if (editing(node.from, node.to)) return;
    if (name === 'HeaderMark' || name === 'QuoteMark') hide(node.from, Math.min(state.doc.lineAt(node.from).to, node.to + (state.doc.sliceString(node.to, node.to + 1) === ' ' ? 1 : 0)));
    else if (['EmphasisMark', 'StrikethroughMark', 'CodeMark', 'CodeInfo'].includes(name)) hide(node.from, node.to);
    else if ((name === 'LinkMark' || name === 'URL' || name === 'LinkTitle') && node.node.parent?.name === 'Link') hide(node.from, node.to);
    else if (name === 'ListMark' && /^[-+*]$/.test(source)) {
      if (node.node.parent?.getChild('Task')) hide(node.from, node.to + 1);
      else marks.push(Decoration.replace({ widget: new Bullet() }).range(node.from, node.to));
    }
    else if (name === 'TaskMarker') marks.push(Decoration.replace({ widget: new Task(node.from, /x/i.test(source)) }).range(node.from, node.to));
  } });
  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    if (!line.length && !editing(line.from, line.to)) lineClass(line.from, 'cm-md-emptyline');
  }
  for (const [from, className] of lineClasses) marks.push(Decoration.line({ class: className.trim() }).range(from));
  return { decorations: Decoration.set(marks, true), atomic: Decoration.set(atomic, true), focused };
}

export function createLiveNoteEditor({ onChange, getNote, notify }) {
  let view = null, noteId = null, alive = 0, importing = false, hydrating = false;
  const field = StateField.define({
    create: state => liveDecorations(state, false, getNote(noteId)?.attachments || []),
    update(value, tr) {
      let focused = value.focused;
      for (const effect of tr.effects) if (effect.is(focusEffect)) focused = effect.value;
      return tr.docChanged || tr.selection || focused !== value.focused || syntaxTree(tr.startState) !== syntaxTree(tr.state) ? liveDecorations(tr.state, focused, getNote(noteId)?.attachments || []) : value;
    },
    provide: field => EditorView.decorations.from(field, value => value.decorations),
  });
  function format(action) {
    if (!view) return false;
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
    if (!view || importing || !files.length) return;
    const token = alive, targetId = noteId; importing = true;
    try {
      const assets = [];
      for (const file of files) assets.push(await readNoteImage(file));
      if (token !== alive || !view || targetId !== noteId) return;
      const note = getNote(targetId), current = note.attachments || [];
      if (current.length + assets.length > 50 || [...current, ...assets].reduce((total, asset) => total + asset.data.length, 0) > MAX_NOTE_IMAGE_DATA) throw new Error('这篇笔记的图片已达容量上限，请压缩图片后再插入。');
      const insert = assets.map(asset => `![${asset.name.replace(/[\[\]\\\r\n]/g, '').slice(0, 100)}](attachment:${asset.id})`).join('\n\n');
      const { from, to } = view.state.selection.main, prefix = from && view.state.doc.sliceString(from - 1, from) !== '\n' ? '\n\n' : '';
      if (view.state.doc.length - (to - from) + prefix.length + insert.length + 2 > 200000) throw new Error('笔记内容已达长度上限。');
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
      view.requestMeasure(); return;
    }
    destroy(); noteId = note.id;
    view = new EditorView({ parent, state: EditorState.create({ doc: note.body, extensions: [
      markdown({ extensions: GFM }), history(), drawSelection(), bracketMatching(), syntaxHighlighting(defaultHighlightStyle), EditorView.lineWrapping,
      placeholder('从这里开始写作，输入 Markdown，或粘贴、拖入图片…'), field,
      EditorView.atomicRanges.of(view => view.state.field(field).atomic),
      EditorView.contentAttributes.of({ id: 'note-body', 'aria-label': '笔记正文', spellcheck: 'false' }),
      keymap.of([{ key: 'Mod-b', run: () => format('bold') }, { key: 'Mod-i', run: () => format('italic') }, { key: 'Mod-k', run: () => format('link') }, ...markdownKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorState.changeFilter.of(tr => { if (tr.newDoc.length <= 200000) return true; queueMicrotask(() => notify('笔记内容已达长度上限。')); return false; }),
      EditorView.updateListener.of(update => { if (update.docChanged && !hydrating) onChange(noteId, update.state.doc.toString()); }),
      EditorView.domEventHandlers({
        click: (event, editor) => {
          if (!event.ctrlKey && !event.metaKey) return false;
          const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY }); if (pos === null) return false;
          let node = syntaxTree(editor.state).resolveInner(pos, 1);
          while (node && node.name !== 'Link') node = node.parent;
          const url = node?.getChild('URL'), href = url && editor.state.doc.sliceString(url.from, url.to);
          if (href && /^https?:\/\//i.test(href)) { event.preventDefault(); window.open(href, '_blank', 'noopener,noreferrer'); return true; }
          return false;
        },
        focus: (_, view) => { view.dispatch({ effects: focusEffect.of(true) }); },
        blur: (_, view) => { view.dispatch({ effects: focusEffect.of(false) }); },
        paste: event => { const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/')); if (!files.length) return false; event.preventDefault(); void images(files); return true; },
        dragover: event => { if ([...(event.dataTransfer?.types || [])].includes('Files')) { event.preventDefault(); return true; } return false; },
        drop: (event, editor) => { const files = [...(event.dataTransfer?.files || [])]; if (!files.length) return false; event.preventDefault(); const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY }); if (pos !== null) editor.dispatch({ selection: { anchor: pos } }); void images(files); return true; },
      }),
    ] }) });
  }
  function destroy() { alive++; view?.destroy(); view = null; noteId = null; }
  return { mount, destroy, format, images, isBusy: () => importing };
}

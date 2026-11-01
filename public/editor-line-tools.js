import { syntaxTree, isolateHistory } from './vendor/editor/codemirror.js';

function blocks(state) {
  const groups = new Map();
  syntaxTree(state).iterate({ enter(node) {
    if (!['Table', 'FencedCode', 'Blockquote', 'ListItem'].includes(node.name)) return;
    const first = state.doc.lineAt(node.from), last = state.doc.lineAt(Math.max(node.from, node.to - 1));
    groups.set(first.number, { last: last.number, kind: node.name }); return false;
  } });
  const result = [];
  for (let number = 1; number <= state.doc.lines; number++) {
    const group = groups.get(number), first = state.doc.line(number), last = state.doc.line(group?.last || number);
    result.push({ from: first.from, to: last.to, number, kind: group?.kind || 'line' }); number = last.number;
  }
  return result;
}

const styles = [
  ['text', '正文', ''], ['h1', '标题 1', '# '], ['h2', '标题 2', '## '], ['h3', '标题 3', '### '],
  ['bullet', '无序列表', '- '], ['ordered', '有序列表', '1. '], ['task', '待办事项', '- [ ] '], ['quote', '引用', '> '], ['code', '代码块', null],
];

export function installLineTools(view) {
  const rail = document.createElement('div'); rail.className = 'note-line-tools'; rail.contentEditable = 'false';
  view.dom.classList.add('has-line-tools'); view.dom.append(rail);
  let menu = null, drag = null, frame = null, destroyed = false;
  const indicator = document.createElement('div'); indicator.className = 'note-line-drop'; indicator.hidden = true; view.dom.append(indicator);
  const rootTop = () => view.dom.getBoundingClientRect().top;
  const top = block => view.lineBlockAt(block.from).top + view.documentTop - rootTop();
  function closeMenu(restore = false) {
    const from = menu?.from; menu?.element.remove(); menu = null;
    if (restore) rail.querySelector(`[data-line-from="${from}"]`)?.focus();
  }
  function change(doc, text, anchor, event) {
    if (view.state.doc !== doc || text === doc.toString()) return;
    closeMenu();
    view.dispatch({ changes: { from: 0, to: doc.length, insert: text }, selection: { anchor }, userEvent: event, annotations: isolateHistory.of('full'), scrollIntoView: true });
    view.focus();
  }
  function move(doc, items, index, boundary) {
    if (boundary === index || boundary === index + 1) return;
    const texts = items.map(item => doc.sliceString(item.from, item.to)), [text] = texts.splice(index, 1);
    const target = boundary > index ? boundary - 1 : boundary; texts.splice(target, 0, text);
    const anchor = texts.slice(0, target).reduce((sum, item) => sum + item.length + 1, 0);
    change(doc, texts.join('\n'), anchor, 'move.line');
  }
  function style(block, name, prefix, doc) {
    if (view.state.doc !== doc) { closeMenu(); return; }
    let text = doc.sliceString(block.from, block.to);
    if (block.kind === 'FencedCode') text = text.split('\n').slice(1, /^\s*(`{3,}|~{3,})\s*$/.test(text.split('\n').at(-1)) ? -1 : undefined).join('\n');
    else text = text.replace(/^(\s*)(?:#{1,6}\s+|>\s*|(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?)/gm, '$1');
    const replacement = name === 'code' ? '```\n' + text + '\n```' : text.split('\n').map(line => prefix + line).join('\n');
    change(doc, doc.sliceString(0, block.from) + replacement + doc.sliceString(block.to), block.from + (prefix?.length || 0), 'input.line-style');
  }
  function openMenu(button, block) {
    closeMenu(); const doc = view.state.doc, items = blocks(view.state), index = items.findIndex(item => item.from === block.from);
    const element = document.createElement('div'); element.className = 'note-line-menu'; element.setAttribute('role', 'menu'); element.setAttribute('aria-label', '行样式和排序');
    const add = (label, run, disabled = false) => {
      const item = document.createElement('button'); item.type = 'button'; item.setAttribute('role', 'menuitem'); item.textContent = label; item.disabled = disabled;
      item.addEventListener('click', () => { run(); closeMenu(); }); element.append(item);
    };
    if (block.kind !== 'Table') for (const [name, label, prefix] of styles) add(label, () => style(block, name, prefix, doc));
    add('上移', () => move(doc, items, index, index - 1), index === 0);
    add('下移', () => move(doc, items, index, index + 2), index === items.length - 1);
    menu = { element, from: block.from }; document.body.append(element);
    const box = button.getBoundingClientRect(), size = element.getBoundingClientRect();
    element.style.left = Math.max(8, Math.min(box.left, innerWidth - size.width - 8)) + 'px';
    element.style.top = Math.max(8, Math.min(box.bottom + 4, innerHeight - size.height - 8)) + 'px';
    element.addEventListener('keydown', event => {
      const options = [...element.querySelectorAll('button:not(:disabled)')], index = options.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(true); }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); options[(index + options.length + (event.key === 'ArrowDown' ? 1 : -1)) % options.length].focus(); }
    });
    element.querySelector('button:not(:disabled)')?.focus();
  }
  function refresh() {
    if (destroyed) return;
    view.requestMeasure({ key: rail, read: () => {
      const items = blocks(view.state);
      return items.filter(block => block.to >= view.viewport.from && block.from <= view.viewport.to).map(block => {
        const line = view.state.doc.lineAt(block.from), prefix = /^(?:#{1,6}\s+|>\s*|(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?)/.exec(line.text);
        const caret = view.coordsAtPos(block.from + (prefix?.[0].length || 0));
        return { block, y: caret ? caret.top - rootTop() + (caret.bottom - caret.top - 24) / 2 : top(block) };
      });
    }, write: rows => {
      if (destroyed || drag) return;
      const focused = document.activeElement?.dataset.lineFrom;
      rail.replaceChildren();
      for (const { block, y } of rows) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'note-line-handle'; button.dataset.lineFrom = block.from;
        button.setAttribute('aria-label', `第 ${block.number} 行：拖动或修改样式`); button.title = '拖动排序 · 点击修改样式 · Alt + ↑/↓ 移动'; button.setAttribute('aria-haspopup', 'menu');
        button.innerHTML = '<svg viewBox="0 0 16 20" aria-hidden="true"><g fill="currentColor"><circle cx="5" cy="5" r="1.3"/><circle cx="11" cy="5" r="1.3"/><circle cx="5" cy="10" r="1.3"/><circle cx="11" cy="10" r="1.3"/><circle cx="5" cy="15" r="1.3"/><circle cx="11" cy="15" r="1.3"/></g></svg>';
        button.style.top = y + 'px';
        button.addEventListener('click', event => { event.preventDefault(); if (!button.suppressClick) openMenu(button, block); button.suppressClick = false; });
        button.addEventListener('keydown', event => {
          if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation(); const items = blocks(view.state), index = items.findIndex(item => item.from === block.from);
          if (event.key === 'ArrowUp' && index > 0) move(view.state.doc, items, index, index - 1);
          if (event.key === 'ArrowDown' && index < items.length - 1) move(view.state.doc, items, index, index + 2);
        });
        button.addEventListener('pointerdown', event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation(); closeMenu();
          const items = blocks(view.state);
          drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, lastY: event.clientY, doc: view.state.doc, items, index: items.findIndex(item => item.from === block.from), boundary: null, button, active: false };
        });
        rail.append(button); if (focused === button.dataset.lineFrom) button.focus({ preventScroll: true });
      }
    } });
  }
  function track(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (view.state.doc !== drag.doc) { finish(event, true); return; }
    drag.lastY = event.clientY;
    if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    event.preventDefault(); drag.active = true; drag.button.suppressClick = true; view.dom.classList.add('is-line-dragging');
    let boundary = drag.items.length;
    for (let index = 0; index < drag.items.length; index++) {
      const block = drag.items[index], box = view.lineBlockAt(block.from);
      if (event.clientY < rootTop() + top(block) + box.height / 2) { boundary = index; break; }
    }
    drag.boundary = boundary; indicator.hidden = false;
    const last = drag.items.at(-1);
    indicator.style.top = (boundary < drag.items.length ? top(drag.items[boundary]) : top(last) + view.lineBlockAt(last.from).height) + 'px';
    if (!frame) frame = requestAnimationFrame(scroll);
  }
  function scroll() {
    frame = null; if (!drag?.active) return;
    const delta = drag.lastY < 60 ? -12 : drag.lastY > innerHeight - 60 ? 12 : 0;
    if (delta) { window.scrollBy(0, delta); track({ pointerId: drag.pointer, clientX: drag.x, clientY: drag.lastY, preventDefault() {} }); }
  }
  function finish(event, cancel = false) {
    if (!drag || event.pointerId !== undefined && event.pointerId !== drag.pointer) return;
    const current = drag; drag = null; if (frame) cancelAnimationFrame(frame); frame = null;
    indicator.hidden = true; view.dom.classList.remove('is-line-dragging');
    if (current.active && !cancel && current.boundary !== null) move(current.doc, current.items, current.index, current.boundary);
    refresh();
  }
  const up = event => finish(event), cancel = event => finish(event, true);
  const outside = event => { if (menu && !menu.element.contains(event.target) && !rail.contains(event.target)) closeMenu(); };
  const escape = event => { if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finish(event, true); } };
  const onScroll = () => { closeMenu(); refresh(); };
  document.addEventListener('pointermove', track, { passive: false }); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', cancel);
  document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true); window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', onScroll);
  refresh();
  return { refresh, isDragging: () => Boolean(drag), destroy() {
    destroyed = true; closeMenu(); if (frame) cancelAnimationFrame(frame); rail.remove(); indicator.remove(); view.dom.classList.remove('has-line-tools');
    document.removeEventListener('pointermove', track); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel);
    document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll);
  } };
}

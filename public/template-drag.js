export function installTemplateDrag({ commit, canStart }) {
  let gesture = null, frame = 0, suppressed = null;
  const handleAt = event => event.target.closest('[data-template-drag]');
  const clear = () => document.querySelectorAll('.template-drop-before,.template-drop-after').forEach(node => node.classList.remove('template-drop-before', 'template-drop-after'));
  function paint() {
    const g = gesture; if (!g?.dragging) return;
    clear(); g.drop = null;
    g.ghost.style.transform = `translate(${g.x + 12}px, ${g.y + 12}px)`;
    const target = document.elementFromPoint(g.x, g.y)?.closest('[data-common-template]');
    if (!target || target === g.card || target.parentElement !== g.grid || target.closest('[inert]')) return;
    const cards = [...g.grid.querySelectorAll(':scope > [data-common-template]')].filter(node => node !== g.card);
    const bounds = target.getBoundingClientRect(), after = g.x >= bounds.left + bounds.width / 2;
    g.drop = { id: g.id, beforeId: (after ? cards[cards.indexOf(target) + 1] : target)?.dataset.commonTemplate ?? null };
    target.classList.add(after ? 'template-drop-after' : 'template-drop-before');
  }
  function tick() {
    const g = gesture; if (!g?.dragging) return;
    const viewport = g.card.closest('.modal') || document.scrollingElement;
    const bounds = g.card.closest('.modal')?.getBoundingClientRect() || { top: 0, bottom: innerHeight };
    if (g.y < bounds.top + 35) viewport.scrollTop -= 8;
    if (g.y > bounds.bottom - 35) viewport.scrollTop += 8;
    paint(); frame = requestAnimationFrame(tick);
  }
  function finish(save) {
    const g = gesture; if (!g) return;
    gesture = null; cancelAnimationFrame(frame); clear(); g.ghost?.remove(); g.card.classList.remove('is-template-dragging');
    if (g.handle.hasPointerCapture(g.pointerId)) g.handle.releasePointerCapture(g.pointerId);
    if (!g.dragging) return;
    suppressed = g.pointerId; setTimeout(() => { suppressed = null; }, 0);
    if (save && g.drop) commit(g.drop);
  }
  document.addEventListener('pointerdown', event => {
    const handle = handleAt(event);
    if (!handle || handle.closest('[inert]') || !event.isPrimary || event.button !== 0 || gesture || !canStart()) return;
    const card = handle.closest('[data-common-template]');
    gesture = { handle, card, grid: card.parentElement, id: handle.dataset.templateDrag, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY };
    handle.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', event => {
    const g = gesture; if (!g || event.pointerId !== g.pointerId) return;
    g.x = event.clientX; g.y = event.clientY;
    if (!g.dragging) {
      if (Math.hypot(g.x - g.startX, g.y - g.startY) < 7) return;
      g.dragging = true; g.card.classList.add('is-template-dragging');
      g.ghost = document.createElement('div'); g.ghost.className = 'template-drag-ghost'; g.ghost.textContent = g.card.querySelector('strong').textContent;
      g.ghost.setAttribute('aria-hidden', 'true'); document.body.append(g.ghost); frame = requestAnimationFrame(tick);
    }
    event.preventDefault(); paint();
  }, { passive: false });
  document.addEventListener('pointerup', event => { if (gesture?.pointerId === event.pointerId) { if (gesture.dragging) { gesture.x = event.clientX; gesture.y = event.clientY; paint(); } finish(true); } });
  document.addEventListener('pointercancel', event => { if (gesture?.pointerId === event.pointerId) finish(false); });
  document.addEventListener('lostpointercapture', event => { if (gesture?.pointerId === event.pointerId) finish(false); });
  document.addEventListener('click', event => { if (event.pointerId === suppressed) { event.preventDefault(); event.stopImmediatePropagation(); suppressed = null; } }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gesture) { event.preventDefault(); event.stopImmediatePropagation(); finish(false); return; }
    const handle = handleAt(event);
    if (!handle || !event.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || !canStart()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const cards = [...handle.closest('.note-template-grid').querySelectorAll(':scope > [data-common-template]')];
    const from = cards.indexOf(handle.closest('[data-common-template]')), to = from + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1);
    if (to >= 0 && to < cards.length) commit({ id: handle.dataset.templateDrag, beforeId: (to < from ? cards[to] : cards[to + 1])?.dataset.commonTemplate ?? null });
  }, true);
  window.addEventListener('blur', () => finish(false)); window.addEventListener('hashchange', () => finish(false));
  return { isDragging: () => Boolean(gesture) };
}

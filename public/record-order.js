import { categoryNames, categoryRecords, categoryField } from './categories.js';

export function orderedRecords(records) {
  return records.map((record, index) => ({ record, index })).sort((a, b) => (a.record.order ?? a.index) - (b.record.order ?? b.index) || a.index - b.index).map(item => item.record);
}

export function moveRecord(data, { section, id, category, beforeId = null, visibleIds }, timestamp) {
  if (!['projects', 'knowledge', 'inbox'].includes(section)) return false;
  const records = categoryRecords(data, section).filter(record => !record.archived);
  const record = records.find(item => item.id === id);
  if (!record || beforeId === id) return false;
  if (category !== undefined && category !== '' && !categoryNames(data, section).includes(category)) return false;
  let ordered = orderedRecords(records), hiddenSlots = null, visibleSet = null;
  if (visibleIds) {
    const ids = new Set(visibleIds), visible = visibleIds.map(id => records.find(item => item.id === id));
    if (ids.size !== visibleIds.length || visible.some(item => !item) || !ids.has(id) || (beforeId && !ids.has(beforeId))) return false;
    hiddenSlots = ordered; visibleSet = ids; ordered = visible;
  }
  const field = categoryField(section), targetCategory = category ?? record[field];
  const before = beforeId && ordered.find(item => item.id === beforeId);
  if (beforeId && (!before || (category !== undefined && before[field] !== targetCategory))) return false;
  const previous = ordered.map(item => item.id), previousCategory = record[field];
  ordered = ordered.filter(item => item !== record);
  let index;
  if (before) index = ordered.indexOf(before);
  else if (visibleIds) {
    const visible = new Set(visibleIds), last = ordered.findLastIndex(item => visible.has(item.id)); index = last + 1;
  } else { const last = ordered.findLastIndex(item => item[field] === targetCategory); index = last < 0 ? ordered.length : last + 1; }
  ordered.splice(index, 0, record);
  if (previousCategory === targetCategory && previous.every((id, i) => id === ordered[i].id) && (!visibleIds || data.preferences.sort === 'manual')) return false;
  if (hiddenSlots) { const visible = ordered; let slot = 0; ordered = hiddenSlots.map(item => visibleSet.has(item.id) ? visible[slot++] : item); }
  record[field] = targetCategory;
  ordered.forEach((item, order) => { if (item.order !== order || (item === record && previousCategory !== targetCategory)) { item.order = order; item.updatedAt = timestamp; } });
  if (section === 'projects') data.preferences.sort = 'manual';
  return true;
}

export function moveCategory(data, section, name, beforeName, timestamp, makeId = () => crypto.randomUUID()) {
  if (!['projects', 'knowledge', 'inbox'].includes(section)) return false;
  const names = categoryNames(data, section), from = names.indexOf(name);
  if (from < 0 || beforeName === name || (beforeName !== null && !names.includes(beforeName))) return false;
  const next = names.filter(item => item !== name); next.splice(beforeName === null ? next.length : next.indexOf(beforeName), 0, name);
  if (next.every((name, index) => name === names[index])) return false;
  const missing = names.filter(name => !data.folders.some(folder => folder.section === section && folder.name === name && !folder.uncategorizedHidden));
  if (data.folders.length + missing.length > 300) throw new Error('分类数量已达上限，请先整理分类。');
  for (const name of missing) data.folders.push({ id: makeId(), section, name, updatedAt: timestamp });
  next.forEach((name, order) => { for (const folder of data.folders) if (folder.section === section && folder.name === name && !folder.uncategorizedHidden && folder.order !== order) { folder.order = order; folder.updatedAt = timestamp; } });
  return true;
}

export function installRecordDrag({ commit, announce, canStart = () => true }) {
  let gesture = null, frame = 0, suppressed = null;
  const source = event => event.target.closest('[data-record-drag]');
  const valid = element => element && !element.closest('[inert]');
  function clear() { document.querySelectorAll('.record-drop-before,.record-drop-after,.record-drop-inside').forEach(el => el.classList.remove('record-drop-before', 'record-drop-after', 'record-drop-inside')); }
  function paint() {
    const g = gesture; if (!g?.dragging) return;
    g.ghost.style.transform = `translate(${g.x - g.offsetX}px, ${g.y - g.offsetY}px)`;
    clear(); g.drop = null;
    const hit = document.elementFromPoint(g.x, g.y); if (!valid(hit)) return;
    const category = hit.closest('[data-order-category]');
    if (g.kind === 'category') {
      if (!category?.dataset.orderCategory || category.dataset.orderSection !== g.section || category.dataset.orderCategory === g.id) return;
      const siblings = [...category.parentElement.children].filter(el => el.dataset.orderCategory && el.dataset.orderCategory !== g.id);
      const bounds = category.querySelector('.nav-category-row').getBoundingClientRect(), after = g.y >= bounds.top + bounds.height / 2;
      const next = after ? siblings[siblings.indexOf(category) + 1] : category;
      g.drop = { kind: 'category', section: g.section, id: g.id, beforeName: next?.dataset.orderCategory ?? null };
      category.querySelector('.nav-category-row').classList.add(after ? 'record-drop-after' : 'record-drop-before');
    } else {
      const zone = hit.closest('[data-record-zone]'), home = hit.closest('[data-home-project]'), card = hit.closest('[data-order-note]');
      if (zone?.dataset.orderSection === g.section) {
        const target = hit.closest('[data-record-drag="record"]');
        if (target?.dataset.orderId === g.id) return;
        const records = [...zone.querySelectorAll('[data-record-drag="record"]')].filter(el => el.closest('[data-record-zone]') === zone && el.dataset.orderId !== g.id);
        const bounds = target?.getBoundingClientRect(), after = bounds && g.y > bounds.top + bounds.height / 2;
        const before = target && target.dataset.orderId !== g.id ? after ? records[records.indexOf(target) + 1] : target : null;
        g.drop = { kind: 'record', section: g.section, id: g.id, category: zone.dataset.orderCategory || '', beforeId: before?.dataset.orderId || null };
        (target && target.dataset.orderId !== g.id ? target : zone.querySelector('.nav-category-row') || zone).classList.add(target ? after ? 'record-drop-after' : 'record-drop-before' : 'record-drop-inside');
      } else if (home && g.section === 'projects' && g.surface === 'home') {
        const rows = [...document.querySelectorAll('[data-home-project]')], others = rows.filter(el => el.dataset.homeProject !== g.id);
        const bounds = home.getBoundingClientRect(), after = g.y >= bounds.top + bounds.height / 2;
        if (home.dataset.homeProject === g.id) return;
        const before = after ? others[others.indexOf(home) + 1] : home;
        g.drop = { kind: 'record', section: g.section, id: g.id, beforeId: before?.dataset.homeProject || null, visibleIds: rows.map(el => el.dataset.homeProject) };
        home.classList.add(after ? 'record-drop-after' : 'record-drop-before');
      } else if (card && card.dataset.orderSection === g.section && g.surface === 'notes') {
        if (card.dataset.orderNote === g.id) return;
        const rows = [...card.parentElement.querySelectorAll('[data-order-note]')], others = rows.filter(el => el.dataset.orderNote !== g.id);
        const bounds = card.getBoundingClientRect(), after = g.y >= bounds.top + bounds.height / 2;
        const before = after ? others[others.indexOf(card) + 1] : card;
        g.drop = { kind: 'record', section: g.section, id: g.id, beforeId: before?.dataset.orderNote || null, visibleIds: rows.map(el => el.dataset.orderNote) };
        card.classList.add(after ? 'record-drop-after' : 'record-drop-before');
      }
    }
    g.ghost.style.transform = `translate(${g.x - g.offsetX}px, ${g.y - g.offsetY}px)`;
  }
  const edge = (pos, min, max) => pos < min + 36 ? -Math.min(12, (min + 36 - pos) / 3) : pos > max - 36 ? Math.min(12, (pos - max + 36) / 3) : 0;
  function tick() {
    const g = gesture; if (!g?.dragging) return;
    const sidebar = document.querySelector('.sidebar'), bounds = sidebar?.getBoundingClientRect();
    if (bounds && g.x < bounds.right) sidebar.scrollTop += edge(g.y, bounds.top, bounds.bottom);
    else window.scrollBy(0, edge(g.y, 0, innerHeight));
    paint(); frame = requestAnimationFrame(tick);
  }
  function finish(save) {
    const g = gesture; if (!g) return;
    gesture = null; cancelAnimationFrame(frame); clear(); g.row.classList.remove('record-dragging'); g.ghost?.remove(); document.body.classList.remove('is-record-dragging');
    if (g.handle.hasPointerCapture(g.pointerId)) g.handle.releasePointerCapture(g.pointerId);
    if (!g.dragging) return;
    suppressed = { until: performance.now() + 500, pointerId: g.pointerId };
    if (save && g.drop) commit(g.drop);
    else announce('已取消拖动。');
  }
  document.addEventListener('pointerdown', event => {
    const handle = source(event); if (!handle || !valid(handle) || gesture || !event.isPrimary || event.button !== 0 || !canStart()) return;
    const kind = handle.dataset.recordDrag, section = handle.dataset.orderSection, id = handle.dataset.orderId;
    const surface = handle.dataset.orderSurface || 'sidebar';
    const row = kind === 'category' ? handle.closest('[data-order-category]') : surface === 'home' ? handle.closest('[data-home-project]') : surface === 'notes' ? handle.closest('[data-order-note]') : handle;
    const bounds = row.getBoundingClientRect();
    gesture = { handle, row, kind, section, id, surface, pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, dragging: false };
    handle.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', event => {
    const g = gesture; if (!g || g.pointerId !== event.pointerId) return;
    g.x = event.clientX; g.y = event.clientY;
    if (!g.dragging) {
      if (Math.hypot(g.x - g.startX, g.y - g.startY) < 7) return;
      g.dragging = true; g.row.classList.add('record-dragging'); document.body.classList.add('is-record-dragging');
      g.ghost = document.createElement('div'); g.ghost.className = 'record-drag-ghost'; g.ghost.textContent = g.handle.getAttribute('data-drag-label') || g.handle.textContent.trim(); g.ghost.setAttribute('aria-hidden', 'true');
      document.body.append(g.ghost); frame = requestAnimationFrame(tick);
    }
    event.preventDefault(); paint();
  }, { passive: false });
  document.addEventListener('pointerup', event => { if (gesture?.pointerId === event.pointerId) { if (gesture.dragging) paint(); finish(true); } });
  document.addEventListener('pointercancel', event => { if (gesture?.pointerId === event.pointerId) finish(false); });
  document.addEventListener('lostpointercapture', event => { if (gesture?.pointerId === event.pointerId) finish(false); });
  window.addEventListener('blur', () => finish(false)); window.addEventListener('hashchange', () => finish(false));
  document.addEventListener('dragstart', event => { if (source(event)) event.preventDefault(); }, true);
  document.addEventListener('click', event => { if (suppressed && event.pointerId === suppressed.pointerId && performance.now() < suppressed.until) { suppressed = null; event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gesture) { event.preventDefault(); event.stopImmediatePropagation(); finish(false); return; }
    const handle = source(event); if (!handle || !event.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || !canStart()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const kind = handle.dataset.recordDrag, section = handle.dataset.orderSection, id = handle.dataset.orderId, backwards = ['ArrowUp', 'ArrowLeft'].includes(event.key);
    if (kind === 'category') {
      const row = handle.closest('[data-order-category]'), rows = [...row.parentElement.children].filter(el => el.dataset.orderCategory);
      const from = rows.indexOf(row), to = from + (backwards ? -1 : 1); if (to < 0 || to >= rows.length) return;
      commit({ kind, section, id, beforeName: backwards ? rows[to].dataset.orderCategory : rows[to + 1]?.dataset.orderCategory ?? null });
    } else {
      const surface = handle.dataset.orderSurface || 'sidebar';
      if (surface === 'sidebar' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const root = handle.closest('.nav-children'), zones = [root, ...root.querySelectorAll('[data-order-category]')];
        const zone = handle.closest('[data-record-zone]'), from = zones.indexOf(zone), next = zones[from + (backwards ? -1 : 1)];
        if (next) commit({ kind: 'record', section, id, category: next.dataset.orderCategory || '' });
        return;
      }
      const zone = surface === 'sidebar' ? handle.closest('[data-record-zone]') : surface === 'home' ? handle.closest('.mr-route-lines') : handle.closest('.note-grid,.inbox-list');
      const rows = [...zone.querySelectorAll('[data-record-drag="record"]')].filter(el => el.dataset.orderSection === section && (surface !== 'sidebar' || el.closest('[data-record-zone]') === zone));
      const from = rows.indexOf(handle), to = from + (backwards ? -1 : 1); if (to < 0 || to >= rows.length) return;
      commit({ kind: 'record', section, id, beforeId: backwards ? rows[to].dataset.orderId : rows[to + 1]?.dataset.orderId || null, ...(surface === 'sidebar' ? { category: zone.dataset.orderCategory || '' } : { visibleIds: rows.map(el => el.dataset.orderId) }) });
    }
  }, true);
  return { isDragging: () => Boolean(gesture) };
}

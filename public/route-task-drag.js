import { taskGroups, ungroupedName } from './project-tasks.js';

export function reorderTask(project, taskId, index) {
  const from = project.tasks.findIndex(task => task.id === taskId);
  if (from < 0 || !Number.isInteger(index) || index < 0 || index >= project.tasks.length || from === index) return false;
  const [task] = project.tasks.splice(from, 1);
  project.tasks.splice(index, 0, task);
  return true;
}

export function reorderModuleTask(project, taskId, index) {
  const group = taskGroups(project).find(group => group.tasks.some(task => task.id === taskId));
  if (!group || !Number.isInteger(index) || index < 0 || index >= group.tasks.length) return false;
  const from = group.tasks.findIndex(task => task.id === taskId);
  if (from === index) return false;
  const ids = new Set(group.tasks.map(task => task.id));
  const tasks = [...group.tasks];
  tasks.splice(index, 0, tasks.splice(from, 1)[0]);
  let slot = 0;
  project.tasks = project.tasks.map(task => ids.has(task.id) ? tasks[slot++] : task);
  return true;
}

export function moveTaskToModule(project, taskId, moduleId, index) {
  const task = project.tasks.find(task => task.id === taskId);
  if (!task || (moduleId !== '' && !project.modules?.some(module => module.id === moduleId))) return false;
  const siblings = taskGroups(project, true).find(group => group.id === moduleId)?.tasks.filter(item => item !== task) || [];
  if (!Number.isInteger(index) || index < 0 || index > siblings.length) return false;
  const currentGroup = taskGroups(project).find(group => group.tasks.includes(task));
  if (currentGroup?.id === moduleId) return reorderModuleTask(project, taskId, index);
  project.tasks.splice(project.tasks.indexOf(task), 1);
  const before = siblings[index], after = siblings.at(-1);
  const position = before ? project.tasks.indexOf(before) : after ? project.tasks.indexOf(after) + 1 : project.tasks.length;
  task.moduleId = moduleId;
  project.tasks.splice(position, 0, task);
  return true;
}

export function installRouteTaskDrag({ getProject, saveTaskChange, render, announce = () => {} }) {
  let gesture = null, frame = 0, suppressedClick = null;
  const source = event => event.target.closest('.workspace-route [data-route-task] > input[data-task], .project-detail [data-task-drag-handle]');
  const rows = zone => [...zone.querySelectorAll(zone.dataset.taskView === 'route' ? '[data-route-task]' : '[data-task-row]')];
  const taskId = row => row.dataset.routeTask || row.dataset.taskRow;
  const clearTargets = () => document.querySelectorAll('.is-task-drop-target,.is-task-drop-before,.is-task-drop-after').forEach(node => node.classList.remove('is-task-drop-target', 'is-task-drop-before', 'is-task-drop-after'));

  function paint() {
    const g = gesture;
    if (!g?.dragging) return;
    clearTargets();
    const zone = document.elementFromPoint(g.x, g.y)?.closest('[data-task-zone]');
    g.target = zone && !zone.closest('[inert]') && zone.dataset.projectId === g.projectId && zone.dataset.taskView === g.view ? zone : null;
    g.to = g.from;
    if (g.target) {
      g.target.classList.add('is-task-drop-target');
      const items = rows(g.target).filter(row => row !== g.station);
      const horizontal = g.view === 'route';
      g.to = items.findIndex(row => {
        const bounds = row.querySelector(horizontal ? '.mr-station-dot' : '.module-task-title').getBoundingClientRect();
        return horizontal ? g.x < bounds.x + bounds.width / 2 : g.y < bounds.y + bounds.height / 2;
      });
      if (g.to < 0) g.to = items.length;
      const marker = items[g.to] || items.at(-1);
      marker?.classList.add(items[g.to] ? 'is-task-drop-before' : 'is-task-drop-after');
    }
    g.preview.hidden = g.view === 'route' && g.target === g.zone;
    g.preview.style.left = `${Math.max(12, Math.min(g.x + 12, innerWidth - 252))}px`;
    g.preview.style.top = `${Math.min(g.y + 12, innerHeight - 46)}px`;
    if (g.view === 'route') {
      const delta = g.x - g.startX + g.scroll.scrollLeft - g.startScroll;
      let center = g.centers[g.from] + delta;
      if (g.target === g.zone) {
        center = Math.max(g.centers[0], Math.min(g.centers.at(-1), center));
        g.to = g.centers.reduce((nearest, value, index) => Math.abs(value - center) < Math.abs(g.centers[nearest] - center) ? index : nearest, g.from);
      }
      const order = g.stations.map((_, index) => index);
      order.splice(g.from, 1); order.splice(g.to, 0, g.from);
      const slots = new Map(order.map((index, slot) => [index, slot]));
      g.stations.forEach((station, index) => {
        const x = index === g.from ? center - g.centers[index] : g.target === g.zone ? g.centers[slots.get(index)] - g.centers[index] : 0;
        const y = index === g.from ? g.y - g.startY + window.scrollY - g.startWindowY : 0;
        station.querySelectorAll(':scope > span').forEach(span => { span.style.transform = `translate(${x}px, ${y}px)`; });
      });
    }
  }

  const edgeSpeed = (position, start, end) => position < start + 36 ? -Math.min(14, (start + 36 - position) / 3) : position > end - 36 ? Math.min(14, (position - end + 36) / 3) : 0;
  function autoScroll() {
    const g = gesture;
    if (!g?.dragging) return;
    if (g.view === 'route') {
      const scroll = (g.target || g.zone).querySelector('.mr-stations-scroll'), bounds = scroll.getBoundingClientRect();
      if (g.y >= bounds.top && g.y <= bounds.bottom) scroll.scrollLeft += edgeSpeed(g.x, bounds.left, bounds.right);
      window.scrollBy(0, edgeSpeed(g.y, 0, innerHeight));
    } else {
      const bounds = g.viewport.getBoundingClientRect();
      g.viewport.scrollTop += edgeSpeed(g.y, bounds.top, bounds.bottom);
    }
    paint(); frame = requestAnimationFrame(autoScroll);
  }

  function finish(commit) {
    const g = gesture;
    if (!g) return;
    gesture = null; cancelAnimationFrame(frame); clearTargets();
    g.preview?.remove();
    document.body.classList.remove('is-task-dragging');
    g.container.classList.remove('is-reordering'); g.station.classList.remove('is-dragging');
    g.station.style.transform = '';
    g.stations.forEach(station => station.querySelectorAll(':scope > span').forEach(span => { span.style.transform = ''; }));
    if (g.input.hasPointerCapture(g.pointerId)) g.input.releasePointerCapture(g.pointerId);
    if (!g.dragging) return;
    suppressedClick = { pointerId: g.pointerId, projectId: g.projectId, until: performance.now() + 400 };
    if (!commit || !g.target || (g.target === g.zone && g.to === g.from)) return;
    const project = getProject(g.projectId), moduleId = g.target.dataset.moduleId;
    if (!project) return;
    const saved = saveTaskChange(project, () => moveTaskToModule(project, g.taskId, moduleId, g.to));
    render();
    if (saved && moduleId !== g.zone.dataset.moduleId) announce(`事项已移至${project.modules?.find(module => module.id === moduleId)?.name || ungroupedName(project)}`);
  }

  document.addEventListener('pointerdown', event => {
    if (gesture || !event.isPrimary || event.button !== 0) return;
    const input = source(event), zone = input?.closest('[data-task-zone]');
    if (!zone || zone.closest('[inert]')) return;
    const view = zone.dataset.taskView, station = input.closest(view === 'route' ? '[data-route-task]' : '[data-task-row]');
    const stations = rows(zone), scroll = zone.querySelector('.mr-stations-scroll');
    const container = station.parentElement, viewport = zone.closest('.drawer-scroll');
    gesture = {
      input, station, container, stations, scroll, viewport, zone, view, target: zone,
      pointerId: event.pointerId, projectId: zone.dataset.projectId, taskId: taskId(station),
      from: stations.indexOf(station), to: stations.indexOf(station),
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      startScroll: scroll?.scrollLeft || 0, startWindowY: window.scrollY,
      dragging: false,
      centers: view === 'route' ? stations.map(item => {
        const dot = item.querySelector('.mr-station-dot').getBoundingClientRect(), bounds = scroll.getBoundingClientRect();
        return dot.x + dot.width / 2 - bounds.left + scroll.scrollLeft;
      }) : [],
    };
    input.setPointerCapture(event.pointerId);
  });

  document.addEventListener('pointermove', event => {
    const g = gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    g.x = event.clientX; g.y = event.clientY;
    if (!g.dragging) {
      if (Math.hypot(g.x - g.startX, g.y - g.startY) < 7) return;
      g.dragging = true; g.container.classList.add('is-reordering'); g.station.classList.add('is-dragging');
      g.preview = document.createElement('div'); g.preview.className = 'task-drag-preview'; g.preview.setAttribute('aria-hidden', 'true');
      g.preview.textContent = getProject(g.projectId)?.tasks.find(task => task.id === g.taskId)?.title || '';
      document.body.append(g.preview);
      document.body.classList.add('is-task-dragging');
      frame = requestAnimationFrame(autoScroll);
    }
    event.preventDefault(); paint();
  }, { passive: false });

  document.addEventListener('pointerup', event => {
    if (gesture?.pointerId === event.pointerId) {
      if (gesture.dragging) { event.preventDefault(); gesture.x = event.clientX; gesture.y = event.clientY; paint(); }
      finish(true);
    }
    if (suppressedClick?.pointerId === event.pointerId) setTimeout(() => { suppressedClick = null; }, 0);
  });
  document.addEventListener('pointercancel', event => { if (gesture?.pointerId === event.pointerId) finish(false); });
  document.addEventListener('lostpointercapture', event => { if (gesture?.pointerId === event.pointerId) finish(false); });
  window.addEventListener('blur', () => finish(false));
  window.addEventListener('hashchange', () => finish(false));

  document.addEventListener('click', event => {
    const projectId = event.target.closest('[data-task-zone]')?.dataset.projectId || event.target.closest('.mr-route-line')?.querySelector('[data-select-project]')?.dataset.selectProject;
    if (suppressedClick && performance.now() < suppressedClick.until && (event.pointerId === suppressedClick.pointerId || projectId === suppressedClick.projectId)) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressedClick = null;
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gesture) { event.preventDefault(); event.stopImmediatePropagation(); finish(false); return; }
    const input = source(event);
    if (!input || !event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const zone = input.closest('[data-task-zone]'), project = getProject(zone.dataset.projectId);
    if (!project) return;
    const id = input.dataset.task || input.dataset.taskDragHandle, groups = taskGroups(project, true);
    const groupIndex = groups.findIndex(group => group.id === zone.dataset.moduleId);
    const group = groups[groupIndex], from = group.tasks.findIndex(task => task.id === id);
    const crossModule = zone.dataset.taskView === 'route' ? ['ArrowUp', 'ArrowDown'].includes(event.key) : ['ArrowLeft', 'ArrowRight'].includes(event.key);
    if (crossModule) {
      const target = groups[groupIndex + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1)];
      if (!target) return;
      const saved = saveTaskChange(project, () => moveTaskToModule(project, id, target.id, target.tasks.length));
      render();
      if (saved) { document.activeElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); announce(`事项已移至${target.name}`); }
    } else {
      const index = from + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
      if (index < 0 || index >= group.tasks.length) return;
      saveTaskChange(project, () => reorderModuleTask(project, id, index)); render();
    }
  }, true);
  return { isDragging: () => Boolean(gesture) };
}

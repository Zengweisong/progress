export function reorderTask(project, taskId, index) {
  const from = project.tasks.findIndex(task => task.id === taskId);
  if (from < 0 || !Number.isInteger(index) || index < 0 || index >= project.tasks.length || from === index) return false;
  const [task] = project.tasks.splice(from, 1);
  project.tasks.splice(index, 0, task);
  return true;
}

export function installRouteTaskDrag({ getProject, saveTaskChange, render }) {
  let gesture = null, frame = 0, suppressedClick = null;
  const source = event => event.target.closest('.workspace-route [data-route-task] > input[data-task]');

  function paint() {
    const g = gesture;
    if (!g?.dragging) return;
    const delta = g.x - g.startX + g.scroll.scrollLeft - g.startScroll;
    const center = Math.max(g.centers[0], Math.min(g.centers.at(-1), g.centers[g.from] + delta));
    g.to = g.centers.reduce((nearest, value, index) => Math.abs(value - center) < Math.abs(g.centers[nearest] - center) ? index : nearest, g.from);
    const order = g.stations.map((_, index) => index);
    order.splice(g.from, 1); order.splice(g.to, 0, g.from);
    const slots = new Map(order.map((index, slot) => [index, slot]));
    g.stations.forEach((station, index) => {
      const offset = index === g.from ? center - g.centers[index] : g.centers[slots.get(index)] - g.centers[index];
      if (g.offsets[index] === offset) return;
      g.offsets[index] = offset;
      station.querySelectorAll(':scope > span').forEach(span => { span.style.transform = `translateX(${offset}px)`; });
    });
  }

  function autoScroll() {
    if (!gesture?.dragging) return;
    const bounds = gesture.scroll.getBoundingClientRect(), x = gesture.x;
    const speed = x < bounds.left + 36 ? -Math.min(14, (bounds.left + 36 - x) / 3) : x > bounds.right - 36 ? Math.min(14, (x - bounds.right + 36) / 3) : 0;
    if (speed) { gesture.scroll.scrollLeft += speed; paint(); }
    frame = requestAnimationFrame(autoScroll);
  }

  function finish(commit) {
    const g = gesture;
    if (!g) return;
    gesture = null; cancelAnimationFrame(frame);
    g.container.classList.remove('is-reordering');
    g.station.classList.remove('is-dragging');
    g.stations.forEach(station => station.querySelectorAll(':scope > span').forEach(span => { span.style.transform = ''; }));
    if (g.input.hasPointerCapture(g.pointerId)) g.input.releasePointerCapture(g.pointerId);
    if (!g.dragging) return;
    suppressedClick = { pointerId: g.pointerId, projectId: g.projectId, until: performance.now() + 400 };
    if (commit && g.from !== g.to) {
      const project = getProject(g.projectId);
      if (project) { saveTaskChange(project, () => reorderTask(project, g.taskId, g.to)); render(); }
    }
  }

  document.addEventListener('pointerdown', event => {
    if (gesture || !event.isPrimary || event.button !== 0) return;
    const input = source(event), station = input?.closest('[data-route-task]');
    if (!station || station.closest('[inert]')) return;
    const container = station.parentElement, stations = [...container.querySelectorAll('[data-route-task]')];
    if (stations.length < 2) return;
    const scroll = container.closest('.mr-stations-scroll'), bounds = scroll.getBoundingClientRect();
    gesture = {
      input, station, container, stations, scroll, pointerId: event.pointerId,
      projectId: station.dataset.routeProject, taskId: station.dataset.routeTask,
      from: stations.indexOf(station), to: stations.indexOf(station),
      offsets: stations.map(() => 0),
      startX: event.clientX, startY: event.clientY, x: event.clientX, startScroll: scroll.scrollLeft, dragging: false,
      centers: stations.map(item => { const dot = item.querySelector('.mr-station-dot').getBoundingClientRect(); return dot.x + dot.width / 2 - bounds.left + scroll.scrollLeft; }),
    };
    input.setPointerCapture(event.pointerId);
  });

  document.addEventListener('pointermove', event => {
    const g = gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    g.x = event.clientX;
    if (!g.dragging) {
      if (Math.abs(event.clientX - g.startX) < 7) return;
      if (Math.abs(event.clientY - g.startY) > Math.abs(event.clientX - g.startX)) { finish(false); return; }
      g.dragging = true; g.container.classList.add('is-reordering'); g.station.classList.add('is-dragging');
      frame = requestAnimationFrame(autoScroll);
    }
    event.preventDefault(); paint();
  }, { passive: false });

  document.addEventListener('pointerup', event => {
    if (gesture?.pointerId === event.pointerId) {
      if (gesture.dragging) event.preventDefault();
      finish(true);
    }
    // A canceled drag can end over another station or the line background.
    // Consume only its synthetic click, then allow the next deliberate click.
    if (suppressedClick?.pointerId === event.pointerId) setTimeout(() => { suppressedClick = null; }, 0);
  });
  document.addEventListener('pointercancel', event => { if (gesture?.pointerId === event.pointerId) finish(false); });
  document.addEventListener('lostpointercapture', event => { if (gesture?.pointerId === event.pointerId) finish(false); });
  window.addEventListener('blur', () => finish(false));
  window.addEventListener('hashchange', () => finish(false));

  document.addEventListener('click', event => {
    const projectId = event.target.closest('.mr-route-line')?.querySelector('[data-select-project]')?.dataset.selectProject;
    if (suppressedClick && performance.now() < suppressedClick.until && projectId === suppressedClick.projectId) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressedClick = null;
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gesture) { event.preventDefault(); event.stopImmediatePropagation(); finish(false); return; }
    const input = source(event);
    if (!input || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const project = getProject(input.dataset.projectId), from = project?.tasks.findIndex(task => task.id === input.dataset.task);
    const index = from + (event.key === 'ArrowLeft' ? -1 : 1);
    if (project && index >= 0 && index < project.tasks.length) { saveTaskChange(project, () => reorderTask(project, input.dataset.task, index)); render(); }
  }, true);
}

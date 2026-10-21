const STORAGE_KEY = 'shixu.sidebar.layout.v1';
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export function installSidebarControls() {
  let width = null, collapsed = false, gesture = null;
  const mobile = matchMedia('(max-width: 700px)');
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Number.isFinite(saved?.width)) width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, saved.width));
    collapsed = saved?.collapsed === true;
  } catch { /* Use the default layout when preferences cannot be read. */ }

  const maxWidth = () => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, innerWidth - 500));
  const clamp = value => Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, value)));
  const currentWidth = () => Math.round(document.querySelector('.sidebar').getBoundingClientRect().width);
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ width, collapsed })); }
    catch { /* The layout remains usable without saved preferences. */ }
  }
  function refresh() {
    if (gesture && (!gesture.handle.isConnected || mobile.matches)) finish(true);
    const shell = document.querySelector('.app-shell');
    if (!shell) return;
    if (width !== null) shell.style.setProperty('--sidebar-width', `${width}px`);
    else shell.style.removeProperty('--sidebar-width');
    shell.classList.toggle('is-sidebar-collapsed', collapsed);
    document.querySelector('.sidebar').inert = collapsed || mobile.matches;
    const toggle = document.querySelector('[data-sidebar-toggle]');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? '展开侧边栏' : '收起侧边栏');
    toggle.title = collapsed ? '展开侧边栏' : '收起侧边栏';
    const handle = document.querySelector('[data-sidebar-resize]');
    handle.setAttribute('aria-valuenow', String(currentWidth()));
    handle.setAttribute('aria-valuemax', String(maxWidth()));
  }
  function finish(cancelled = false) {
    if (!gesture) return;
    const previous = gesture;
    gesture = null;
    document.body.classList.remove('is-sidebar-resizing');
    if (cancelled) width = previous.savedWidth;
    if (previous.handle.hasPointerCapture(previous.id)) previous.handle.releasePointerCapture(previous.id);
    if (cancelled) refresh();
    else save();
  }

  document.addEventListener('click', event => {
    const toggle = event.target.closest('[data-sidebar-toggle]');
    if (!toggle || toggle.closest('[inert]') || mobile.matches) return;
    collapsed = !collapsed;
    refresh();
    save();
  });
  document.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-sidebar-resize]');
    if (!handle || handle.closest('[inert]') || gesture || mobile.matches || collapsed || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    gesture = { handle, id: event.pointerId, startX: event.clientX, startWidth: currentWidth(), savedWidth: width };
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
    document.body.classList.add('is-sidebar-resizing');
  });
  document.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    width = clamp(gesture.startWidth + event.clientX - gesture.startX);
    refresh();
  });
  document.addEventListener('pointerup', event => {
    if (gesture?.id === event.pointerId) finish();
  });
  document.addEventListener('pointercancel', event => {
    if (gesture?.id === event.pointerId) finish(true);
  });
  document.addEventListener('lostpointercapture', event => {
    if (gesture?.id === event.pointerId) finish(true);
  });
  document.addEventListener('keydown', event => {
    if (gesture && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish(true);
      return;
    }
    if (!event.target.matches('[data-sidebar-resize]') || event.target.closest('[inert]') || mobile.matches || collapsed || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    width = event.key === 'Home' ? MIN_WIDTH : event.key === 'End' ? maxWidth() : clamp(currentWidth() + (event.key === 'ArrowRight' ? step : -step));
    refresh();
    save();
  }, true);
  window.addEventListener('blur', () => finish(true));
  window.addEventListener('resize', refresh);
  return { refresh, isResizing: () => Boolean(gesture) };
}

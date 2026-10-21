export function installSidebarCreateMenu({ icon }) {
  const menu = document.createElement('div');
  menu.id = 'sidebar-create-menu'; menu.className = 'sidebar-create-menu';
  menu.setAttribute('popover', 'auto'); menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '新建内容');
  menu.innerHTML = `<button type="button" role="menuitem" data-action="new-category">${icon('layers')}<span>新建分类</span></button><button type="button" role="menuitem" data-action="new-section-page">${icon('note')}<span>新建页面</span></button>`;
  document.body.append(menu);
  let trigger = null, closeTimer;
  const items = [...menu.querySelectorAll('[role=menuitem]')];
  const contains = target => target instanceof Node && (menu.contains(target) || trigger?.contains(target));
  const cancelClose = () => clearTimeout(closeTimer);
  function close() {
    cancelClose();
    trigger?.setAttribute('aria-expanded', 'false'); trigger = null;
    if (menu.matches(':popover-open')) menu.hidePopover();
  }
  function open(button, focus = false) {
    cancelClose();
    if (trigger !== button) { close(); trigger = button; }
    for (const item of items) {
      item.dataset.section = button.dataset.createMenu;
      if (button.hasAttribute('data-create-category')) item.dataset.name = button.dataset.createCategory;
      else delete item.dataset.name;
    }
    items[1].dataset.action = button.hasAttribute('data-create-category') ? 'new-category-page' : 'new-section-page';
    button.setAttribute('aria-expanded', 'true');
    if (!menu.matches(':popover-open')) menu.showPopover();
    const anchor = button.getBoundingClientRect(), bounds = menu.getBoundingClientRect();
    const sidebar = button.closest('.sidebar');
    if (sidebar) {
      menu.style.left = `${Math.min(sidebar.getBoundingClientRect().right + 6, innerWidth - bounds.width - 8)}px`;
      menu.style.top = `${Math.max(8, Math.min(anchor.top - 5, innerHeight - bounds.height - 8))}px`;
    } else {
      menu.style.left = `${Math.max(8, Math.min(anchor.right - bounds.width, innerWidth - bounds.width - 8))}px`;
      menu.style.top = `${Math.max(8, anchor.bottom + 6 + bounds.height > innerHeight - 8 ? anchor.top - bounds.height - 6 : anchor.bottom + 6)}px`;
    }
    if (focus) items[0].focus();
  }
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    const button = event.target.closest('[data-create-menu]');
    if (button && !button.closest('[inert]')) open(button);
    else if (menu.contains(event.target)) cancelClose();
  });
  document.addEventListener('pointerout', event => {
    if (trigger && contains(event.target) && !contains(event.relatedTarget)) closeTimer = setTimeout(close, 220);
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-create-menu]');
    if (button && !button.closest('[inert]')) { open(button, event.detail === 0); return; }
    if (trigger) close();
  });
  document.addEventListener('keydown', event => {
    const button = event.target.closest('[data-create-menu]');
    if (button && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); open(button, true);
      if (event.key === 'ArrowUp') items.at(-1).focus();
      return;
    }
    if (!trigger) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); const target = trigger; close(); target.focus(); return;
    }
    if (!menu.contains(event.target)) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const index = items.indexOf(document.activeElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    } else if (event.key === 'Tab') close();
  }, true);
  document.addEventListener('focusin', event => { if (trigger && !contains(event.target)) close(); });
  menu.addEventListener('toggle', event => { if (event.newState === 'closed' && !menu.matches(':popover-open')) close(); });
  window.addEventListener('resize', close);
  document.addEventListener('scroll', event => { if (!menu.contains(event.target)) close(); }, true);
  return { close };
}

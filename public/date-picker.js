const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const arrow = direction => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${direction < 0 ? 'M12 5l-5 5 5 5' : 'M8 5l5 5-5 5'}"/></svg>`;

export function dateValue(date) {
  const year = date.getFullYear();
  return year >= 1 && year <= 9999 ? `${String(year).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
}
export function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number), date = new Date(0);
  date.setHours(12, 0, 0, 0); date.setFullYear(year, month - 1, day);
  return dateValue(date) === value ? date : null;
}
export function shiftMonth(year, month, delta) {
  const total = Math.max(12, Math.min(9999 * 12 + 11, year * 12 + month + delta));
  return [Math.floor(total / 12), total % 12];
}
export function calendarDays(year, month) {
  const first = new Date(0); first.setHours(12, 0, 0, 0); first.setFullYear(year, month, 1);
  first.setDate(1 - (first.getDay() + 6) % 7);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first); date.setDate(first.getDate() + index);
    return { value: dateValue(date), day: date.getDate(), outside: date.getMonth() !== month };
  });
}
const readable = value => { const date = parseDate(value); return date ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日` : '未设置'; };

export function renderDateInput({ esc, icon, id, value = '', label, attributes = '' }) {
  return `<span class="date-field"><input type="date" id="${id}" value="${esc(value)}" ${attributes} hidden><button type="button" id="${id}-trigger" class="date-trigger ${value ? '' : 'is-empty'}" data-date-trigger="${id}" aria-label="${esc(label)}" aria-description="${esc(readable(value))}" aria-haspopup="dialog" aria-expanded="false"><span data-date-value>${value ? esc(value.replaceAll('-', '/')) : '选择日期'}</span>${icon('calendar')}</button></span>`;
}

export function installDatePicker({ commit = () => true } = {}) {
  let state = null;
  function close(restoreFocus = false) {
    const previous = state;
    if (!previous) return;
    state = null; previous.trigger.setAttribute('aria-expanded', 'false');
    previous.popup.hidePopover(); previous.popup.remove();
    if (restoreFocus && previous.trigger.isConnected) previous.trigger.focus({ preventScroll: true });
  }
  function place() {
    if (!state) return;
    const { trigger, popup } = state, bounds = trigger.getBoundingClientRect();
    const left = Math.max(12, Math.min(bounds.left, innerWidth - popup.offsetWidth - 12));
    const below = bounds.bottom + 6, above = bounds.top - popup.offsetHeight - 6;
    const top = below + popup.offsetHeight <= innerHeight - 12 ? below : above >= 12 ? above : Math.max(12, innerHeight - popup.offsetHeight - 12);
    popup.style.left = `${left}px`; popup.style.top = `${top}px`;
  }
  function draw(focus = true) {
    const s = state, today = dateValue(new Date());
    if (!s) return;
    const headingId = `${s.input.id}-calendar-heading`;
    const header = `<div class="calendar-header"><button type="button" class="calendar-nav" data-calendar-action="previous" aria-label="${s.view === 'days' ? '上个月' : '上一年'}" ${s.year === 1 && (s.view === 'months' || s.month === 0) ? 'disabled' : ''}>${arrow(-1)}</button>${s.view === 'days' ? `<button type="button" class="calendar-month-title" data-calendar-action="months" aria-label="选择年月" id="${headingId}">${s.year} 年 ${s.month + 1} 月<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></button>` : `<span class="calendar-month-title" id="${headingId}" aria-live="polite">${s.year} 年</span>`}<button type="button" class="calendar-nav" data-calendar-action="next" aria-label="${s.view === 'days' ? '下个月' : '下一年'}" ${s.year === 9999 && (s.view === 'months' || s.month === 11) ? 'disabled' : ''}>${arrow(1)}</button></div>`;
    if (s.view === 'months') {
      s.popup.innerHTML = `${header}<div class="calendar-months" aria-labelledby="${headingId}">${Array.from({ length: 12 }, (_, month) => `<button type="button" data-calendar-month="${month}" class="${month === s.month ? 'is-selected' : ''}" aria-label="${s.year}年${month + 1}月">${month + 1} 月</button>`).join('')}</div><div class="calendar-footer"><button type="button" data-calendar-action="days">返回日期</button></div>`;
      place(); if (focus) s.popup.querySelector(`[data-calendar-month="${s.month}"]`).focus({ preventScroll: true });
      return;
    }
    const days = calendarDays(s.year, s.month);
    s.popup.innerHTML = `${header}<table class="calendar-grid" role="grid" aria-labelledby="${headingId}"><thead><tr>${weekdays.map(day => `<th scope="col">${day}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: 6 }, (_, week) => `<tr>${days.slice(week * 7, week * 7 + 7).map(day => `<td role="gridcell" aria-selected="${day.value === s.input.value}"><button type="button" data-calendar-date="${day.value}" ${day.value ? '' : 'disabled'} tabindex="${day.value === s.focusDate ? '0' : '-1'}" class="${day.outside ? 'is-outside' : ''} ${day.value === today ? 'is-today' : ''} ${day.value === s.input.value ? 'is-selected' : ''}" aria-label="${day.value ? readable(day.value) : '不可选日期'}" ${day.value === today ? 'aria-current="date"' : ''}>${day.day}</button></td>`).join('')}</tr>`).join('')}</tbody></table><div class="calendar-footer"><button type="button" data-calendar-action="today">今天</button><button type="button" data-calendar-action="clear" ${s.input.value ? '' : 'disabled'}>清除日期</button></div>`;
    place(); if (focus) s.popup.querySelector(`[data-calendar-date="${s.focusDate}"]`)?.focus({ preventScroll: true });
  }
  function choose(value) {
    const s = state;
    if (!s || (value && !parseDate(value)) || !commit(s.input, value)) return;
    s.input.value = value;
    s.trigger.querySelector('[data-date-value]').textContent = value ? value.replaceAll('-', '/') : '选择日期';
    s.trigger.classList.toggle('is-empty', !value); s.trigger.setAttribute('aria-description', readable(value));
    close(true);
  }
  function open(trigger) {
    if (state?.trigger === trigger) { close(true); return; }
    close();
    const input = document.getElementById(trigger.dataset.dateTrigger), selected = parseDate(input.value) || new Date();
    const popup = document.createElement('div');
    popup.className = 'calendar-popover'; popup.setAttribute('popover', 'manual'); popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', `选择${trigger.getAttribute('aria-label')}`);
    popup.id = `${input.id}-calendar`; trigger.setAttribute('aria-controls', popup.id); trigger.setAttribute('aria-expanded', 'true');
    trigger.parentElement.append(popup);
    state = { trigger, input, popup, year: selected.getFullYear(), month: selected.getMonth(), focusDate: dateValue(selected), view: 'days' };
    popup.showPopover(); draw();
  }
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-date-trigger]');
    if (trigger) { event.preventDefault(); open(trigger); return; }
    if (!state || !state.popup.contains(event.target)) return;
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-calendar-date')) { choose(button.dataset.calendarDate); return; }
    if (button.hasAttribute('data-calendar-month')) { state.month = Number(button.dataset.calendarMonth); state.view = 'days'; state.focusDate = `${String(state.year).padStart(4, '0')}-${String(state.month + 1).padStart(2, '0')}-01`; draw(); return; }
    switch (button.dataset.calendarAction) {
      case 'previous': case 'next': {
        const delta = button.dataset.calendarAction === 'previous' ? -1 : 1;
        [state.year, state.month] = shiftMonth(state.year, state.month, delta * (state.view === 'months' ? 12 : 1));
        state.focusDate = `${String(state.year).padStart(4, '0')}-${String(state.month + 1).padStart(2, '0')}-01`;
        draw(false); state.popup.querySelector(`[data-calendar-action="${button.dataset.calendarAction}"]`)?.focus({ preventScroll: true }); break;
      }
      case 'months': state.view = 'months'; draw(); break;
      case 'days': state.view = 'days'; draw(); break;
      case 'today': choose(dateValue(new Date())); break;
      case 'clear': choose(''); break;
    }
  });
  document.addEventListener('pointerdown', event => {
    if (state && !state.popup.contains(event.target) && !state.trigger.contains(event.target)) close();
  }, true);
  document.addEventListener('keydown', event => {
    if (!state) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(true); return; }
    if (!state.popup.contains(event.target)) return;
    if (event.key === 'Tab') {
      const controls = [...state.popup.querySelectorAll('button:not(:disabled):not([tabindex="-1"])')];
      if ((!event.shiftKey && event.target === controls.at(-1)) || (event.shiftKey && event.target === controls[0])) {
        event.preventDefault(); (event.shiftKey ? controls.at(-1) : controls[0]).focus();
      }
      return;
    }
    const value = event.target.dataset.calendarDate;
    if (!value || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const date = parseDate(value), offset = (date.getDay() + 6) % 7;
    if (event.key.startsWith('Page')) {
      const [year, month] = shiftMonth(date.getFullYear(), date.getMonth(), (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1));
      const last = new Date(date); last.setFullYear(year, month + 1, 0);
      date.setFullYear(year, month, Math.min(date.getDate(), last.getDate()));
    } else date.setDate(date.getDate() + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -offset, End: 6 - offset }[event.key]));
    if (!dateValue(date)) return;
    state.year = date.getFullYear(); state.month = date.getMonth(); state.focusDate = dateValue(date); draw();
  }, true);
  window.addEventListener('resize', place);
  document.addEventListener('scroll', place, true);
  return { close, isOpen: () => Boolean(state) };
}

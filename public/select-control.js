// Native selects retain form submission, keyboard navigation and mobile fallback.
export function renderSelect({ esc, options, value, kind = '', attributes = '', className = '' }) {
  return `<select class="project-select ${className}" ${attributes}><button type="button"><selectedcontent></selectedcontent></button>${options.map(([id, label]) => `<option value="${esc(id)}" ${id === value ? 'selected' : ''}>${kind && id ? `<span class="select-indicator ${kind}-${esc(id)}" aria-hidden="true"></span>` : ''}<span>${esc(label)}</span></option>`).join('')}</select>`;
}

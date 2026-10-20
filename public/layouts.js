import { seedData, statuses, validateData } from './data.js';
import { createSyncClient } from './sync-client.js';
import { createSyncUI, syncButton } from './sync-ui.js';
import { renderFocus, renderJournal } from './layouts-focus-journal.js';
import { renderMatrix, renderRoute } from './layouts-matrix-route.js';

const STORAGE_KEY = 'shixu-layout-lab-v1';
const options = [
  { id: 'focus', name: '今日驾驶舱', en: 'FOCUS DESK', desc: '任务在前，项目在旁', use: '每天打开，立即开始下一步。', shortcut: '专注推进', render: renderFocus },
  { id: 'journal', name: '时间手账', en: 'DAILY JOURNAL', desc: '先记下来，沿时间回看', use: '把想法、过程和复盘连成一页。', shortcut: '随手记录', render: renderJournal },
  { id: 'matrix', name: '速记矩阵', en: 'QUICK MATRIX', desc: '一屏总览，直接修改', use: '多项目并行，用最少动作更新。', shortcut: '密集管理', render: renderMatrix },
  { id: 'route', name: '项目路线图', en: 'PROJECT ROUTES', desc: '任务变路标，进展看得见', use: '看清已经完成的路和下一站。', shortcut: '直观推进', render: renderRoute },
];
const params = new URLSearchParams(location.search);
const state = {
  layout: options.some(x => x.id === params.get('layout')) ? params.get('layout') : 'focus',
  selectedProject: 'p1', filter: 'all', query: '', recordKind: 'note',
  draft: { body: '', projectId: null, kind: 'note', formId: null },
  compare: params.get('compare') === '1', phone: params.get('device') === 'phone',
  present: params.get('present') === '1',
};
let data = seedData(), lastStored = null, storageError = '', activeDetail = null, lastOpener = null, openerKey = null, syncClient, syncUI;
try {
  lastStored = localStorage.getItem(STORAGE_KEY);
  if (lastStored) data = validateData(JSON.parse(lastStored));
} catch { storageError = '预览数据读取失败，当前仅保留在页面中。'; }
const freshLocal = lastStored === null && !storageError;

const paths = {
  plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  note: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  focus: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M16 21h5v-5"/><circle cx="12" cy="12" r="4"/>',
  journal: '<path d="M5 3h14v18H5zM3 7h4M3 12h4M3 17h4M10 8h5M10 12h5"/>',
  matrix: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M10 4v16"/>',
  route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>', bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  book: '<path d="M12 6C8 3 5 4 3 5v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v15"/>',
  link: '<path d="m9 15 6-6m-5-4 1-1a5 5 0 0 1 7 7l-2 2m-2 6-1 1a5 5 0 0 1-7-7l2-2"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.note}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = p => Math.round(p.tasks.filter(t => t.done).length / Math.max(1, p.tasks.length) * 100);
const statusName = p => statuses.find(s => s.id === p.status)?.label || '待开始';
const date = value => value ? `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日` : '未设日期';
const $ = s => document.querySelector(s);
const projectById = id => data.projects.find(p => p.id === id);
const noteById = id => data.notes.find(n => n.id === id);

function progress(p) {
  return `<div class="progress-block"><div class="progress-copy"><span>${p.tasks.filter(t => t.done).length} / ${p.tasks.length} 项任务</span><strong>${p.tasks.length ? pct(p) + '%' : '暂无任务'}</strong></div><div class="progress-track" role="progressbar" aria-label="${esc(p.title)}任务进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct(p)}"><span style="width:${pct(p)}%"></span></div></div>`;
}
function taskRow(p, task) {
  return `<label class="task-row ${task.done ? 'is-done' : ''}"><input class="task-check" type="checkbox" data-task="${esc(task.id)}" data-project-id="${esc(p.id)}" ${task.done ? 'checked' : ''} aria-label="${esc(task.title)}"><span class="task-row-copy"><span>${esc(task.title)}</span><small>${esc(p.title)}</small></span></label>`;
}
function captureForm({ id = 'main', placeholder = '此刻的想法、刚完成的进展，先写下来…', projectId, compact = false, label = '快速记录' } = {}) {
  const kind = state.draft.kind;
  const projectValue = state.draft.formId === id ? (state.draft.projectId ?? projectId ?? '') : (projectId ?? state.draft.projectId ?? '');
  return `<form class="quick-capture ${compact ? 'compact' : ''}" data-capture="${esc(id)}"><div class="capture-heading"><span>${icon('plus')} ${esc(label)}</span><span class="capture-key">Ctrl / ⌘ Enter 保存</span></div><textarea name="body" aria-label="记录内容" rows="${compact ? 2 : 3}" maxlength="20000" required placeholder="${esc(kind === 'task' ? '每行一个任务，可一次添加多项…' : placeholder)}">${esc(state.draft.body)}</textarea><div class="capture-bottom"><div class="capture-fields"><label><span class="sr-only">记录类型</span><select name="kind" aria-label="记录类型"><option value="note" ${kind === 'note' ? 'selected' : ''}>笔记</option><option value="task" ${kind === 'task' ? 'selected' : ''}>任务 · 每行一项</option></select></label><label><span class="sr-only">关联项目</span><select name="projectId" aria-label="关联项目"><option value="">${kind === 'task' ? (data.projects[0] ? '默认：' + esc(data.projects[0].title) : '请先记录为笔记') : '收集箱 · 稍后整理'}</option>${data.projects.map(p => `<option value="${esc(p.id)}" ${projectValue === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label></div><button type="submit" class="primary-button">${kind === 'task' ? '添加任务' : '保存记录'} ${icon('arrow')}</button></div></form>`;
}
function recordList(notes, limit = 4) {
  return `<div class="record-list">${[...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit).map(n => `<button class="record-item" data-note="${esc(n.id)}">${icon('note')}<span><strong>${esc(n.title)}</strong><small>${esc(n.summary)}</small></span>${icon('chevron')}</button>`).join('') || '<p class="empty-copy">这里还没有记录，写下第一条吧。</p>'}</div>`;
}
function wireframe(id) {
  const shapes = {
    focus: '<rect x="4" y="4" width="56" height="5"/><rect x="4" y="14" width="34" height="27"/><rect x="42" y="14" width="18" height="12"/><rect x="42" y="30" width="18" height="11"/>',
    journal: '<rect x="4" y="4" width="10" height="37"/><rect x="20" y="4" width="26" height="10"/><rect x="20" y="19" width="26" height="9"/><rect x="20" y="33" width="26" height="8"/><rect x="51" y="4" width="9" height="37"/>',
    matrix: '<rect x="4" y="4" width="56" height="6"/><path d="M4 17h56M4 25h56M4 33h56M4 41h56M25 14v27M45 14v27"/>',
    route: '<path d="M5 10h37M5 23h37M5 36h37"/><circle cx="14" cy="10" r="3"/><circle cx="31" cy="10" r="3"/><circle cx="22" cy="23" r="3"/><circle cx="35" cy="36" r="3"/><rect x="48" y="4" width="12" height="37"/>',
  };
  return `<svg class="layout-wireframe" viewBox="0 0 64 46" aria-hidden="true">${shapes[id]}</svg>`;
}
function labHeader() {
  const applyLayout = state.layout === 'route' && !state.compare ? '<a class="subtle-button" href="/?layout=route#projects">应用到我的工作区 →</a>' : '';
  return `<header class="lab-head"><a href="/" class="lab-logo"><span class="logo-mark">拾</span>拾序 <span>/ 版面实验室</span></a><div class="lab-head-links">${syncButton()}<a href="/designs.html">第一轮设计</a><a href="/">返回工作区 ${icon('arrow')}</a></div></header><section class="lab-intro"><div><div class="eyebrow">LAYOUT EXPLORATIONS / 02</div><h1>找到你的工作节奏<span>。</span></h1><p>四种信息结构，四种记录方式。选一版，直接写写看。</p></div><div class="lab-intro-note"><span class="status-dot"></span> 可操作原型<span>共用同一组预览数据</span></div></section><nav class="layout-options" aria-label="选择版面设计">${options.map((o, i) => `<button class="layout-option ${state.layout === o.id && !state.compare ? 'selected' : ''}" data-layout="${o.id}" aria-pressed="${state.layout === o.id && !state.compare}">${wireframe(o.id)}<span><small>0${i + 1} / ${o.en}</small><strong>${o.name}</strong><em>${o.desc}</em></span></button>`).join('')}</nav><div class="lab-controlbar"><p>${state.compare ? '同一份内容，比较四种信息组织方式' : `<strong>${options.find(o => o.id === state.layout).shortcut}</strong><span>${options.find(o => o.id === state.layout).use}</span>`}</p><div>${applyLayout}<button class="subtle-button ${state.compare ? 'active' : ''}" data-action="compare" aria-pressed="${state.compare}">${icon('grid')}并排比较</button><button class="subtle-button" data-action="device" aria-pressed="${state.phone}">${state.phone ? '桌面预览' : '手机预览'}</button><a class="subtle-button" href="/layouts.html?layout=${state.layout}&present=1" target="_blank" rel="noopener">独立打开 ${icon('arrow')}</a></div></div>`;
}
function filteredData() {
  const query = state.query.trim().toLocaleLowerCase();
  let projects = data.projects.filter(p => state.filter === 'all' || (state.filter === 'done' ? p.status === 'done' : p.status !== 'done'));
  let notes = data.notes;
  if (query) {
    const related = new Set(notes.filter(n => `${n.title} ${n.body}`.toLocaleLowerCase().includes(query)).flatMap(n => n.projectIds));
    projects = projects.filter(p => related.has(p.id) || `${p.title} ${p.description} ${p.tasks.map(t => t.title).join(' ')}`.toLocaleLowerCase().includes(query));
    notes = notes.filter(n => `${n.title} ${n.body}`.toLocaleLowerCase().includes(query) || n.projectIds.some(id => projectById(id)?.title.toLocaleLowerCase().includes(query)));
  }
  return { ...data, projects, notes };
}
function surface() {
  const filtered = filteredData();
  const ctx = { data: filtered, state, esc, icon, pct, statusName, date, taskRow, captureForm, progress, recordList };
  return `<section class="layout-surface layout-${state.layout}" data-layout="${state.layout}"><header class="workspace-bar"><a href="/" class="workspace-brand"><span class="logo-mark">拾</span><strong>拾序</strong><span>我的工作台</span></a><div class="workspace-tools">${syncButton()}<label class="workspace-search">${icon('search')}<input type="search" id="workspace-search" placeholder="搜索项目与记录" aria-label="搜索项目与记录" value="${esc(state.query)}"><kbd>/</kbd></label><button class="quick-trigger" data-action="capture" aria-label="快速记录">${icon('plus')}<span>记录</span><kbd>N</kbd></button></div></header>${storageError ? `<div class="storage-error" role="alert">${esc(storageError)} <button data-action="export">导出当前预览</button></div>` : ''}${state.query ? `<div class="search-summary">找到 ${filtered.projects.length} 个项目、${filtered.notes.length} 条记录<button data-action="clear-search">清除搜索</button></div>` : ''}<main id="layout-main" tabindex="-1">${options.find(o => o.id === state.layout).render(ctx)}${state.query ? `<section class="search-notes"><h2>匹配的记录</h2>${recordList(filtered.notes, 100)}</section>` : ''}</main><footer class="workspace-foot"><span><span class="status-dot"></span>${storageError ? '当前更改仅在页面内' : '预览数据保存在此浏览器'}</span><span>独立实验室空间 · 可登录同步</span><button data-action="export">导出记录 ${icon('arrow')}</button></footer></section>`;
}
function comparison() {
  return `<div class="layout-comparison">${options.map((o, i) => `<article class="compare-item"><header><div><small>0${i + 1} / ${o.en}</small><h2>${o.name}</h2><p>${o.desc}</p></div><button class="subtle-button" data-layout="${o.id}">打开体验 ${icon('arrow')}</button></header><div class="compare-viewport"><iframe src="/layouts.html?layout=${o.id}&present=1" title="${o.name}可操作预览" loading="eager"></iframe></div></article>`).join('')}</div>`;
}
function updateURL() {
  const next = new URL(location.href); next.searchParams.set('layout', state.layout);
  for (const [key, on, value] of [['compare', state.compare, '1'], ['device', state.phone, 'phone']]) {
    if (on) next.searchParams.set(key, value); else next.searchParams.delete(key);
  }
  history.replaceState(null, '', next);
}
function rememberUI() {
  const el = document.activeElement;
  const form = el?.closest('.quick-capture');
  return { id: el?.id, task: el?.dataset.task, projectId: el?.dataset.projectId, field: form ? el.name : null, form: form?.dataset.capture, selection: typeof el?.selectionStart === 'number' ? el.selectionStart : null, scroll: scrollY,
    openDetails: [...document.querySelectorAll('#layout-main details[open]')].map(d => d.dataset.projectDetails || d.id).filter(Boolean) };
}
function render({ restore = true } = {}) {
  const before = rememberUI();
  document.body.classList.toggle('present-mode', state.present);
  document.title = `拾序 · ${options.find(o => o.id === state.layout).name}`;
  $('#layout-app').innerHTML = state.present ? surface() : `<div class="lab-shell">${labHeader()}${state.compare ? comparison() : state.phone ? `<div class="phone-stage"><iframe title="手机交互预览" src="/layouts.html?layout=${state.layout}&present=1"></iframe></div>` : surface()}<footer class="lab-bottom"><span>每一版都能记录、完成任务、查看项目。</span><span>键盘：N 记录 · / 搜索 · Ctrl / ⌘ Enter 保存</span></footer></div>`;
  updateURL();
  syncUI?.refresh();
  if (restore) {
    let target = before.id ? document.getElementById(before.id) : null;
    if (before.task) target = [...document.querySelectorAll('[data-task]')].find(el => el.dataset.task === before.task && el.dataset.projectId === before.projectId);
    if (before.field) target = [...document.querySelectorAll('.quick-capture')].find(f => f.dataset.capture === before.form)?.elements[before.field];
    target?.focus({ preventScroll: true });
    if (before.selection !== null && target?.tagName === 'TEXTAREA') target.setSelectionRange(before.selection, before.selection);
    for (const details of document.querySelectorAll('#layout-main details')) if (before.openDetails.includes(details.dataset.projectDetails || details.id)) details.open = true;
    window.scrollTo(0, before.scroll);
  }
}
function announce(message) {
  const toast = $('#layout-toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(announce.timer); announce.timer = setTimeout(() => toast.classList.remove('visible'), 3600);
}
function saveData() {
  if (storageError) return false;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== lastStored) { storageError = '另一窗口已更新预览，请先导出当前更改，再刷新读取最新内容。'; return false; }
    const serialized = JSON.stringify(data); localStorage.setItem(STORAGE_KEY, serialized); lastStored = serialized; syncClient?.localChanged(); return true;
  } catch { storageError = '浏览器保存失败，当前更改仍在页面中，请导出保存。'; return false; }
}
function dialogMarkup() {
  const p = activeDetail?.type === 'project' && projectById(activeDetail.id);
  const n = activeDetail?.type === 'note' && noteById(activeDetail.id);
  if (!p && !n) return '';
  return `<header class="detail-head"><span class="eyebrow">${p ? 'PROJECT / 项目详情' : 'NOTE / 记录详情'}</span><button class="icon-button" data-action="close-detail" aria-label="关闭详情">${icon('close')}</button></header>${p ? `<h2 id="detail-title">${esc(p.title)}</h2><p class="detail-description">${esc(p.description)}</p><div class="detail-meta"><label>项目状态 <select data-status="${esc(p.id)}" aria-label="项目状态">${statuses.map(s => `<option value="${s.id}" ${p.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label><span>截止 ${date(p.due)}</span></div>${progress(p)}<h3>任务清单</h3><div class="detail-tasks">${p.tasks.map(t => taskRow(p, t)).join('') || '<p class="empty-copy">还没有任务，在下面写下第一步。</p>'}</div>${captureForm({ id: 'detail', projectId: p.id, compact: true, label: '记录这个项目的进展' })}<h3>关联笔记</h3>${recordList(data.notes.filter(n => n.projectIds.includes(p.id)), 100)}` : `<h2 id="detail-title">${esc(n.title)}</h2><div class="note-meta">${date(n.updatedAt)} · ${n.inbox ? '收集箱' : esc(n.category)}${n.projectIds.map(id => `<button data-project="${esc(id)}">${esc(projectById(id)?.title)} ${icon('arrow')}</button>`).join('')}</div><div class="note-body">${esc(n.body.replace(/^# [^\n]*\n\n/, ''))}</div>${n.inbox ? '<p class="empty-copy">先把想法留住，之后再整理。</p>' : ''}`}`;
}
function openDetail(type, id) {
  if (!$('#detail-dialog').open) {
    lastOpener = document.activeElement;
    openerKey = { type, id };
  }
  activeDetail = { type, id };
  const dialog = $('#detail-dialog'); dialog.innerHTML = dialogMarkup();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[data-action="close-detail"]')?.focus();
}
function refreshDetail() {
  if (!activeDetail) return;
  const dialog = $('#detail-dialog'), position = dialog.scrollTop;
  const focused = document.activeElement;
  const task = focused?.dataset.task, status = focused?.dataset.status, field = focused?.closest('.quick-capture') ? focused.name : null;
  dialog.innerHTML = dialogMarkup(); dialog.scrollTop = position;
  let target = task ? [...dialog.querySelectorAll('[data-task]')].find(el => el.dataset.task === task) : null;
  if (status) target = dialog.querySelector('[data-status]');
  if (field) target = dialog.querySelector('.quick-capture')?.elements[field];
  (target || dialog.querySelector('[data-action="close-detail"]'))?.focus({ preventScroll: true });
}
function closeDetail() { $('#detail-dialog').close(); }
$('#detail-dialog').addEventListener('close', () => {
  activeDetail = null; render();
  const replacement = openerKey && [...document.querySelectorAll(`#layout-main [data-${openerKey.type}]`)].find(el => el.dataset[openerKey.type] === openerKey.id);
  (lastOpener?.isConnected ? lastOpener : replacement || $('#layout-main'))?.focus({ preventScroll: true });
});

document.addEventListener('input', e => {
  const form = e.target.closest('.quick-capture');
  if (form && e.target.name === 'body') state.draft = { body: e.target.value, kind: form.elements.kind.value, projectId: form.elements.projectId.value, formId: form.dataset.capture };
  if (e.target.id === 'workspace-search') { state.query = e.target.value; render(); }
});
document.addEventListener('change', e => {
  const el = e.target, form = el.closest('.quick-capture');
  if (form && ['kind', 'projectId'].includes(el.name)) {
    state.draft = { body: form.elements.body.value, kind: form.elements.kind.value, projectId: form.elements.projectId.value, formId: form.dataset.capture };
    render(); refreshDetail(); return;
  }
  if (el.dataset.task) {
    const p = projectById(el.dataset.projectId), t = p?.tasks.find(t => t.id === el.dataset.task);
    if (!t) return;
    t.done = el.checked; p.updatedAt = new Date().toISOString();
    const saved = saveData(); render(); refreshDetail();
    announce(`${t.done ? '已完成' : '已恢复'}：${t.title}${saved ? '' : '（尚未保存，请导出）'}`);
  }
  if (el.dataset.status && statuses.some(s => s.id === el.value)) {
    const p = projectById(el.dataset.status); if (!p) return; p.status = el.value; p.updatedAt = new Date().toISOString();
    const saved = saveData(); render(); refreshDetail(); announce(saved ? '项目状态已更新' : '状态已更新，尚未保存，请导出');
  }
});
document.addEventListener('submit', e => {
  const form = e.target.closest('.quick-capture'); if (!form) return; e.preventDefault();
  const body = form.elements.body.value.trim(); if (!body) { form.elements.body.focus(); return; }
  const kind = form.elements.kind.value, projectId = form.elements.projectId.value;
  const now = new Date().toISOString(); let message;
  if (kind === 'task') {
    const p = projectById(projectId) || data.projects[0];
    if (!p) { announce('还没有项目，请先记录为笔记。'); return; }
    const titles = body.split(/\r?\n/).map(s => s.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
    if (titles.length > 100 || titles.some(t => t.length > 500) || p.tasks.length + titles.length > 1000) { announce('一次最多添加 100 项，每项不超过 500 字。'); return; }
    for (const title of titles) p.tasks.push({ id: crypto.randomUUID(), title, done: false });
    p.updatedAt = now; state.selectedProject = p.id;
    message = `已添加 ${titles.length} 项任务到「${p.title}」`;
  } else {
    data.notes.unshift({ id: crypto.randomUUID(), title: body.split('\n')[0].slice(0, 100), summary: body.slice(0, 120), body, category: '随手记录', tags: [], projectIds: projectId ? [projectId] : [], inbox: !projectId, updatedAt: now });
    message = projectId ? '已保存记录，并关联到项目' : '已保存到收集箱';
  }
  const saved = saveData(); state.draft.body = ''; state.query = '';
  render(); refreshDetail();
  const container = activeDetail ? $('#detail-dialog') : document;
  container.querySelector('.quick-capture textarea')?.focus({ preventScroll: true });
  announce(saved ? message : `${message}；尚未写入浏览器，请导出`);
});
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  if (el.dataset.layout) { state.layout = el.dataset.layout; state.compare = false; state.filter = 'all'; render({ restore: false }); return; }
  if (el.dataset.project) { openDetail('project', el.dataset.project); return; }
  if (el.dataset.note) { openDetail('note', el.dataset.note); return; }
  if (el.dataset.selectProject) { state.selectedProject = el.dataset.selectProject; state.draft.projectId = el.dataset.selectProject; render(); return; }
  if (el.dataset.filter) { state.filter = el.dataset.filter; render(); return; }
  switch (el.dataset.action) {
    case 'account': syncUI?.open(); break;
    case 'compare': state.compare = !state.compare; render(); break;
    case 'device': state.phone = !state.phone; state.compare = false; render(); break;
    case 'capture': focusCapture(); break;
    case 'close-detail': closeDetail(); break;
    case 'clear-search': state.query = ''; render(); break;
    case 'export': {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = '拾序-版面预览记录.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); break;
    }
  }
});
function focusCapture() {
  const field = (activeDetail ? $('#detail-dialog') : document).querySelector('.quick-capture textarea');
  field?.scrollIntoView({ block: 'center', behavior: 'instant' }); field?.focus({ preventScroll: true });
}
document.addEventListener('keydown', e => {
  if (e.target.closest('#sync-dialog')) return;
  const editing = e.target.matches('input,textarea,select,[contenteditable=true]');
  if (e.isComposing) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && e.target.closest('.quick-capture')) { e.preventDefault(); e.target.closest('form').requestSubmit(); return; }
  if (!editing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); focusCapture(); }
  if (!editing && e.key === '/' && !activeDetail) { e.preventDefault(); $('#workspace-search')?.focus(); }
});
window.addEventListener('storage', e => {
  if (e.key !== STORAGE_KEY || !e.newValue || storageError) return;
  try { data = validateData(JSON.parse(e.newValue)); lastStored = e.newValue; if (state.present || (!state.compare && !state.phone)) { render(); refreshDetail(); } } catch { /* Keep the current valid preview. */ }
});
window.addEventListener('pageshow', () => {
  if (storageError) return;
  try { const stored = localStorage.getItem(STORAGE_KEY); if (stored && stored !== lastStored) { data = validateData(JSON.parse(stored)); lastStored = stored; render(); } } catch { /* Current data remains usable. */ }
});
if (!lastStored && !storageError) saveData();
render({ restore: false });

function canSyncWorkspace() {
  if (storageError || activeDetail || state.draft.body) return false;
  const active = document.activeElement;
  if (active?.matches('input,textarea,select,[contenteditable=true]') && !active.closest('#sync-dialog')) return false;
  try { return localStorage.getItem(STORAGE_KEY) === lastStored; } catch { return false; }
}
syncClient = createSyncClient({
  space: 'lab', storageKey: STORAGE_KEY, freshLocal,
  getData: () => data, canSync: canSyncWorkspace,
  applyData(next) {
    if (!canSyncWorkspace()) return false;
    try {
      const incoming = validateData(next), serialized = JSON.stringify(incoming);
      localStorage.setItem(STORAGE_KEY, serialized); lastStored = serialized; data = incoming;
      render(); return true;
    } catch { return false; }
  },
  onStatus: status => syncUI?.refresh(status),
});
syncUI = createSyncUI(syncClient, { space: 'lab' });
void syncClient.start();
document.addEventListener('focusout', event => {
  if (event.target.matches('input,textarea,select') && !event.target.closest('#sync-dialog')) setTimeout(() => { if (canSyncWorkspace()) void syncClient.syncNow(); }, 0);
});

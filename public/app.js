import { seedData, validateData, statuses, priorities, categories } from './data.js';
import { prepare, layout, setLocale } from './vendor/pretext/layout.js';
import { createSyncClient } from './sync-client.js';
import { createSyncUI, syncButton } from './sync-ui.js';
import { renderRoute } from './layouts-matrix-route.js';

const icons = {
  logo: '<path d="M4 4h10v4H8v8h6v4H4zM18 4h3v16h-3zM11 11h9v3h-9z" fill="currentColor" stroke="none"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16M5.5 8h1M11.5 8h1M17.5 8h1M5.5 12h1M11.5 12h1"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M10 4v16"/>',
  book: '<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
  inbox: '<path d="M4 4h16l2 11v5H2v-5zM2 15h6l2 3h4l2-3h6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  sort: '<path d="M8 4v16m-4-4 4 4 4-4M15 5h5M15 10h4M15 15h3"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
  settings: '<path d="m9 3-.5 2-2 1-2-.5-2 3 1.5 1.5v3L2.5 15l2 3 2-.5 2 1L9 21h5l.5-2.5 2-1 2 .5 2-3-1.5-2v-3L20.5 8l-2-3-2 .5-2-1L14 3z"/><circle cx="11.5" cy="12" r="3"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18"/>',
  pen: '<path d="m15 4 5 5-11 11H4v-5zM13 6l5 5M15 4l2-2 5 5-2 2"/>',
  mountain: '<path d="m2 20 7-12 4 6 3-9 6 15zM6 13l3 2 2-2M14 10l2 1 2-1"/>',
  camera: '<path d="M8 6l2-3h4l2 3h4a2 2 0 0 1 2 2v11H2V8a2 2 0 0 1 2-2z"/><circle cx="12" cy="12" r="4"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  progress: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" opacity=".5"/>',
  review: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M7 15h2M13 15h3"/>',
  link: '<path d="m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
  flag: '<path d="M5 21V3c5-4 9 4 14 0v11c-5 4-9-4-14 0"/>',
  pin: '<path d="m15 3 6 6-4 1-4 6-5-5 6-4zM8 16l-5 5"/>',
  cloud: '<path d="M6 18a5 5 0 1 1 1-10 6 6 0 0 1 11-1 5.5 5.5 0 0 1 0 11M8 17l4-4 4 4M12 13v9"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  laptop: '<path d="M5 4h14v12H5zM2 20h20l-3-4H5z"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4M10 5h4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  tag: '<path d="M3 3h9l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1.3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 4M12 17h.01"/>',
};
const icon = (name, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${icons[name] || icons.note}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => crypto.randomUUID();
const KEY = 'shixu.workspace.v1';
const LAYOUT_KEY = 'shixu.workspace.layout.v1';
const workspaceViews = ['route', 'board', 'table'];
let workspaceView = 'route';
try { const savedView = localStorage.getItem(LAYOUT_KEY); if (workspaceViews.includes(savedView)) workspaceView = savedView; } catch { /* The current view still works without browser storage. */ }
const entryURL = new URL(location.href), requestedView = entryURL.searchParams.get('layout');
if (workspaceViews.includes(requestedView)) {
  workspaceView = requestedView;
  try { localStorage.setItem(LAYOUT_KEY, workspaceView); } catch { /* Render the requested layout even when its preference cannot be saved. */ }
  entryURL.searchParams.delete('layout'); history.replaceState(null, '', entryURL);
}
const routeState = { selectedProject: null, filter: 'all', kind: 'note', drafts: new Map() };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let data, lastDisk = null, storageError = '', toastTimer, modal = null, selectedCategory = '全部笔记', syncClient, syncUI;
let filters = { status: '', priority: '', tag: '' }, editorMode = 'preview', dragId = null, importCandidate = null;
try {
  lastDisk = localStorage.getItem(KEY);
  data = lastDisk ? validateData(JSON.parse(lastDisk)) : seedData();
} catch { data = seedData(); storageError = '本机数据无法读取，当前显示示例内容'; }
const freshLocal = lastDisk === null && !storageError;

function save(entity) {
  if (entity) entity.updatedAt = new Date().toISOString();
  if (storageError) { toast('保存受阻，请先导出内容，再重新加载。'); return false; }
  try {
    if (localStorage.getItem(KEY) !== lastDisk) throw new Error('另一个窗口已更新数据，请先导出当前编辑，再重新加载');
    const next = JSON.stringify(data);
    localStorage.setItem(KEY, next);
    lastDisk = next;
    $$('.save-state').forEach(el => el.innerHTML = `${icon('checkCircle')}本机已保存`);
    syncClient?.localChanged();
    return true;
  } catch (error) {
    storageError = error.message.includes('另一个窗口') ? error.message : '保存失败，可能是浏览器存储空间不足';
    toast(`${storageError}，请导出备份。`);
    $$('.save-state').forEach(el => { el.classList.add('error'); el.innerHTML = '尚未保存'; });
    return false;
  }
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
const getProject = id => data.projects.find(p => p.id === id);
const getNote = id => data.notes.find(n => n.id === id);
const progress = p => p.tasks.length ? Math.round(p.tasks.filter(t => t.done).length / p.tasks.length * 100) : 0;
const noteCount = p => data.notes.filter(n => n.projectIds.includes(p.id)).length;
const fmtDate = value => value ? `${Number(value.slice(5, 7))} 月 ${Number(value.slice(8, 10))} 日` : '未设日期';
const statusBy = id => statuses.find(s => s.id === id) || statuses[0];
function route() {
  let parts; try { parts = decodeURIComponent(location.hash.slice(1)).split('/'); } catch { parts = []; }
  const section = ['projects', 'knowledge', 'inbox'].includes(parts[0]) ? parts[0] : 'projects';
  return { section, kind: parts[1], id: parts[2] };
}
function navigate(section) { if (location.hash === `#${section}`) render(); else location.hash = section; }
function openProject(id) { modal = null; navigate(`${route().section}/project/${encodeURIComponent(id)}`); }
function openNote(id) { modal = null; editorMode = 'preview'; navigate(`${route().section}/note/${encodeURIComponent(id)}`); }
function closeDrawer() { navigate(route().section); }
function filteredProjects() {
  const result = data.projects.filter(p => (!filters.status || p.status === filters.status) && (!filters.priority || p.priority === filters.priority) && (!filters.tag || p.tag === filters.tag));
  return result.sort((a, b) => data.preferences.sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : data.preferences.sort === 'due' ? (a.due || '9999').localeCompare(b.due || '9999') : new Date(b.updatedAt) - new Date(a.updatedAt));
}
function navItem(section, name, label, count = '') {
  return `<a class="nav-item ${route().section === section ? 'active' : ''}" href="#${section}" ${route().section === section ? 'aria-current="page"' : ''}>${icon(name)}${label}${count !== '' ? `<span class="nav-count">${count}</span>` : ''}</a>`;
}
function sidebar() {
  return `<aside class="sidebar" aria-label="主导航">
    <a class="brand" href="#projects"><span class="brand-mark">${icon('logo')}</span><div><div class="brand-name">拾序</div><div class="brand-en">SHIXU</div></div></a>
    <button class="workspace" data-action="account"><span class="workspace-avatar">我</span><span class="workspace-text"><strong>我的个人空间</strong><small>PERSONAL WORKSPACE</small></span>${icon('down')}</button>
    <div class="nav-caption">工作空间</div>
    <nav>${navItem('projects', 'grid', '我的项目', data.projects.length)}${navItem('knowledge', 'book', '知识库', data.notes.filter(n => !n.inbox).length)}${navItem('inbox', 'inbox', '收集箱', data.notes.filter(n => n.inbox).length)}
    <button class="nav-item nav-search" data-action="search">${icon('search')}搜索全部<kbd>Ctrl K</kbd></button></nav>
    <div class="side-divider"></div><div class="pinned-heading"><div class="nav-caption">已置顶</div>${icon('pin', 'style="width:12px;height:12px;color:#b6becd;margin-right:16px"')}</div>
    ${data.projects.filter(p => p.pinned).map(p => `<a class="pinned-link" href="#projects/project/${esc(p.id)}"><span class="pin-dot ${esc(p.color)}"></span><span>${esc(p.title)}</span></a>`).join('') || '<div class="nav-caption" style="letter-spacing:0;margin-top:12px">在项目详情中置顶常用项目</div>'}
    <div class="sidebar-bottom"><button class="nav-item" data-action="quick-note">${icon('plus')}快速记录<kbd style="margin-left:auto">N</kbd></button>
    <div class="local-note"><div class="local-note-title">${icon('shield')}灵感和进展，都留在手边</div><p>记录自动保存在本机<br>登录账号，可在多台设备继续</p></div>
    <button class="profile" data-action="settings"><span class="avatar">我</span><span><strong>本地工作区</strong><small>数据与备份</small></span>${icon('settings')}</button></div>
  </aside>`;
}
function topbar() {
  const sectionName = { projects: '我的项目', knowledge: '知识库', inbox: '收集箱' }[route().section];
  return `<header class="topbar"><div class="breadcrumb">${icon('layout')}<span class="workspace-crumb">个人空间</span><span class="slash">/</span><strong>${sectionName}</strong></div>
    <div class="top-actions"><button class="save-state ${storageError ? 'error' : ''}" data-action="settings" aria-label="查看本机保存与备份状态">${icon(storageError ? 'help' : 'checkCircle')}${storageError ? '尚未保存' : '本机已保存'}</button><a class="icon-button" href="/layouts.html" aria-label="四种布局探索" title="四种布局探索">${icon('grid')}</a><a class="icon-button" href="/designs.html" aria-label="Apple Design 版面探索" title="版面探索">${icon('layout')}</a>${syncButton()}<button class="icon-button" data-action="search" aria-label="搜索">${icon('search')}</button><button class="avatar top-avatar" data-action="account" aria-label="个人账号">我</button></div></header>`;
}
function mobileNav() {
  return `<nav class="mobile-nav" aria-label="手机导航">${[['projects', 'grid', '项目'], ['knowledge', 'book', '知识'], ['inbox', 'inbox', '收集箱']].map(([section, name, label]) => `<a href="#${section}" class="${route().section === section ? 'active' : ''}" ${route().section === section ? 'aria-current="page"' : ''}>${icon(name)}${label}</a>`).join('')}<button class="mobile-create" data-action="quick-note">${icon('plus')}记录</button><button data-action="settings">${icon('settings')}设置</button></nav>`;
}
function projectCard(p) {
  const count = p.tasks.filter(t => t.done).length;
  return `<article class="project-card ${p.status === 'done' ? 'done' : ''}" tabindex="0" role="button" draggable="true" data-project="${esc(p.id)}" aria-label="打开项目：${esc(p.title)}">
    <div class="card-top"><div class="project-icon ${esc(p.color)}">${icon(p.icon)}</div>${p.priority === 'high' ? `<span class="priority-flag">${icon('flag')}优先</span>` : ''}</div>
    <h3 class="card-title">${esc(p.title)}</h3><p class="card-description" data-pretext>${esc(p.description || '还没有项目说明，打开项目写下你的计划。')}</p>
    <div class="card-tags"><span class="tag ${esc(p.color)}">${esc(p.tag || '未分类')}</span></div>
    <div class="progress-meta"><span>${p.tasks.length ? `${count} / ${p.tasks.length} 项任务` : '暂无任务'}</span><strong>${p.tasks.length ? `${progress(p)}%` : '—'}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${progress(p)}%"></div></div>
    <div class="card-footer"><span>${icon('calendar')}${fmtDate(p.due)}</span><span>${icon('note')}${noteCount(p)} 篇笔记</span></div>
  </article>`;
}
function boardMarkup(projects) {
  const byPriority = data.preferences.group === 'priority';
  const groups = byPriority ? Object.entries(priorities).map(([id, label], index) => ({ id, label: label.replace('优先级', '优先级'), color: ['amber', 'blue', 'gray'][index] })) : statuses;
  return `<div class="board ${byPriority ? 'three' : ''}" aria-label="项目看板">${groups.map(s => {
    const cards = projects.filter(p => p[byPriority ? 'priority' : 'status'] === s.id);
    return `<section class="column" data-drop="${s.id}" aria-label="${s.label}"><div class="column-header"><span class="column-status ${s.color}"></span>${s.label}<span class="column-count">${cards.length}</span><button class="icon-button" data-action="new-project" data-default-group="${s.id}" aria-label="在${s.label}新建项目">${icon('plus')}</button></div>${cards.map(projectCard).join('')}<button class="add-card" data-action="new-project" data-default-group="${s.id}">${icon('plus')}新建项目</button></section>`;
  }).join('')}</div>`;
}
function tableMarkup(projects) {
  return `<div class="table-wrap"><table class="project-table"><thead><tr><th>项目名称</th><th>状态</th><th>分类</th><th>进度</th><th>截止日期</th>${data.fields.map(f => `<th>${esc(f.name)}</th>`).join('')}<th><button class="add-property" data-action="new-field">${icon('plus')}添加属性</button></th></tr></thead><tbody>${projects.map(p => `<tr data-project="${esc(p.id)}" tabindex="0" aria-label="打开项目：${esc(p.title)}"><td><span class="table-title"><span class="project-icon ${esc(p.color)}">${icon(p.icon)}</span>${esc(p.title)}</span></td><td><span class="table-status"><span class="column-status ${statusBy(p.status).color}"></span>${statusBy(p.status).label}</span></td><td><span class="tag ${esc(p.color)}">${esc(p.tag || '未分类')}</span></td><td><span class="table-progress"><span class="progress-track"><span class="progress-fill" style="display:block;width:${progress(p)}%"></span></span>${p.tasks.length ? `${progress(p)}%` : '—'}</span></td><td style="color:#9ba5b6;white-space:nowrap">${fmtDate(p.due)}</td>${data.fields.map(f => `<td class="field-cell">${f.type === 'checkbox' ? (p.custom[f.id] ? '✓' : '—') : esc(p.custom[f.id] ?? '—')}</td>`).join('')}<td></td></tr>`).join('')}</tbody></table></div>`;
}
function routeDraft(projectId = routeState.selectedProject) {
  return routeState.drafts.get(projectId || '') || '';
}
function routeCapture({ projectId = null }) {
  const kind = projectId ? routeState.kind : 'note';
  return `<form id="route-capture-form" class="route-capture" data-project-id="${esc(projectId || '')}">
    <div class="route-capture-kind" aria-label="记录类型"><button type="button" data-route-kind="note" aria-pressed="${kind === 'note'}">笔记</button><button type="button" data-route-kind="task" aria-pressed="${kind === 'task'}" ${projectId ? '' : 'disabled'}>任务</button></div>
    <label class="sr-only" for="route-capture-body">线路记录</label><textarea id="route-capture-body" name="body" rows="4" maxlength="200000" required placeholder="${kind === 'task' ? '每行一个任务，写下接下来要做的事…' : '记下此刻的想法…'}">${esc(routeDraft(projectId))}</textarea>
    <div class="route-capture-footer"><span>${kind === 'task' ? '每行一个任务' : projectId ? '保存到当前项目' : '保存到收集箱'}</span><button class="button primary" type="submit">保存记录</button></div>
  </form>`;
}
function routeRecords(notes, limit) {
  return `<div class="route-records record-list">${[...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, limit).map(n => `<button type="button" data-note="${esc(n.id)}">${icon('note')}<span><strong>${esc(n.title)}</strong><small>${esc(n.summary || fmtDate(n.updatedAt.slice(0, 10)))}</small></span>${icon('arrow')}</button>`).join('') || '<p class="empty">还没有随行笔记，记下第一条想法吧。</p>'}</div>`;
}
function routeMarkup(projects) {
  const visible = projects.filter(p => routeState.filter === 'all' || (routeState.filter === 'done' ? p.status === 'done' : p.status !== 'done'));
  if (!visible.some(p => p.id === routeState.selectedProject)) routeState.selectedProject = visible[0]?.id || null;
  return renderRoute({ data: { ...data, projects: visible }, state: routeState, esc, icon: (name) => icon(name === 'route' ? 'compass' : name), pct: progress, date: fmtDate, captureForm: routeCapture, recordList: routeRecords });
}
function saveRouteCapture(form) {
  const body = String(new FormData(form).get('body') || '').trim();
  const input = form.querySelector('textarea');
  if (!body) { input.setCustomValidity('请填写内容，不能只有空格。'); input.reportValidity(); return; }
  if (storageError) { toast('保存受阻，请先导出内容，再重新加载。'); return; }
  const projectId = form.dataset.projectId, project = getProject(projectId);
  if (projectId && !project) { toast('项目已不存在，请重新选择项目。'); return; }
  let tasks = [], note;
  if (project && routeState.kind === 'task') {
    const titles = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (titles.some(title => title.length > 500) || project.tasks.length + titles.length > 1000) { toast('每项任务最多 500 字，每个项目最多 1000 项任务。'); return; }
    tasks = titles.map(title => ({ id: uid(), title, done: false }));
    project.tasks.push(...tasks);
  } else {
    if (data.notes.length >= 10000) { toast('笔记已达容量上限，请先整理现有记录。'); return; }
    note = { id: uid(), title: body.split(/\r?\n/)[0].slice(0, 200), body, summary: summarize(body), category: '产品与设计', tags: [], projectIds: project ? [project.id] : [], inbox: !project, updatedAt: new Date().toISOString() };
    data.notes.unshift(note);
  }
  const previousUpdatedAt = project?.updatedAt;
  if (!save(project)) {
    if (tasks.length) project.tasks.splice(-tasks.length);
    if (note) data.notes = data.notes.filter(n => n.id !== note.id);
    if (project) project.updatedAt = previousUpdatedAt;
    return;
  }
  routeState.drafts.delete(projectId || ''); render(); $('#route-capture-body')?.focus({ preventScroll: true });
  toast(tasks.length ? `已添加 ${tasks.length} 项任务。` : project ? '笔记已保存到当前项目。' : '想法已保存到收集箱。');
}
function projectsPage() {
  const projects = filteredProjects();
  const isRoute = workspaceView === 'route';
  const active = data.projects.filter(p => p.status === 'active').length;
  const finished = data.projects.filter(p => p.status === 'done').length;
  const focus = data.projects.find(p => p.pinned && p.status === 'active');
  const hasFilters = Object.values(filters).some(Boolean);
  return `<section class="page ${isRoute ? 'workspace-route' : ''}">${isRoute ? '' : `<div class="page-heading"><div><div class="eyebrow">${icon('grid')}YOUR PROJECTS</div><h1>我的项目</h1><p>让进展清晰，让知识沉淀。</p></div><div class="heading-actions"><button class="button primary" data-action="new-project">${icon('plus')}新建项目</button></div></div>
    <div class="stats-strip">${[['layers', data.projects.length, '全部项目'], ['progress', active, '正在进行'], ['checkCircle', finished, '已经完成'], ['note', data.notes.length, '积累笔记']].map(([name, value, label]) => `<div class="stat"><span class="stat-icon">${icon(name)}</span><div><span class="stat-value"><strong>${value}</strong><span>${label === '积累笔记' ? '篇' : '个'}</span></span><span class="stat-name">${label}</span></div></div>`).join('')}</div>
    ${focus ? `<div class="focus-banner"><span class="focus-icon">${icon('compass')}</span><div class="focus-text"><strong>继续上次的进展</strong>${esc(focus.title)}<span> · 还有 ${focus.tasks.filter(t => !t.done).length} 项任务待完成</span></div><button class="button" data-project="${esc(focus.id)}">打开项目${icon('arrow')}</button></div>` : ''}`}
    <div class="toolbar"><div class="view-tabs" aria-label="项目视图">${[['route', 'compass', '项目路线图'], ['board', 'board', '看板'], ['table', 'table', '表格']].map(([view, name, label]) => `<button class="view-tab ${workspaceView === view ? 'active' : ''}" data-view="${view}" aria-pressed="${workspaceView === view}">${icon(name)}${label}</button>`).join('')}</div><div class="toolbar-actions"><button class="button subtle ${hasFilters ? 'selected' : ''}" data-action="filter" aria-label="筛选项目">${icon('filter')}<span class="label-desktop">筛选</span>${hasFilters ? '<span>·</span>' : ''}</button><span class="toolbar-rule"></span><select class="toolbar-select" id="sort-select" aria-label="项目排序"><option value="updated" ${data.preferences.sort === 'updated' ? 'selected' : ''}>最近更新</option><option value="due" ${data.preferences.sort === 'due' ? 'selected' : ''}>截止日期</option><option value="title" ${data.preferences.sort === 'title' ? 'selected' : ''}>项目名称</option></select>${isRoute ? `<button class="button primary" data-action="new-project">${icon('plus')}新建项目</button>` : `<button class="button subtle" data-action="view-options" aria-label="视图设置">${icon('more')}</button>`}</div></div>
    ${hasFilters ? `<div class="filter-summary">已筛选 ${projects.length} 个项目<button data-action="clear-filter">清除筛选</button></div>` : ''}
    ${isRoute ? routeMarkup(projects) : !projects.length && hasFilters ? empty('没有符合条件的项目', '换一组筛选条件，或清除筛选查看全部。', 'clear-filter', '清除筛选') : workspaceView === 'board' ? boardMarkup(projects) : projects.length ? tableMarkup(projects) : empty('从第一个项目开始', '写下你正在做的事，进展从这里开始。', 'new-project', '新建项目')}
    <div class="page-footer">${icon('shield')}项目与笔记 · 修改先保存在本机 · ${workspaceView === 'board' ? '可拖动卡片调整分组，手机可在项目详情修改状态' : '同一份数据，不同的观察方式'}</div></section>`;
}
function empty(title, text, action, label) {
  return `<div class="empty-state">${icon('layers')}<h3>${title}</h3><p>${text}</p><button class="button" data-action="${action}">${icon('plus')}${label}</button></div>`;
}
function noteCard(n) {
  return `<article class="note-card" tabindex="0" role="button" data-note="${esc(n.id)}" aria-label="打开笔记：${esc(n.title)}">${icon('note')}<h3>${esc(n.title)}</h3><p data-pretext>${esc(n.summary || '写下一个想法，从这里开始积累。')}</p><div class="card-tags">${n.tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div><div class="card-footer"><span>${icon('link')}${n.projectIds.length ? `${n.projectIds.length} 个关联项目` : '尚未关联项目'}</span><span>${fmtDate(n.updatedAt.slice(0, 10))}</span></div></article>`;
}
function notesPage(inbox) {
  const notes = data.notes.filter(n => n.inbox === inbox && (inbox || selectedCategory === '全部笔记' || n.category === selectedCategory));
  return `<section class="page"><div class="page-heading"><div><div class="eyebrow">${icon(inbox ? 'inbox' : 'book')}${inbox ? 'CAPTURE YOUR IDEAS' : 'PERSONAL KNOWLEDGE'}</div><h1>${inbox ? '收集箱' : '知识库'}</h1><p>${inbox ? '先接住想法，再慢慢整理。' : '把项目中的经验，变成下一次出发的底气。'}</p></div><div class="heading-actions"><button class="button primary" data-action="${inbox ? 'quick-note' : 'new-note'}">${icon('plus')}${inbox ? '快速记录' : '新建笔记'}</button></div></div>
    ${inbox ? `<div class="inbox-intro">${icon('inbox')}<div><strong>让记录轻一点</strong>不必想好分类就能记下来。准备好时，打开笔记，把它移入知识库。</div></div><div class="inbox-list">${notes.map(noteCard).join('') || empty('想法来了，先记在这里', '无需分类、无需关联项目，一句话也值得记下来。', 'quick-note', '记下第一个想法')}</div>` : `<div class="toolbar"><div class="view-tabs"><span class="view-tab active">${icon('note')}所有笔记 <span style="font-size:10px;opacity:.6">${data.notes.filter(n => !n.inbox).length}</span></span></div><div class="toolbar-actions"><button class="button subtle" data-action="search">${icon('search')}搜索笔记</button></div></div><div class="knowledge-layout"><nav class="category-nav" aria-label="笔记分类">${categories.map(c => `<button class="category-button ${selectedCategory === c ? 'active' : ''}" data-category="${c}" aria-pressed="${selectedCategory === c}">${icon(c === '全部笔记' ? 'layers' : 'tag')}<span>${c}</span><span>${data.notes.filter(n => !n.inbox && (c === '全部笔记' || n.category === c)).length}</span></button>`).join('')}</nav><div>${notes.length ? `<div class="note-grid">${[...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(noteCard).join('')}</div>` : empty('这里还没有笔记', '记录一次思考，或者从项目中关联一篇笔记。', 'new-note', '新建笔记')}</div></div>`}
    <div class="page-footer">${icon('link')}笔记可以关联多个项目，知识只需保存一份。</div></section>`;
}
function projectDrawer(p) {
  const notes = data.notes.filter(n => n.projectIds.includes(p.id));
  return `<aside class="drawer" role="dialog" aria-modal="true" aria-label="项目详情：${esc(p.title)}" ${modal ? 'inert' : ''}>
    <div class="drawer-toolbar"><button class="icon-button" data-action="close-drawer" aria-label="关闭项目详情">${icon('back')}</button><span class="small-label">项目详情</span><button class="icon-button ${p.pinned ? 'pin-active' : ''}" data-action="toggle-pin" data-id="${esc(p.id)}" aria-label="${p.pinned ? '取消置顶' : '置顶项目'}" aria-pressed="${p.pinned}">${icon('pin')}</button><button class="icon-button" data-action="close-drawer" aria-label="关闭">${icon('close')}</button></div>
    <div class="drawer-scroll"><div class="drawer-header"><div class="project-icon ${esc(p.color)}">${icon(p.icon)}</div><input class="editable-title" id="project-title" data-edit-project="title" maxlength="200" value="${esc(p.title)}" aria-label="项目标题" required><textarea class="editable-description" id="project-description" data-edit-project="description" maxlength="20000" aria-label="项目说明">${esc(p.description)}</textarea></div>
    <div class="properties"><div class="property-row"><span class="property-label">${icon('progress')}项目状态</span><select id="project-status" data-edit-project="status" aria-label="项目状态">${statuses.map(s => `<option value="${s.id}" ${p.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
    <div class="property-row"><span class="property-label">${icon('flag')}优先级</span><select id="project-priority" data-edit-project="priority" aria-label="优先级">${Object.entries(priorities).map(([value, name]) => `<option value="${value}" ${p.priority === value ? 'selected' : ''}>${name}</option>`).join('')}</select></div>
    <div class="property-row"><span class="property-label">${icon('calendar')}截止日期</span><input id="project-due" type="date" data-edit-project="due" value="${esc(p.due)}" aria-label="截止日期"></div>
    <div class="property-row"><span class="property-label">${icon('tag')}项目分类</span><input id="project-tag" data-edit-project="tag" maxlength="60" value="${esc(p.tag)}" aria-label="项目分类"></div>
    ${data.fields.map(f => `<div class="property-row"><label class="property-label" for="field-${esc(f.id)}">${icon('tag')}${esc(f.name)}</label><input id="field-${esc(f.id)}" data-custom-field="${esc(f.id)}" type="${{ text: 'text', number: 'number', date: 'date', checkbox: 'checkbox' }[f.type]}" ${f.type === 'checkbox' ? (p.custom[f.id] ? 'checked' : '') : `value="${esc(p.custom[f.id] ?? '')}" maxlength="500"`} ${f.type === 'number' ? 'step="any"' : ''}></div>`).join('')}</div>
    <div class="section-heading">${icon('checkCircle')}项目任务<span>${p.tasks.filter(t => t.done).length}/${p.tasks.length}</span></div><div class="progress-meta"><span>任务完成进度</span><strong>${p.tasks.length ? `${progress(p)}%` : '暂无任务'}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${progress(p)}%"></div></div>
    <div class="task-list">${p.tasks.map(t => `<div class="task-row ${t.done ? 'is-done' : ''}"><input type="checkbox" id="task-${esc(t.id)}" data-task="${esc(t.id)}" ${t.done ? 'checked' : ''}><label for="task-${esc(t.id)}">${esc(t.title)}</label><button class="icon-button" data-action="delete-task" data-id="${esc(t.id)}" aria-label="删除任务：${esc(t.title)}">${icon('close')}</button></div>`).join('')}</div><form class="task-add" id="task-form"><input id="task-title" name="title" placeholder="添加一个具体的下一步…" maxlength="500" aria-label="新任务标题" required><button class="button" type="submit">${icon('plus')}添加</button></form>
    <div class="section-heading">${icon('book')}关联知识<span>${notes.length} 篇</span><button class="button small subtle" data-action="link-notes" data-id="${esc(p.id)}">${icon('link')}关联笔记</button></div>
    ${notes.map(n => `<button class="linked-note" data-note="${esc(n.id)}">${icon('note')}<span class="linked-note-info"><strong>${esc(n.title)}</strong><small>${esc(n.category)}${n.inbox ? ' · 收集箱' : ''}</small></span>${icon('chevron')}</button>`).join('') || '<p class="drawer-muted">关联一篇笔记，让项目和知识连接起来。</p>'}<button class="button small subtle" data-action="project-new-note" data-id="${esc(p.id)}">${icon('plus')}为此项目新建笔记</button>
    </div><div class="drawer-footer">${icon('shield')}修改自动保存在此浏览器<button class="danger-link" style="margin-left:auto" data-action="delete-project" data-id="${esc(p.id)}">${icon('trash')}删除项目</button></div></aside>`;
}
function inlineMarkdown(text) {
  return esc(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
function markdown(body) {
  let list = false, code = false;
  const lines = body.split('\n'), result = [];
  for (const line of lines) {
    if (line.startsWith('```')) { if (list) { result.push('</ul>'); list = false; } result.push(code ? '</code></pre>' : '<pre><code>'); code = !code; continue; }
    if (code) { result.push(esc(line) + '\n'); continue; }
    if (line.startsWith('- ')) { if (!list) result.push('<ul>'); list = true; result.push(`<li>${inlineMarkdown(line.slice(2))}</li>`); continue; }
    if (list) { result.push('</ul>'); list = false; }
    const h = line.match(/^(#{1,3}) (.*)$/);
    if (h) result.push(`<h${h[1].length}>${inlineMarkdown(h[2])}</h${h[1].length}>`);
    else if (line.startsWith('> ')) result.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
    else if (line.trim()) result.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  if (list) result.push('</ul>'); if (code) result.push('</code></pre>');
  return result.join('') || '<p>这里还是一张白纸。切换到编辑，写下你的第一个想法。</p>';
}
function noteDrawer(n) {
  return `<aside class="drawer" role="dialog" aria-modal="true" aria-label="笔记详情：${esc(n.title)}" ${modal ? 'inert' : ''}><div class="drawer-toolbar"><button class="icon-button" data-action="close-drawer" aria-label="关闭笔记">${icon('back')}</button><span class="small-label">${n.inbox ? '收集箱' : '知识库'} / ${esc(n.category)}</span>${n.inbox ? `<button class="button small" data-action="organize-note" data-id="${esc(n.id)}">${icon('book')}移入知识库</button>` : ''}<button class="icon-button" data-action="close-drawer" aria-label="关闭">${icon('close')}</button></div>
    <div class="drawer-scroll"><div class="drawer-header"><div class="project-icon blue">${icon('note')}</div><input class="editable-title" id="note-title" data-edit-note="title" value="${esc(n.title)}" maxlength="200" aria-label="笔记标题" required></div>
    <div class="properties"><div class="property-row"><label class="property-label" for="note-category">${icon('tag')}分类</label><select id="note-category" data-edit-note="category">${categories.slice(1).map(c => `<option ${n.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="property-row"><label class="property-label" for="note-tags">${icon('tag')}标签</label><input id="note-tags" data-edit-note="tags" maxlength="300" value="${esc(n.tags.join('，'))}" placeholder="用逗号分隔标签"></div>
    <div class="property-row"><span class="property-label">${icon('link')}关联项目</span><div class="project-links">${n.projectIds.map(id => { const p = getProject(id); return p ? `<button class="project-link-chip" data-project="${esc(id)}">${icon(p.icon)}${esc(p.title)}</button>` : ''; }).join('')}<button class="button small subtle" data-action="link-projects" data-id="${esc(n.id)}">${icon('plus')}关联</button></div></div></div>
    <div class="note-editor-tabs"><button data-editor-mode="preview" class="${editorMode === 'preview' ? 'active' : ''}" aria-pressed="${editorMode === 'preview'}">阅读</button><button data-editor-mode="edit" class="${editorMode === 'edit' ? 'active' : ''}" aria-pressed="${editorMode === 'edit'}">编辑</button></div>
    ${editorMode === 'edit' ? `<p class="property-tip">支持 # 标题、- 列表、> 引用、**加粗** 和代码块 · 自动本机保存</p><textarea class="note-editor" id="note-body" data-edit-note="body" aria-label="笔记正文" maxlength="200000" spellcheck="false">${esc(n.body)}</textarea>` : `<article class="markdown">${markdown(n.body)}</article>`}
    </div><div class="drawer-footer">${icon('shield')}修改自动保存在此浏览器<button class="danger-link" style="margin-left:auto" data-action="delete-note" data-id="${esc(n.id)}">${icon('trash')}删除笔记</button></div></aside>`;
}
function modalShell(title, body, className = '') {
  return `<section class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title" tabindex="-1">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon('close')}</button></div><div class="modal-body">${body}</div></section>`;
}
function formActions(label = '创建') { return `<div class="form-error" id="form-error" role="alert"></div><div class="form-actions"><button class="button" type="button" data-action="close-modal">取消</button><button class="button primary" type="submit">${label}</button></div>`; }
function selectField(label, name, options, value) { return `<label class="form-field"><span>${label}</span><select name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`; }
function modalMarkup() {
  if (!modal) return '';
  if (modal.type === 'search') return `<section class="modal search-modal" role="dialog" aria-modal="true" aria-label="搜索全部"><div class="search-input-wrap">${icon('search')}<input class="search-input" id="global-search" autocomplete="off" aria-label="搜索项目、任务和笔记" placeholder="搜索项目、任务和笔记…"><button class="icon-button" data-action="close-modal" aria-label="关闭搜索">${icon('close')}</button></div><div class="search-results" id="search-results">${searchResults('')}</div><div class="search-hint"><kbd>Esc</kbd>关闭搜索<span style="margin-left:auto">只搜索此工作区内容</span></div></section>`;
  if (modal.type === 'new-project') return modalShell('新建项目', `<p class="modal-subtitle">为正在做的事，留一个清晰的起点。</p><form id="project-form"><label class="form-field"><span>项目名称</span><input name="title" id="create-title" maxlength="200" placeholder="例如：我的个人网站" required autocomplete="off"></label><label class="form-field"><span>项目说明</span><textarea name="description" maxlength="20000" placeholder="这个项目想完成什么？"></textarea></label><div class="form-row">${selectField('状态', 'status', statuses.map(s => [s.id, s.label]), modal.status || 'planned')}${selectField('优先级', 'priority', Object.entries(priorities), modal.priority || 'medium')}</div><div class="form-row"><label class="form-field"><span>截止日期（可选）</span><input name="due" type="date"></label><label class="form-field"><span>分类（可选）</span><input name="tag" maxlength="60" placeholder="如：生活、创作"></label></div>${formActions('创建项目')}</form>`);
  if (modal.type === 'new-note') return modalShell(modal.inbox ? '记下一个想法' : '新建笔记', `<p class="modal-subtitle">${modal.inbox ? '不用急着分类。先让这个想法留下来。' : '记录思考，让经验可以被再次使用。'}</p><form id="note-form"><label class="form-field"><span>标题</span><input name="title" id="create-title" maxlength="200" placeholder="给这个想法起个名字" required autocomplete="off"></label><label class="form-field"><span>内容</span><textarea name="body" rows="6" maxlength="200000" placeholder="写下此刻的想法…"></textarea></label>${modal.inbox ? '' : selectField('分类', 'category', categories.slice(1).map(c => [c, c]), selectedCategory === '全部笔记' ? '产品与设计' : selectedCategory)}${formActions(modal.inbox ? '保存到收集箱' : '创建笔记')}</form>`);
  if (modal.type === 'filter') return modalShell('筛选项目', `<p class="modal-subtitle">把注意力放在当前需要的项目上。</p><form id="filter-form">${selectField('项目状态', 'status', [['', '全部状态'], ...statuses.map(s => [s.id, s.label])], filters.status)}${selectField('优先级', 'priority', [['', '全部优先级'], ...Object.entries(priorities)], filters.priority)}${selectField('项目分类', 'tag', [['', '全部分类'], ...[...new Set(data.projects.map(p => p.tag).filter(Boolean))].map(t => [t, t])], filters.tag)}${formActions('应用筛选')}</form>`);
  if (modal.type === 'view-options') return modalShell('视图设置', `<p class="modal-subtitle">看板与表格展示同一份项目数据。</p><form id="view-form">${selectField('看板分组', 'group', [['status', '按项目状态'], ['priority', '按优先级']], data.preferences.group)}<div class="notice">拖动卡片会修改对应的分组属性。手机上也可以打开项目详情，直接修改状态或优先级。</div>${formActions('保存设置')}</form>`);
  if (modal.type === 'new-field') return modalShell('添加项目属性', `<p class="modal-subtitle">为所有项目增加一个自定义字段，可在项目详情编辑。</p><form id="field-form"><label class="form-field"><span>属性名称</span><input id="create-title" name="name" placeholder="例如：参考链接、预算" maxlength="40" required></label>${selectField('字段类型', 'type', [['text', '文本'], ['number', '数字'], ['date', '日期'], ['checkbox', '复选框']], 'text')}${formActions('添加属性')}</form>`);
  if (modal.type === 'link-notes') {
    const p = getProject(modal.id);
    return modalShell('关联已有笔记', `<p class="modal-subtitle">选择与「${esc(p?.title)}」相关的笔记。原有笔记不会被复制。</p><form id="link-notes-form"><div class="check-list">${data.notes.map(n => `<label class="check-item"><input type="checkbox" name="notes" value="${esc(n.id)}" ${n.projectIds.includes(modal.id) ? 'checked' : ''}>${icon('note')}${esc(n.title)}</label>`).join('') || '<p class="drawer-muted">先创建一篇笔记，再来建立关联。</p>'}</div>${formActions('保存关联')}</form>`);
  }
  if (modal.type === 'link-projects') {
    const n = getNote(modal.id);
    return modalShell('关联项目', `<p class="modal-subtitle">一篇笔记，可以为多个项目提供帮助。</p><form id="link-projects-form"><div class="check-list">${data.projects.map(p => `<label class="check-item"><input type="checkbox" name="projects" value="${esc(p.id)}" ${n?.projectIds.includes(p.id) ? 'checked' : ''}>${icon(p.icon)}${esc(p.title)}</label>`).join('') || '<p class="drawer-muted">先创建一个项目，再来建立关联。</p>'}</div>${formActions('保存关联')}</form>`);
  }
  if (modal.type === 'settings') return modalShell('数据与备份', `<p class="modal-subtitle">记录自动保存在本机。登录账号可启用多端同步，也可以随时导出备份。</p>${storageError ? `<div class="notice" role="alert">${esc(storageError)}。请先导出当前内容再重新加载，以免丢失尚未保存的编辑。</div>` : ''}<div class="data-actions"><button class="data-action" data-action="export">${icon('download')}<span><strong>导出完整数据</strong><small>JSON 格式 · 包含项目、任务、笔记和关联</small></span>${icon('chevron')}</button><button class="data-action" data-action="import">${icon('upload')}<span><strong>导入为独立副本</strong><small>保留现有内容，使用新的记录 ID 导入</small></span>${icon('chevron')}</button><button class="data-action" data-action="help">${icon('help')}<span><strong>使用与快捷键</strong><small>了解当前原型可以体验的功能</small></span>${icon('chevron')}</button></div><p class="modal-subtitle" style="margin:20px 0 0">当前有 ${data.projects.length} 个项目、${data.notes.length} 篇笔记。<br>清理浏览器数据可能移除本地内容，请定期导出。</p><input type="file" id="import-file" accept=".json,application/json" hidden>`);
  if (modal.type === 'help') return modalShell('从一个小进展开始', `<p class="body-copy">项目卡片可以拖动。打开项目后，可以更新状态、完成任务，并把已有笔记关联进来。知识库中的同一篇笔记可以关联多个项目。</p><div class="notice">当前可以体验本机保存、项目管理、笔记编辑与关联。自定义属性在表格视图添加。账号登录、真正的多端同步、附件与安装包尚未实现。</div><div class="help-shortcuts"><span>搜索全部内容</span><kbd>Ctrl / ⌘ K</kbd><span>快速记下想法</span><kbd>N</kbd><span>关闭当前弹窗或详情</span><kbd>Esc</kbd></div>`);
  if (modal.type === 'confirm-delete') return modalShell(`删除${modal.kind === 'project' ? '项目' : '笔记'}`, `<p class="body-copy">确定删除「${esc(modal.title)}」吗？${modal.kind === 'project' ? '项目内的任务会一起删除，关联笔记仍保留在知识库或收集箱中。' : '笔记将从所有关联项目中移除。'}此操作无法直接撤销。</p><div class="form-actions"><button class="button" data-action="close-modal">取消</button><button class="button danger" data-action="confirm-delete">确认删除</button></div>`);
  if (modal.type === 'confirm-import') return modalShell('导入为独立副本', `<p class="body-copy">将导入 ${importCandidate.projects.length} 个项目和 ${importCandidate.notes.length} 篇笔记。现有内容会保留；导入的项目和笔记会标记“（导入）”，并使用新的 ID 保持副本间的关联。</p><div class="notice">本次导入仅包含项目、任务、笔记及自定义属性；当前视图设置保持不变。原型暂不支持附件。</div><div class="form-actions"><button class="button" data-action="close-modal">取消</button><button class="button primary" data-action="confirm-import">导入副本</button></div>`);
  return '';
}
function searchResults(query) {
  const q = query.trim().toLocaleLowerCase(), results = [];
  if (!q) return `<div class="recent-heading">继续最近的项目</div>${data.projects.slice(0, 5).map(p => `<button class="search-result" data-project="${esc(p.id)}">${icon(p.icon)}<span><strong>${esc(p.title)}</strong><small>项目 · ${statusBy(p.status).label}</small></span></button>`).join('') || '<div class="search-empty">输入关键词，查找项目、任务和笔记。</div>'}`;
  for (const p of data.projects) {
    if (`${p.title} ${p.description}`.toLocaleLowerCase().includes(q)) results.push(`<button class="search-result" data-project="${esc(p.id)}">${icon(p.icon)}<span><strong>${esc(p.title)}</strong><small>项目 · ${statusBy(p.status).label}</small></span></button>`);
    for (const t of p.tasks) if (t.title.toLocaleLowerCase().includes(q)) results.push(`<button class="search-result" data-project="${esc(p.id)}">${icon('checkCircle')}<span><strong>${esc(t.title)}</strong><small>任务 · ${esc(p.title)}</small></span></button>`);
  }
  for (const n of data.notes) if (`${n.title} ${n.body} ${n.tags.join(' ')}`.toLocaleLowerCase().includes(q)) results.push(`<button class="search-result" data-note="${esc(n.id)}">${icon('note')}<span><strong>${esc(n.title)}</strong><small>${n.inbox ? '收集箱' : '知识库'} · ${esc(n.category)}</small></span></button>`);
  return results.slice(0, 40).join('') || '<div class="search-empty">没有找到相关内容，换个关键词试试。</div>';
}

let pretextObserver;
const measured = new WeakMap();
function measureText(el) {
  if (!el.isConnected || !el.clientWidth) return;
  try {
    const style = getComputedStyle(el), text = el.textContent;
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    let cached = measured.get(el);
    if (!cached || cached.text !== text || cached.font !== font) { cached = { text, font, prepared: prepare(text, font) }; measured.set(el, cached); }
    const result = layout(cached.prepared, el.clientWidth, parseFloat(style.lineHeight));
    el.style.minHeight = `${Math.max(result.height, parseFloat(style.lineHeight) * (el.classList.contains('card-description') ? 2 : 1))}px`;
  } catch { /* Native text flow remains available if measurement cannot run. */ }
}
function wirePretext() {
  pretextObserver?.disconnect();
  pretextObserver = new ResizeObserver(entries => entries.forEach(({ target }) => measureText(target)));
  $$('[data-pretext]').forEach(el => { measureText(el); pretextObserver.observe(el); });
}
function render() {
  const activeId = document.activeElement?.id;
  const activeTask = document.activeElement?.dataset.task;
  const activeTaskProject = document.activeElement?.dataset.projectId;
  const captureSelection = activeId === 'route-capture-body' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const stationScroll = new Map($$('.mr-route-line').map(line => [line.querySelector('[data-select-project]')?.dataset.selectProject, line.querySelector('.mr-stations-scroll')?.scrollLeft || 0]));
  const scrollTop = $('.drawer-scroll')?.scrollTop || 0;
  const current = route(), project = current.kind === 'project' && getProject(current.id), note = current.kind === 'note' && getNote(current.id);
  document.title = `拾序 · ${project?.title || note?.title || { projects: '我的项目', knowledge: '知识库', inbox: '收集箱' }[current.section]}`;
  $('#app').innerHTML = `<div class="app-shell">${sidebar()}<div class="main-wrap">${topbar()}${storageError ? `<div class="storage-warning" role="alert">${esc(storageError)} · <button data-action="settings">导出当前内容</button></div>` : ''}<main id="main">${current.section === 'projects' ? projectsPage() : notesPage(current.section === 'inbox')}</main>${mobileNav()}</div></div>`;
  $('#overlay-root').innerHTML = `${project || note || modal ? '<div class="overlay" data-action="dismiss"></div>' : ''}${project ? projectDrawer(project) : note ? noteDrawer(note) : ''}${modalMarkup()}`;
  $('#app').inert = Boolean(project || note || modal);
  document.body.style.overflow = project || note || modal ? 'hidden' : '';
  if ($('.drawer-scroll')) $('.drawer-scroll').scrollTop = scrollTop;
  if (activeId && document.getElementById(activeId) && !document.getElementById(activeId).closest('[inert]')) document.getElementById(activeId).focus({ preventScroll: true });
  if (captureSelection) $('#route-capture-body')?.setSelectionRange(...captureSelection);
  for (const line of $$('.mr-route-line')) line.querySelector('.mr-stations-scroll').scrollLeft = stationScroll.get(line.querySelector('[data-select-project]')?.dataset.selectProject) || 0;
  if (activeTask && activeTaskProject && !$('#app').inert) $$('[data-task][data-project-id]').find(el => el.dataset.task === activeTask && el.dataset.projectId === activeTaskProject)?.focus({ preventScroll: true });
  requestAnimationFrame(wirePretext);
  syncUI?.refresh();
}
function showModal(type, options = {}) {
  modal = { type, ...options }; render();
  requestAnimationFrame(() => { const target = $('.modal input:not([type=checkbox]):not([hidden])') || $('#modal-title') || $('.modal button'); target?.focus(); });
}
function dismissModal() {
  const hadSearch = modal?.type === 'search'; modal = null; importCandidate = null; render();
  ($('.drawer .icon-button') || (hadSearch ? $('.top-actions [data-action=search]') : $('[data-action=new-project]')) || $('.mobile-nav .mobile-create'))?.focus({ preventScroll: true });
}

document.addEventListener('click', event => {
  const target = event.target.closest('button,a,[data-action],[data-project],[data-note],[data-category],[data-view],[data-editor-mode]');
  if (!target) return;
  if (target.getAttribute('href') === '#main') { event.preventDefault(); $('#main').setAttribute('tabindex', '-1'); $('#main').focus(); return; }
  if (target.dataset.project) { openProject(target.dataset.project); return; }
  if (target.dataset.note) { openNote(target.dataset.note); return; }
  if (target.dataset.category) { selectedCategory = target.dataset.category; render(); return; }
  if (workspaceViews.includes(target.dataset.view)) {
    workspaceView = target.dataset.view;
    try { localStorage.setItem(LAYOUT_KEY, workspaceView); } catch { toast('已切换布局，但无法记住选择，请检查浏览器存储空间。'); }
    render(); $$('.view-tab').find(el => el.dataset.view === workspaceView)?.focus({ preventScroll: true }); return;
  }
  if (target.dataset.selectProject) { routeState.selectedProject = target.dataset.selectProject; render(); $$('.mr-line-select').find(el => el.dataset.selectProject === routeState.selectedProject)?.focus({ preventScroll: true }); return; }
  if (['all', 'active', 'done'].includes(target.dataset.filter)) { routeState.filter = target.dataset.filter; render(); $$('.mr-filters button').find(el => el.dataset.filter === routeState.filter)?.focus({ preventScroll: true }); return; }
  if (['note', 'task'].includes(target.dataset.routeKind)) { routeState.kind = target.dataset.routeKind; render(); $('#route-capture-body')?.focus({ preventScroll: true }); return; }
  if (target.dataset.editorMode) { editorMode = target.dataset.editorMode; render(); if (editorMode === 'edit') $('#note-body')?.focus(); return; }
  const action = target.dataset.action;
  switch (action) {
    case 'search': showModal('search'); break;
    case 'account': syncUI?.open(); break;
    case 'settings': showModal('settings'); break;
    case 'help': showModal('help'); break;
    case 'new-project': {
      const group = target.dataset.defaultGroup;
      showModal('new-project', data.preferences.group === 'priority' ? { priority: group } : { status: group }); break;
    }
    case 'new-note': showModal('new-note'); break;
    case 'quick-note': showModal('new-note', { inbox: true }); break;
    case 'project-new-note': showModal('new-note', { projectId: target.dataset.id }); break;
    case 'close-modal': dismissModal(); break;
    case 'dismiss': if (modal) dismissModal(); else closeDrawer(); break;
    case 'close-drawer': closeDrawer(); break;
    case 'filter': showModal('filter'); break;
    case 'clear-filter': filters = { status: '', priority: '', tag: '' }; render(); break;
    case 'view-options': showModal('view-options'); break;
    case 'new-field': if (data.fields.length >= 30) toast('原型最多支持 30 个自定义属性。'); else showModal('new-field'); break;
    case 'link-notes': showModal('link-notes', { id: target.dataset.id }); break;
    case 'link-projects': showModal('link-projects', { id: target.dataset.id }); break;
    case 'toggle-pin': { const p = getProject(target.dataset.id); if (p) { p.pinned = !p.pinned; save(p); render(); } break; }
    case 'delete-task': { const p = getProject(route().id); if (p) { p.tasks = p.tasks.filter(t => t.id !== target.dataset.id); save(p); render(); } break; }
    case 'organize-note': { const n = getNote(target.dataset.id); if (n) { n.inbox = false; save(n); render(); toast('已移入知识库，原有关联保持不变。'); } break; }
    case 'delete-project': { const p = getProject(target.dataset.id); if (p) showModal('confirm-delete', { kind: 'project', id: p.id, title: p.title }); break; }
    case 'delete-note': { const n = getNote(target.dataset.id); if (n) showModal('confirm-delete', { kind: 'note', id: n.id, title: n.title }); break; }
    case 'confirm-delete': {
      if (modal.kind === 'project') { data.projects = data.projects.filter(p => p.id !== modal.id); for (const n of data.notes) if (n.projectIds.includes(modal.id)) { n.projectIds = n.projectIds.filter(id => id !== modal.id); n.updatedAt = new Date().toISOString(); } }
      else data.notes = data.notes.filter(n => n.id !== modal.id);
      modal = null; const saved = save(); closeDrawer(); render(); if (saved) toast('已删除。'); break;
    }
    case 'export': exportData(); break;
    case 'import': $('#import-file')?.click(); break;
    case 'confirm-import': importData(); break;
  }
});

document.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target, values = new FormData(form);
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const title = String(values.get('title') || '').trim();
  if (['project-form', 'note-form', 'task-form'].includes(form.id) && !title) { const input = form.querySelector('[name=title]'); input.setCustomValidity('请填写内容，不能只有空格。'); input.reportValidity(); return; }
  switch (form.id) {
    case 'route-capture-form': saveRouteCapture(form); break;
    case 'project-form': {
      const p = { id: uid(), title, description: String(values.get('description')).trim(), status: values.get('status'), priority: values.get('priority'), tag: String(values.get('tag') || '').trim(), due: values.get('due'), color: 'blue', icon: 'layers', tasks: [], pinned: false, custom: {}, updatedAt: new Date().toISOString() };
      data.projects.unshift(p); const saved = save(); modal = null; filters = { status: '', priority: '', tag: '' }; routeState.filter = 'all'; routeState.selectedProject = p.id; openProject(p.id); if (saved) toast('项目已创建，添加第一个任务吧。'); break;
    }
    case 'note-form': {
      const body = String(values.get('body') || '');
      const n = { id: uid(), title, body, summary: summarize(body), category: values.get('category') || '产品与设计', tags: [], inbox: Boolean(modal.inbox), projectIds: modal.projectId ? [modal.projectId] : [], updatedAt: new Date().toISOString() };
      data.notes.unshift(n); const saved = save(); modal = null; selectedCategory = '全部笔记'; openNote(n.id); if (saved) toast(n.inbox ? '想法已保存到收集箱。' : '笔记已创建。'); break;
    }
    case 'task-form': { const p = getProject(route().id); if (p) { p.tasks.push({ id: uid(), title, done: false }); save(p); render(); $('#task-title')?.focus(); } break; }
    case 'filter-form': filters = { status: values.get('status'), priority: values.get('priority'), tag: values.get('tag') }; dismissModal(); break;
    case 'view-form': data.preferences.group = values.get('group'); save(); dismissModal(); break;
    case 'field-form': {
      const name = String(values.get('name')).trim();
      if (!name || data.fields.some(f => f.name === name)) { $('#form-error').textContent = '请填写不重复的属性名称。'; return; }
      data.fields.push({ id: uid(), name, type: values.get('type') }); save(); dismissModal(); toast('属性已添加，打开项目详情即可填写。'); break;
    }
    case 'link-notes-form': {
      const chosen = new Set(values.getAll('notes'));
      for (const n of data.notes) { const has = n.projectIds.includes(modal.id); if (chosen.has(n.id) !== has) { n.projectIds = chosen.has(n.id) ? [...n.projectIds, modal.id] : n.projectIds.filter(id => id !== modal.id); n.updatedAt = new Date().toISOString(); } }
      save(); dismissModal(); toast('笔记关联已更新。'); break;
    }
    case 'link-projects-form': { const n = getNote(modal.id); if (n) { n.projectIds = values.getAll('projects'); save(n); } dismissModal(); toast('项目关联已更新。'); break; }
  }
});
function summarize(body) { return body.split('\n').filter(line => line.trim() && !line.startsWith('#')).join(' ').replace(/[*`>]/g, '').slice(0, 90); }
document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'route-capture-body') { el.setCustomValidity(''); routeState.drafts.set(el.form.dataset.projectId || '', el.value); return; }
  if (el.name === 'title') el.setCustomValidity('');
  if (el.id === 'global-search') { $('#search-results').innerHTML = searchResults(el.value); return; }
  if (['title', 'description'].includes(el.dataset.editProject)) { const p = getProject(route().id); if (p && (el.dataset.editProject !== 'title' || el.value.trim())) { p[el.dataset.editProject] = el.value; save(p); document.title = `拾序 · ${p.title}`; } }
  if (el.dataset.editNote === 'title' && el.value.trim()) { const n = getNote(route().id); if (n) { n.title = el.value; save(n); document.title = `拾序 · ${n.title}`; } }
  if (el.dataset.editNote === 'body') { const n = getNote(route().id); if (n) { n.body = el.value; n.summary = summarize(n.body); save(n); } }
});
document.addEventListener('change', async event => {
  const el = event.target;
  if (el.id === 'sort-select') { data.preferences.sort = el.value; save(); render(); }
  if (el.dataset.task) { const p = getProject(el.dataset.projectId || route().id), t = p?.tasks.find(t => t.id === el.dataset.task); if (t) { t.done = el.checked; save(p); render(); } }
  if (el.dataset.editProject) {
    const p = getProject(route().id), key = el.dataset.editProject;
    if (p) { if (key === 'title' && !el.value.trim()) { el.value = p.title; toast('项目标题不能为空。'); return; } p[key] = el.value.trim(); save(p); document.title = `拾序 · ${p.title}`; }
  }
  if (el.dataset.customField) { const p = getProject(route().id), f = data.fields.find(f => f.id === el.dataset.customField); if (p && f) { p.custom[f.id] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value; save(p); } }
  if (el.dataset.editNote && el.dataset.editNote !== 'body') {
    const n = getNote(route().id), key = el.dataset.editNote;
    if (n) { if (key === 'title' && !el.value.trim()) { el.value = n.title; toast('笔记标题不能为空。'); return; } n[key] = key === 'tags' ? [...new Set(el.value.split(/[,，]/).map(s => s.trim()).filter(Boolean))].slice(0, 20).map(t => t.slice(0, 60)) : el.value.trim(); save(n); document.title = `拾序 · ${n.title}`; }
  }
  if (el.id === 'import-file' && el.files[0]) {
    try {
      const file = el.files[0]; if (file.size > 5 * 1024 * 1024) throw new Error('原型支持导入 5 MB 以内的备份。');
      importCandidate = validateData(JSON.parse(await file.text()));
      showModal('confirm-import');
    } catch (error) { toast(error instanceof SyntaxError ? '文件不是有效的 JSON 备份。' : error.message); el.value = ''; }
  }
});
function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `拾序备份-${new Date().toLocaleDateString('sv-SE')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('备份已生成，请在浏览器下载列表中查看。');
}
function importData() {
  if (!importCandidate) return;
  const incoming = structuredClone(importCandidate), projectIds = new Map(), fieldIds = new Map();
  for (const f of incoming.fields) { const old = f.id; f.id = uid(); fieldIds.set(old, f.id); }
  for (const p of incoming.projects) {
    const old = p.id; p.id = uid(); projectIds.set(old, p.id); p.title = `${p.title.slice(0, 194)}（导入）`;
    p.pinned = false; p.tasks.forEach(t => t.id = uid()); p.custom = Object.fromEntries(Object.entries(p.custom).filter(([key]) => fieldIds.has(key)).map(([key, value]) => [fieldIds.get(key), value]));
  }
  for (const n of incoming.notes) { n.id = uid(); n.title = `${n.title.slice(0, 194)}（导入）`; n.projectIds = n.projectIds.map(id => projectIds.get(id)); }
  const combined = { ...data, projects: [...data.projects, ...incoming.projects], notes: [...data.notes, ...incoming.notes], fields: [...data.fields, ...incoming.fields] };
  try { validateData(combined); } catch { toast('导入后会超出原型容量，请减少备份中的记录或属性数量。'); return; }
  data = combined; const saved = save(); importCandidate = null; dismissModal(); if (saved) toast('副本已导入，现有内容已保留。');
}
document.addEventListener('keydown', event => {
  if (event.target.closest('#sync-dialog')) return;
  if (event.isComposing || event.keyCode === 229) return;
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && event.target.closest('#route-capture-form')) { event.preventDefault(); event.target.closest('form').requestSubmit(); return; }
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); showModal('search'); return; }
  if (event.key === 'Escape') { if (modal) dismissModal(); else if (route().kind) closeDrawer(); return; }
  if (!typing && event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !modal && !route().kind) { event.preventDefault(); showModal('new-note', { inbox: true }); return; }
  const card = event.target.closest('[role=button][data-project],[role=button][data-note],tr[data-project]');
  if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); card.dataset.project ? openProject(card.dataset.project) : openNote(card.dataset.note); }
  const dialog = $('.modal') || $('.drawer');
  if (event.key === 'Tab' && dialog) {
    const controls = $$('button:not(:disabled),a[href],input:not([hidden]),select,textarea,[tabindex="0"]', dialog).filter(e => !e.closest('[inert]') && e.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) { event.preventDefault(); first?.focus(); }
  }
});
document.addEventListener('dragstart', event => { const card = event.target.closest('.project-card'); if (!card) return; dragId = card.dataset.project; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragId); card.classList.add('dragging'); });
document.addEventListener('dragover', event => { const column = event.target.closest('[data-drop]'); if (column && dragId) { event.preventDefault(); $$('.drag-over').forEach(c => c.classList.remove('drag-over')); column.classList.add('drag-over'); event.dataTransfer.dropEffect = 'move'; } });
document.addEventListener('drop', event => {
  const column = event.target.closest('[data-drop]'); if (!column || !dragId) return; event.preventDefault();
  const p = getProject(dragId), key = data.preferences.group === 'priority' ? 'priority' : 'status';
  if (p && p[key] !== column.dataset.drop) { p[key] = column.dataset.drop; const saved = save(p); if (saved) toast('项目分组已更新。'); }
  dragId = null; render();
});
document.addEventListener('dragend', () => { dragId = null; $$('.drag-over,.dragging').forEach(c => c.classList.remove('drag-over', 'dragging')); });
window.addEventListener('hashchange', () => { modal = null; render(); const drawer = $('.drawer'); if (drawer) { $('.drawer-scroll').scrollTop = 0; $('.drawer .icon-button')?.focus(); } else { $('#main h1')?.setAttribute('tabindex', '-1'); $('#main h1')?.focus({ preventScroll: true }); } });
window.addEventListener('storage', event => {
  if (event.key === LAYOUT_KEY) { workspaceView = workspaceViews.includes(event.newValue) ? event.newValue : 'route'; render(); return; }
  if (event.key === KEY && event.newValue !== lastDisk) { storageError = '另一个窗口已更新数据，请先导出当前编辑，再重新加载'; render(); toast(storageError); }
});
setLocale('zh-CN');
if (!lastDisk && !storageError) save();
if (!location.hash) history.replaceState(null, '', '#projects');
render();
function canSyncWorkspace() {
  if (storageError || modal || $('#task-title')?.value.trim() || [...routeState.drafts.values()].some(body => body.trim())) return false;
  const active = document.activeElement;
  if (active?.matches('input,textarea,select,[contenteditable=true]') && !active.closest('#sync-dialog')) return false;
  try { return localStorage.getItem(KEY) === lastDisk; } catch { return false; }
}
syncClient = createSyncClient({
  space: 'main', storageKey: KEY, freshLocal,
  getData: () => data,
  canSync: canSyncWorkspace,
  applyData(next) {
    if (!canSyncWorkspace()) return false;
    try {
      const incoming = validateData(next), serialized = JSON.stringify(incoming);
      localStorage.setItem(KEY, serialized); lastDisk = serialized; data = incoming;
      render(); return true;
    } catch { return false; }
  },
  onStatus: status => syncUI?.refresh(status),
});
syncUI = createSyncUI(syncClient, { space: 'main' });
void syncClient.start();
document.addEventListener('focusout', event => {
  if (event.target.matches('input,textarea,select') && !event.target.closest('#sync-dialog')) setTimeout(() => { if (canSyncWorkspace()) void syncClient.syncNow(); }, 0);
});
document.fonts.ready.then(wirePretext);

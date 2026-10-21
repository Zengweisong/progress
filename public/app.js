import { orderedRecords, moveRecord, moveCategory, installRecordDrag } from './record-order.js';
import { installSidebarControls } from './sidebar.js';
import { installSidebarCreateMenu } from './sidebar-create.js';
import { installRouteTaskDrag } from './route-task-drag.js';
import { renderDateInput, installDatePicker } from './date-picker.js';
import { renderSelect } from './select-control.js';
import { renderProjectTasks, moduleOptions, taskStates, taskStatus, setTaskStatus, ungroupedName, removeModule } from './project-tasks.js';
import { seedData, validateData, statuses, priorities } from './data.js';
import { sectionNames, categoryField, categoryRecords, categoryNames, writeCategory, removeCategory, navigationCategories, uncategorizedHidden, isNoteFavorite } from './categories.js';
import { prepare, layout, setLocale } from './vendor/pretext/layout.js';
import { createSyncClient } from './sync-client.js';
import { createSyncUI, syncButton } from './sync-ui.js';
import { renderRoute } from './layouts-matrix-route.js';
import { renderNotePage } from './note-editor.js';
import { createLiveNoteEditor } from './live-note-editor.js';
import { portableMarkdown } from './note-images.js';
import { hydrateWorkspace, persistAttachments, serializeWorkspace, WORKSPACE_BYTES } from './workspace-storage.js';
import { archiveWorkspace, getTrashEntries, getRecoveryEntry, deleteRecovery, getSyncMeta } from './sync-db.js';
import { deletedRecord, removeRecord, restoreRecord } from './recycle-bin.js';
import { searchWorkspace, highlightText } from './workspace-search.js';

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
  star: '<path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z"/>',
  width: '<path d="M8 4H3v16h5M16 4h5v16h-5M8 12h8m-6-3-3 3 3 3m4-6 3 3-3 3"/>',
  moon: '<path d="M20.5 13.2A8.5 8.5 0 0 1 10.8 3.5a8.5 8.5 0 1 0 9.7 9.7Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M5.5 7h.01M5.5 11h.01"/>',
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
const NOTE_LAYOUT_KEY = 'shixu.note.layout.v1';
let noteFullWidth = false, noteCreation = null;
try { noteFullWidth = localStorage.getItem(NOTE_LAYOUT_KEY) === 'full'; } catch { /* Use the standard document width. */ }
try { const savedView = localStorage.getItem(LAYOUT_KEY); if (workspaceViews.includes(savedView)) workspaceView = savedView; } catch { /* The current view still works without browser storage. */ }
const entryURL = new URL(location.href), requestedView = entryURL.searchParams.get('layout');
if (workspaceViews.includes(requestedView)) {
  workspaceView = requestedView;
  try { localStorage.setItem(LAYOUT_KEY, workspaceView); } catch { /* Render the requested layout even when its preference cannot be saved. */ }
  entryURL.searchParams.delete('layout'); history.replaceState(null, '', entryURL);
}
const moduleTaskDrafts = new Map();
const routeModuleTargets = new Map();
const routeState = { selectedProject: null, filter: 'all', kind: 'note', drafts: new Map(), projectOrder: null };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let data, lastDisk = null, storageError = '', toastTimer, modal = null, syncClient, syncUI;
let saveGeneration = 0, trashBusy = false, undoTrashId = null, searchType = 'all', searchTarget = null;
let trashRecords = [];
const recentKey = 'shixu.recent-records.v1';
let recentRecords = [];
try { const recent = JSON.parse(localStorage.getItem(recentKey) || '[]'); if (Array.isArray(recent)) recentRecords = recent.slice(0, 20); } catch { /* Recents are optional device preferences. */ }
const expandedSections = new Set([route().section]);
const collapsedNoteCategories = new Set();
const collapsedProjectCategories = new Set();
try {
  const names = JSON.parse(localStorage.getItem('shixu.sidebar.collapsed-categories.v1') || '[]');
  if (Array.isArray(names)) names.filter(name => typeof name === 'string').forEach(name => collapsedProjectCategories.add(name));
} catch { /* Navigation remains available without saved preferences. */ }
let filters = { status: '', priority: '', tag: '' }, dragId = null, importCandidate = null;
try {
  lastDisk = localStorage.getItem(KEY);
  data = lastDisk ? validateData(await hydrateWorkspace(JSON.parse(lastDisk))) : seedData();
  if (lastDisk) {
    await persistAttachments(data);
    const compact = serializeWorkspace(data);
    if (localStorage.getItem(KEY) !== lastDisk) throw new Error('另一个窗口已更新数据，请重新加载');
    if (compact !== lastDisk) localStorage.setItem(KEY, compact);
    lastDisk = compact;
  }
} catch (error) {
  if (error.workspace) { try { data = validateData(error.workspace); } catch { /* Never render unvalidated records. */ } }
  data ||= seedData(); storageError = `本机数据读取或迁移失败：${error.message}`;
}
const freshLocal = lastDisk === null && !storageError;

function save(entity) {
  if (entity) entity.updatedAt = new Date().toISOString();
  if (storageError) { toast('保存受阻，请先导出内容，再重新加载。'); return false; }
  try {
    if (localStorage.getItem(KEY) !== lastDisk) throw new Error('另一个窗口已更新数据，请先导出当前编辑，再重新加载');
    const next = serializeWorkspace(data);
    localStorage.setItem(KEY, next);
    lastDisk = next;
    saveGeneration++;
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
function toast(message, undoId = null) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  undoTrashId = undoId;
  if (undoId) { const button = document.createElement('button'); button.type = 'button'; button.dataset.action = 'undo-delete'; button.textContent = '撤销'; el.append(button); }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), undoId ? 10000 : 3200);
}
async function trashContext() {
  const context = { generation: saveGeneration, disk: lastDisk };
  const binding = await getSyncMeta('main');
  return { ...context, owner: binding?.ownerId ?? null, transition: Boolean(binding?.transition) };
}
async function assertTrashContext(context) {
  const binding = await getSyncMeta('main');
  if (storageError || context.generation !== saveGeneration || context.disk !== lastDisk || localStorage.getItem(KEY) !== lastDisk || context.owner !== (binding?.ownerId ?? null) || context.transition !== Boolean(binding?.transition)) throw new Error('工作区已发生变化，请重新打开后操作。');
}
function recordExists(item) {
  return item.kind === 'project' ? Boolean(getProject(item.record.id)) : item.kind === 'note' ? Boolean(getNote(item.record.id)) : Boolean(getProject(item.projectId)?.tasks.some(t => t.id === item.record.id));
}
async function deleteToTrash(kind, id, projectId) {
  if (trashBusy) return;
  trashBusy = true;
  try {
    const context = await trashContext();
    await assertTrashContext(context);
    const item = deletedRecord(data, kind, id, projectId);
    const archived = await archiveWorkspace('main', context.owner, item.record.title, item, 'trash');
    await assertTrashContext(context);
    const previous = data; data = structuredClone(data);
    removeRecord(data, item);
    if (!save()) { data = previous; return; }
    modal = null;
    if (kind !== 'task') closeDrawer();
    render(); toast('已移到本机回收站。', archived.id);
  } catch (error) { toast(error.message || '恢复副本保存失败，记录尚未删除。'); }
  finally { trashBusy = false; }
}
async function openTrash() {
  try {
    const context = await trashContext(), records = await getTrashEntries('main', context.owner);
    await assertTrashContext(context);
    trashRecords = records.filter(record => record.kind === 'trash' && record.userId === context.owner && !recordExists(record.data)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    showModal('trash');
  } catch (error) { toast(error.message || '回收站读取失败，请重试。'); }
}
async function restoreTrash(id) {
  if (trashBusy) return;
  trashBusy = true;
  try {
    const context = await trashContext(), archived = await getRecoveryEntry(id);
    if (!archived || archived.space !== 'main' || archived.kind !== 'trash' || archived.userId !== context.owner) throw new Error('当前工作区中找不到这条恢复记录。');
    await assertTrashContext(context);
    const next = restoreRecord(structuredClone(data), archived.data);
    await persistAttachments(next);
    await assertTrashContext(context);
    const previous = data; data = next;
    if (!save()) { data = previous; return; }
    // Keeping an already restored entry after an IndexedDB cleanup failure is
    // harmless; the list hides existing IDs and restoration never overwrites.
    try { await deleteRecovery(id); } catch { /* The restored record is durable. */ }
    undoTrashId = null;
    if (modal?.type === 'trash') { trashRecords = trashRecords.filter(item => item.id !== id); render(); }
    else render();
    toast('已恢复，内容与关联已保留。');
  } catch (error) { toast(error.message || '恢复失败，请重试。'); }
  finally { trashBusy = false; }
}
function saveTaskChange(project, change) {
  if (storageError) { toast('保存受阻，请先导出内容，再重新加载。'); return false; }
  const previous = structuredClone(project);
  change();
  if (save(project)) return true;
  for (const key of Object.keys(project)) delete project[key];
  Object.assign(project, previous);
  return false;
}
const getProject = id => data.projects.find(p => p.id === id);
const getNote = id => data.notes.find(n => n.id === id) || (noteCreation?.note.id === id ? noteCreation.note : undefined);
const currentNote = () => route().kind === 'new-note' ? noteCreation?.note : getNote(route().id);
const progress = p => p.tasks.length ? Math.round(p.tasks.filter(t => t.done).length / p.tasks.length * 100) : 0;
const noteCount = p => data.notes.filter(n => n.projectIds.includes(p.id)).length;
const fmtDate = value => value ? `${Number(value.slice(5, 7))} 月 ${Number(value.slice(8, 10))} 日` : '未设日期';
const statusBy = id => statuses.find(s => s.id === id) || statuses[0];
function route() {
  let parts; try { parts = location.hash.slice(1).split('/').map(decodeURIComponent); } catch { parts = []; }
  const section = ['projects', 'knowledge', 'inbox'].includes(parts[0]) ? parts[0] : 'projects';
  const grouped = parts[1] === 'category';
  return { section, category: grouped ? parts[2] || '' : null, kind: parts[grouped ? 3 : 1], id: parts[grouped ? 4 : 2] };
}
const categoryPath = (section, name) => `${section}/category/${encodeURIComponent(name)}`;
function sectionPath() { const current = route(); return current.category === null ? current.section : categoryPath(current.section, current.category); }
function navigate(section) { if (location.hash === `#${section}`) render(); else location.hash = section; }
function openProject(id, parent = sectionPath()) { modal = null; navigate(`${parent}/project/${encodeURIComponent(id)}`); }
function openNote(id, parent = sectionPath()) { modal = null; navigate(`${parent}/note/${encodeURIComponent(id)}`); }
function openNoteCreate({ section = 'knowledge', category, projectId } = {}) {
  if (projectId) section = route().section;
  const parent = category !== undefined ? categoryPath(section, category) : route().section === section ? sectionPath() : section;
  modal = null; navigate(`${parent}/new-note${projectId ? `/${encodeURIComponent(projectId)}` : ''}`);
}
function closeDrawer() { navigate(sectionPath()); }
function categoryMatches(record, section) { const current = route(); return current.section !== section || current.category === null || record[categoryField(section)] === current.category; }
function categoryOptions(section) { return [['', '未分类'], ...categoryNames(data, section).map(name => [name, name])]; }
function defaultNoteCategory(inbox) {
  const section = inbox ? 'inbox' : 'knowledge', current = route();
  return current.section === section && current.category !== null ? current.category : categoryNames(data, section).includes('产品与设计') ? '产品与设计' : '';
}
function filteredProjects() {
  const result = data.projects.filter(p => !p.archived && categoryMatches(p, 'projects') && (!filters.status || p.status === filters.status) && (!filters.priority || p.priority === filters.priority) && (!filters.tag || p.tag === filters.tag));
  if (data.preferences.sort === 'manual') return orderedRecords(result);
  return result.sort((a, b) => data.preferences.sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : data.preferences.sort === 'due' ? (a.due || '9999').localeCompare(b.due || '9999') : new Date(b.updatedAt) - new Date(a.updatedAt));
}
function navItem(section, name, label, count = '') {
  return `<a class="nav-item ${route().section === section ? 'active' : ''}" href="#${section}" ${route().section === section && route().category === null ? 'aria-current="page"' : ''}>${icon(name)}${label}${count !== '' ? `<span class="nav-count">${count}</span>` : ''}</a>`;
}
function sidebarCreateButton(section, category, className = category === undefined ? 'nav-section-create' : 'nav-category-create') {
  const label = category === undefined ? `在${sectionNames[section]}中新建` : `在${category || '未分类'}下新建`;
  return `<button type="button" class="${className}" data-create-menu="${section}" ${category === undefined ? '' : `data-create-category="${esc(category)}"`} aria-label="${esc(label)}" title="新建" aria-haspopup="menu" aria-expanded="false" aria-controls="sidebar-create-menu">${icon('plus')}</button>`;
}
function categoryNav(section, name) {
  const records = orderedRecords(categoryRecords(data, section).filter(record => section !== 'projects' || !record.archived)), field = categoryField(section), label = sectionNames[section];
  const counts = new Map();
  for (const record of records) counts.set(record[field], (counts.get(record[field]) || 0) + 1);
  const expanded = expandedSections.has(section), current = route();
  if (section === 'projects') return projectNav(name, records, expanded, current);
  const looseLinks = uncategorizedHidden(data, section) ? records.filter(note => !note[field]).map(note => `<a class="nav-note-item ${current.kind === 'note' && current.id === note.id ? 'active' : ''}" href="#${section}/note/${encodeURIComponent(note.id)}" data-sidebar-note="${esc(note.id)}" data-record-drag="record" data-order-id="${esc(note.id)}" data-order-section="${section}" aria-description="可拖动排序或移至其他分类；Alt 加上下排序，左右切换分类" title="${esc(note.title)}" ${current.kind === 'note' && current.id === note.id ? 'aria-current="page"' : ''}>${icon('note')}<span>${esc(note.title)}</span></a>`).join('') : '';
  return `<div class="nav-group ${current.section === section ? 'is-current' : ''}"><div class="nav-group-heading" data-record-zone data-order-section="${section}" data-order-category="">${navItem(section, name, label, records.length)}${sidebarCreateButton(section)}<button type="button" class="nav-expand" data-nav-expand="${section}" aria-label="${expanded ? '收起' : '展开'}${label}分类" aria-expanded="${expanded}" aria-controls="nav-children-${section}">${icon('down')}</button></div><div class="nav-children" id="nav-children-${section}" data-record-zone data-order-section="${section}" data-order-category="" ${expanded ? '' : 'hidden'}>${looseLinks}${navigationCategories(data, section).map(category => {
    const selected = current.section === section && current.category === category;
    const notes = records.filter(note => note[field] === category), open = !collapsedNoteCategories.has(JSON.stringify([section, category]));
    const listId = `nav-note-list-${section}-${navigationCategories(data, section).indexOf(category)}`;
    return `<div class="nav-note-category" data-order-category="${esc(category)}" data-order-section="${section}" data-record-zone><div class="nav-category-row"><button type="button" class="nav-note-fold" data-note-fold="${esc(category)}" data-section="${section}" aria-label="${open ? '收起' : '展开'}${esc(category || '未分类')}文章" aria-expanded="${open}" aria-controls="${listId}">${icon('down')}</button><a class="nav-subitem ${selected ? 'active' : ''}" href="#${esc(categoryPath(section, category))}" ${category ? `data-record-drag="category" data-order-section="${section}" data-order-id="${esc(category)}" title="拖动分类排序；Alt + 上下方向键排序"` : ''} ${selected && !current.kind ? 'aria-current="page"' : ''}><span class="nav-category-name" title="${esc(category || '未分类')}">${esc(category || '未分类')}</span><span class="nav-category-count">${counts.get(category) || 0}</span></a>${sidebarCreateButton(section, category)}${category !== null ? `<button type="button" class="nav-category-edit" data-action="edit-category" data-section="${section}" data-name="${esc(category)}" aria-label="编辑${esc(category || '未分类')}分类">${icon('more')}</button>` : ''}</div><div id="${listId}" class="nav-note-list" ${open ? '' : 'hidden'}>${notes.map(note => `<a class="nav-note-item ${current.kind === 'note' && current.id === note.id ? 'active' : ''}" href="#${esc(categoryPath(section, category))}/note/${encodeURIComponent(note.id)}" data-sidebar-note="${esc(note.id)}" data-record-drag="record" data-order-id="${esc(note.id)}" data-order-section="${section}" aria-description="可拖动排序或移至其他分类；Alt 加上下排序，左右切换分类" title="${esc(note.title)}" ${current.kind === 'note' && current.id === note.id ? 'aria-current="page"' : ''}>${icon('note')}<span>${esc(note.title)}</span></a>`).join('')}</div></div>`;
  }).join('')}</div></div>`;
}
function projectNav(name, projects, expanded, current) {
  const projectLinks = (items, category = null) => items.map(project => {
    const selected = current.section === 'projects' && current.kind === 'project' && current.id === project.id;
    const parent = category === null ? 'projects' : categoryPath('projects', category);
    return `<a class="nav-project ${category === null ? '' : 'is-nested'} ${selected ? 'active' : ''}" data-sidebar-project="${esc(project.id)}" data-record-drag="record" data-order-id="${esc(project.id)}" data-order-section="projects" aria-description="可拖动排序或移至其他分类；Alt 加上下排序，左右切换分类" href="#${esc(parent)}/project/${encodeURIComponent(project.id)}" ${selected ? 'aria-current="page"' : ''} title="${esc(project.title)}"><span class="nav-project-dot ${esc(project.status)}" aria-hidden="true"></span><span>${esc(project.title)}</span></a>`;
  }).join('');
  return `<div class="nav-group ${current.section === 'projects' ? 'is-current' : ''}"><div class="nav-group-heading" data-record-zone data-order-section="projects" data-order-category="">${navItem('projects', name, '我的项目', projects.length)}${sidebarCreateButton('projects')}<button type="button" class="nav-expand" data-nav-expand="projects" aria-label="${expanded ? '收起' : '展开'}我的项目分类" aria-expanded="${expanded}" aria-controls="nav-children-projects">${icon('down')}</button></div><div class="nav-children" id="nav-children-projects" data-record-zone data-order-section="projects" data-order-category="" ${expanded ? '' : 'hidden'}>
    ${projectLinks(projects.filter(project => !project.tag))}
    ${categoryNames(data, 'projects').map((category, index) => {
      const items = projects.filter(project => project.tag === category), selected = current.section === 'projects' && current.category === category;
      const open = !collapsedProjectCategories.has(category), listId = `nav-project-category-items-${index}`;
      return `<div class="nav-project-category" data-order-category="${esc(category)}" data-order-section="projects" data-record-zone><div class="nav-category-row"><a class="nav-subitem ${selected ? 'active' : ''}" href="#${esc(categoryPath('projects', category))}" data-category-fold="${esc(category)}" data-record-drag="category" data-order-section="projects" data-order-id="${esc(category)}" title="拖动分类排序；Alt + 上下方向键排序" aria-expanded="${open}" aria-controls="${listId}" ${selected && !current.kind ? 'aria-current="page"' : ''}>${icon('down')}<span class="nav-category-name" title="${esc(category)}">${esc(category)}</span><span class="nav-category-count">${items.length}</span></a>${sidebarCreateButton('projects', category)}<button type="button" class="nav-category-edit" data-action="edit-category" data-section="projects" data-name="${esc(category)}" aria-label="编辑${esc(category || '未分类')}分类">${icon('more')}</button></div><div id="${listId}" ${open ? '' : 'hidden'}>${projectLinks(items, category)}</div></div>`;
    }).join('')}
  </div></div>`;
}
function refreshProjectNavTitle(project) {
  for (const link of $$('[data-sidebar-project]')) {
    if (link.dataset.sidebarProject !== project.id) continue;
    link.title = project.title;
    link.lastElementChild.textContent = project.title;
  }
}
function refreshNoteNavTitle(note) {
  for (const link of $$('[data-sidebar-note]')) if (link.dataset.sidebarNote === note.id) { link.title = note.title; link.lastElementChild.textContent = note.title; }
}
function mobileCategories() {
  const { section, category } = route();
  return `<div class="mobile-categories"><label for="mobile-category">分类</label><select id="mobile-category" aria-label="二级分类"><option value="${section}" ${category === null ? 'selected' : ''}>全部${section === 'projects' ? '项目' : section === 'inbox' ? '收藏' : '笔记'}</option>${(section === 'projects' ? [...categoryNames(data, section), ''] : navigationCategories(data, section)).map(name => `<option value="${esc(categoryPath(section, name))}" ${category === name ? 'selected' : ''}>${esc(name || '未分类')}</option>`).join('')}</select>${category !== null ? `<button type="button" class="button subtle category-page-create" data-action="new-category-page" data-section="${section}" data-name="${esc(category)}" aria-label="在当前分类下新建页面">${icon('plus')}新建页面</button>` : ''}${sidebarCreateButton(section, category ?? undefined, 'icon-button')}${category !== null ? `<button type="button" class="icon-button" data-action="edit-category" data-section="${section}" data-name="${esc(category)}" aria-label="编辑当前分类">${icon('more')}</button>` : ''}</div>`;
}
function sidebar() {
  const pinned = data.projects.filter(project => project.pinned && !project.archived);
  return `<aside class="sidebar" id="workspace-sidebar" aria-label="主导航">
    <a class="brand" href="#projects"><span class="brand-mark">${icon('logo')}</span><div><div class="brand-name">拾序</div><div class="brand-en">SHIXU</div></div></a>
    <button class="workspace" data-action="account"><span class="workspace-avatar">我</span><span class="workspace-text"><strong>我的个人空间</strong></span>${icon('down')}</button>
    <div class="sidebar-shortcuts" role="group" aria-label="快捷操作"><button class="nav-item nav-search" data-action="search">${icon('search')}<span>搜索全部</span><kbd>Ctrl K</kbd></button><button class="nav-item" data-action="quick-note">${icon('plus')}<span>快速记录</span><kbd>N</kbd></button></div>
    <div class="nav-caption">工作空间</div>
    <nav>${categoryNav('projects', 'grid')}${categoryNav('knowledge', 'book')}${categoryNav('inbox', 'star')}</nav>
    ${pinned.length ? `<div class="side-divider"></div><div class="pinned-heading"><div class="nav-caption">已置顶</div>${icon('pin', 'style="width:12px;height:12px;color:#b6becd;margin-right:16px"')}</div>${pinned.map(p => `<a class="pinned-link" href="#projects/project/${esc(p.id)}"><span class="pin-dot ${esc(p.color)}"></span><span>${esc(p.title)}</span></a>`).join('')}` : ''}
    <div class="sidebar-bottom"><button class="profile" data-action="settings"><span class="avatar">我</span><span><strong>本地工作区</strong><small>数据与备份</small></span>${icon('settings')}</button></div>
  </aside><div class="sidebar-resizer" data-sidebar-resize role="separator" tabindex="0" aria-label="调整侧边栏宽度" aria-orientation="vertical" aria-controls="workspace-sidebar" aria-valuemin="200" aria-valuemax="400" aria-valuenow="234" title="拖动调整侧边栏宽度；左右方向键微调"></div>`;
}
function themeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const label = dark ? '切换到浅色模式' : '切换到深色模式';
  return `<button type="button" class="icon-button theme-toggle" data-theme-toggle aria-label="${label}" title="${label}" aria-pressed="${dark}"><span class="theme-moon">${icon('moon')}</span><span class="theme-sun">${icon('sun')}</span></button>`;
}
function topbar() {
  const sectionName = sectionNames[route().section];
  return `<header class="topbar"><button type="button" class="icon-button sidebar-toggle" data-sidebar-toggle aria-label="收起侧边栏" aria-controls="workspace-sidebar" aria-expanded="true" title="收起侧边栏">${icon('sidebar')}</button><div class="breadcrumb">${icon('layout')}<span class="workspace-crumb">个人空间</span><span class="slash">/</span><strong>${sectionName}${route().category !== null ? ` / ${esc(route().category || '未分类')}` : ''}</strong></div>
    <div class="top-actions"><button class="save-state ${storageError ? 'error' : ''}" data-action="settings" aria-label="查看本机保存与备份状态">${icon(storageError ? 'help' : 'checkCircle')}${storageError ? '尚未保存' : '本机已保存'}</button><a class="icon-button" href="/layouts.html" aria-label="四种布局探索" title="四种布局探索">${icon('grid')}</a><a class="icon-button" href="/designs.html" aria-label="Apple Design 版面探索" title="版面探索">${icon('layout')}</a>${themeButton()}${syncButton()}<button class="icon-button" data-action="search" aria-label="搜索">${icon('search')}</button><button class="avatar top-avatar" data-action="account" aria-label="个人账号">我</button></div></header>`;
}
function mobileNav() {
  return `<nav class="mobile-nav" aria-label="手机导航">${[['projects', 'grid', '项目'], ['knowledge', 'book', '知识'], ['inbox', 'star', '收藏夹']].map(([section, name, label]) => `<a href="#${section}" class="${route().section === section ? 'active' : ''}" ${route().section === section ? 'aria-current="page"' : ''}>${icon(name)}${label}</a>`).join('')}<button class="mobile-create" data-action="quick-note">${icon('plus')}记录</button><button data-action="settings">${icon('settings')}设置</button></nav>`;
}
function projectCard(p) {
  const count = p.tasks.filter(t => t.done).length;
  return `<article class="project-card ${p.status === 'done' ? 'done' : ''}" tabindex="0" role="button" draggable="true" data-project="${esc(p.id)}" aria-label="打开项目：${esc(p.title)}">
    <div class="card-top"><div class="project-icon ${esc(p.color)}">${icon(p.icon)}</div>${p.priority === 'high' ? `<span class="priority-flag">${icon('flag')}优先</span>` : ''}</div>
    <h3 class="card-title">${esc(p.title)}</h3><p class="card-description" data-pretext>${esc(p.description || '暂无说明')}</p>
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
    ${kind === 'task' && projectId ? `<label class="capture-module-label">模块<select name="moduleId" aria-label="记录到模块">${moduleOptions(getProject(projectId)).map(([id, name]) => `<option value="${esc(id)}" ${routeModuleTargets.get(projectId) === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>` : ''}
    <label class="sr-only" for="route-capture-body">项目记录</label><textarea id="route-capture-body" name="body" rows="4" maxlength="200000" required placeholder="${kind === 'task' ? '每行一项任务…' : '输入笔记…'}">${esc(routeDraft(projectId))}</textarea>
    <div class="route-capture-footer"><button class="button primary" type="submit">保存记录</button></div>
  </form>`;
}
function routeRecords(notes, limit) {
  return `<div class="route-records record-list">${[...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, limit).map(n => `<button type="button" data-note="${esc(n.id)}">${icon('note')}<span><strong>${esc(n.title)}</strong></span>${icon('arrow')}</button>`).join('') || '<p class="empty">暂无笔记</p>'}</div>`;
}
function routeMarkup(projects) {
  // Keep routes still during task edits; apply sorting when entering the view or choosing a sort.
  const known = new Set(routeState.projectOrder || []);
  routeState.projectOrder = [...projects.filter(p => !known.has(p.id)).map(p => p.id), ...(routeState.projectOrder || [])];
  const positions = new Map(routeState.projectOrder.map((id, index) => [id, index]));
  const visible = projects.filter(p => routeState.filter === 'all' || (routeState.filter === 'done' ? p.status === 'done' : p.status !== 'done'))
    .sort((a, b) => data.preferences.sort === 'manual' ? (a.order ?? 0) - (b.order ?? 0) : positions.get(a.id) - positions.get(b.id));
  if (!visible.some(p => p.id === routeState.selectedProject)) routeState.selectedProject = visible[0]?.id || null;
  return renderRoute({ data: { ...data, projects: visible }, state: routeState, compact: true, esc, icon: (name) => icon(name === 'route' ? 'compass' : name), pct: progress, date: fmtDate, captureForm: routeCapture, recordList: routeRecords });
}
function selectRouteProject(id) {
  if (routeState.selectedProject === id) return;
  routeState.selectedProject = id;
  // Update the selection and capture panel without rebuilding the project routes.
  const template = document.createElement('template');
  template.innerHTML = routeMarkup(filteredProjects());
  $('.workspace-route .mr-route-dock')?.replaceWith(template.content.querySelector('.mr-route-dock'));
  $$('.workspace-route .mr-route-line').forEach(line => {
    const button = $('[data-select-project]', line), selected = button.dataset.selectProject === id;
    line.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    if (selected) button.focus({ preventScroll: true });
  });
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
    const moduleId = String(new FormData(form).get('moduleId') || '');
    tasks = titles.map(title => ({ id: uid(), title, done: false, status: 'todo', moduleId }));
    project.tasks.push(...tasks);
  } else {
    if (data.notes.length >= 10000) { toast('笔记已达容量上限，请先整理现有记录。'); return; }
    note = { id: uid(), title: body.split(/\r?\n/)[0].slice(0, 200), body, summary: summarize(body), category: '产品与设计', tags: [], projectIds: project ? [project.id] : [], inbox: false, updatedAt: new Date().toISOString() };
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
  toast(tasks.length ? `已添加 ${tasks.length} 项任务。` : project ? '笔记已保存到当前项目。' : '笔记已保存到知识库。');
}
function projectsPage() {
  const projects = filteredProjects();
  const isRoute = workspaceView === 'route';
  const finished = data.projects.filter(p => !p.archived && p.status === 'done').length;
  const focus = projects.find(p => p.pinned && p.status === 'active');
  const hasFilters = Object.values(filters).some(Boolean);
  return `<section class="page workspace-projects ${isRoute ? 'workspace-route' : ''}">
    <div class="toolbar"><div class="archive-actions"><button type="button" class="button small subtle" data-action="archive-completed-projects" ${finished ? '' : 'disabled'}>归档已完成项目</button><button type="button" class="button small subtle" data-action="project-archives">已归档项目 ${data.projects.filter(p => p.archived).length}</button></div><div class="toolbar-actions"><button class="button subtle ${hasFilters ? 'selected' : ''}" data-action="filter" aria-label="筛选项目">${icon('filter')}<span class="label-desktop">筛选</span>${hasFilters ? '<span>·</span>' : ''}</button><span class="toolbar-rule"></span><select class="toolbar-select" id="sort-select" aria-label="项目排序"><option value="manual" ${data.preferences.sort === 'manual' ? 'selected' : ''}>手动排序</option><option value="updated" ${data.preferences.sort === 'updated' ? 'selected' : ''}>最近更新</option><option value="due" ${data.preferences.sort === 'due' ? 'selected' : ''}>截止日期</option><option value="title" ${data.preferences.sort === 'title' ? 'selected' : ''}>项目名称</option></select><button class="button primary" data-action="new-project">${icon('plus')}新建项目</button>${!isRoute ? `<button class="button subtle" data-action="view-options" aria-label="视图设置">${icon('more')}</button>` : ''}</div></div>
    <h1 class="sr-only">我的项目</h1>
    ${focus ? `<div class="focus-banner"><span class="focus-icon">${icon('compass')}</span><div class="focus-text"><strong>继续上次的进展</strong>${esc(focus.title)}<span> · 还有 ${focus.tasks.filter(t => !t.done).length} 项任务待完成</span></div><button class="button" data-project="${esc(focus.id)}">打开项目${icon('arrow')}</button></div>` : ''}
    ${hasFilters ? `<div class="filter-summary">已筛选 ${projects.length} 个项目<button data-action="clear-filter">清除筛选</button></div>` : ''}
    ${isRoute ? routeMarkup(projects) : !projects.length && hasFilters ? empty('没有符合条件的项目', '换一组筛选条件，或清除筛选查看全部。', 'clear-filter', '清除筛选') : workspaceView === 'board' ? boardMarkup(projects) : projects.length ? tableMarkup(projects) : empty('从第一个项目开始', '写下你正在做的事，进展从这里开始。', 'new-project', '新建项目')}
    </section>`;
}
function empty(title, text, action, label) {
  return `<div class="empty-state">${icon('layers')}<h3>${title}</h3><p>${text}</p><button class="button" data-action="${action}">${icon('plus')}${label}</button></div>`;
}
function newNotePage() {
  if (noteCreation?.path !== location.hash) {
    const current = route(), favorite = current.section === 'inbox';
    noteCreation = { path: location.hash, note: { id: uid(), title: '', body: '', summary: '', category: defaultNoteCategory(favorite), tags: [], inbox: false, favorite, projectIds: getProject(current.id) ? [current.id] : [], updatedAt: new Date().toISOString() } };
  }
  return renderNotePage({ note: noteCreation.note, esc, icon, fullWidth: noteFullWidth, creating: true });
}
function applyNoteWidth() {
  $('.note-workspace')?.classList.toggle('is-full-width', noteFullWidth);
  const button = $('[data-action="toggle-note-width"]');
  if (!button) return;
  const label = noteFullWidth ? '切换为标准宽度' : '切换为全宽';
  button.setAttribute('aria-label', label); button.title = label;
  button.setAttribute('aria-pressed', String(noteFullWidth));
}
function createNote() {
  const note = noteCreation?.note, input = $('#note-title');
  if (route().kind !== 'new-note' || !note || !input) return;
  if (!input.value.trim()) { input.setCustomValidity('请填写笔记标题。'); input.reportValidity(); input.focus(); return; }
  if (liveEditor.isBusy()) { toast('图片正在处理，请稍后创建。'); return; }
  note.title = input.value.trim(); note.updatedAt = new Date().toISOString();
  data.notes.unshift(note);
  if (!save()) { data.notes.shift(); $('#note-create-error').textContent = '笔记尚未保存，请保留当前内容或导出 Markdown。'; return; }
  noteCreation = null;
  history.replaceState(null, '', `#${sectionPath()}/note/${encodeURIComponent(note.id)}`);
  render(); $('#main h1')?.focus({ preventScroll: true });
  toast(isNoteFavorite(note) ? '笔记已创建，并加入收藏夹。' : '笔记已创建。');
}
function noteCard(n) {
  const section = route().section === 'inbox' ? 'inbox' : 'knowledge';
  return `<article data-order-note="${esc(n.id)}" data-order-section="${section}" class="note-card" tabindex="0" role="button" data-note="${esc(n.id)}" aria-label="打开笔记：${esc(n.title)}"><button type="button" class="record-drag-handle note-record-handle" data-record-drag="record" data-order-id="${esc(n.id)}" data-order-section="${section}" data-order-surface="notes" data-drag-label="${esc(n.title)}" aria-label="拖动笔记：${esc(n.title)}" title="拖动排序，或移至侧栏分类；Alt + 上下方向键排序">${icon('note')}</button><h3>${esc(n.title)}</h3><p data-pretext>${esc(n.summary || '暂无内容')}</p><div class="card-tags">${n.tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div><div class="card-footer"><span>${icon('link')}${n.projectIds.length ? `${n.projectIds.length} 个关联项目` : '尚未关联项目'}</span><span>${fmtDate(n.updatedAt.slice(0, 10))}</span></div></article>`;
}
function notesPage(favorites) {
  const section = favorites ? 'inbox' : 'knowledge';
  const notes = orderedRecords(categoryRecords(data, section).filter(note => categoryMatches(note, section)));
  const listed = notes.some(note => note.order !== undefined) ? notes : [...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return `<section class="page"><div class="page-heading"><div><h1>${sectionNames[section]}</h1></div><div class="heading-actions"><button class="button primary" data-action="new-note">${icon('plus')}新建笔记</button></div></div>
    <div class="toolbar"><div class="view-tabs"><span class="view-tab active">${icon(favorites ? 'star' : 'note')}${esc(route().category === null ? favorites ? '全部收藏' : '所有笔记' : route().category || '未分类')} <span style="font-size:10px;opacity:.6">${notes.length}</span></span></div><div class="toolbar-actions"><button class="button subtle" data-action="search">${icon('search')}搜索笔记</button></div></div>
    ${notes.length ? `<div class="note-grid">${listed.map(noteCard).join('')}</div>` : favorites ? '<div class="empty-state"><h3>还没有收藏的笔记</h3><p>在笔记页点亮星星，喜欢的内容就会出现在这里。</p><a class="button" href="#knowledge">浏览知识库</a></div>' : empty('这里还没有笔记', '记录一次思考，或者从项目中关联一篇笔记。', 'new-note', '新建笔记')}
    </section>`;
}
function projectDrawer(p) {
  const notes = data.notes.filter(n => n.projectIds.includes(p.id));
  return `<aside class="drawer project-detail" role="dialog" aria-modal="true" aria-label="项目详情：${esc(p.title)}" ${modal ? 'inert' : ''}>
    <div class="drawer-toolbar"><button class="icon-button" data-action="close-drawer" aria-label="关闭项目详情">${icon('back')}</button><span class="small-label">项目详情</span><button class="icon-button ${p.pinned ? 'pin-active' : ''}" data-action="toggle-pin" data-id="${esc(p.id)}" aria-label="${p.pinned ? '取消置顶' : '置顶项目'}" aria-pressed="${p.pinned}">${icon('pin')}</button><button class="icon-button" data-action="close-drawer" aria-label="关闭">${icon('close')}</button></div>
    <div class="drawer-scroll"><div class="drawer-header"><div class="project-icon ${esc(p.color)}">${icon(p.icon)}</div><input class="editable-title" id="project-title" data-edit-project="title" maxlength="200" value="${esc(p.title)}" aria-label="项目标题" required><textarea class="editable-description" id="project-description" data-edit-project="description" maxlength="20000" aria-label="项目说明">${esc(p.description)}</textarea></div>
    <div class="properties"><div class="property-row"><span class="property-label">${icon('progress')}项目状态</span>${renderSelect({ esc, options: statuses.map(s => [s.id, s.label]), value: p.status, kind: "status", attributes: 'id="project-status" data-edit-project="status" aria-label="项目状态"' })}</div>
    <div class="property-row"><span class="property-label">${icon('flag')}优先级</span>${renderSelect({ esc, options: Object.entries(priorities), value: p.priority, kind: "priority", attributes: 'id="project-priority" data-edit-project="priority" aria-label="优先级"' })}</div>
    <div class="property-row"><span class="property-label">${icon('calendar')}截止日期</span>${renderDateInput({ esc, icon, id: 'project-due', value: p.due, label: '截止日期', attributes: 'data-edit-project="due"' })}</div>
    <div class="property-row"><span class="property-label">${icon('tag')}项目分类</span>${renderSelect({ esc, options: categoryOptions('projects'), value: p.tag, kind: "", attributes: 'id="project-tag" data-edit-project="tag" aria-label="项目分类"' })}</div>
    ${data.fields.map(f => `<div class="property-row"><label class="property-label" for="field-${esc(f.id)}">${icon('tag')}${esc(f.name)}</label><input id="field-${esc(f.id)}" data-custom-field="${esc(f.id)}" type="${{ text: 'text', number: 'number', date: 'date', checkbox: 'checkbox' }[f.type]}" ${f.type === 'checkbox' ? (p.custom[f.id] ? 'checked' : '') : `value="${esc(p.custom[f.id] ?? '')}" maxlength="500"`} ${f.type === 'number' ? 'step="any"' : ''}></div>`).join('')}</div>
    <div class="section-heading">${icon('checkCircle')}项目任务<span>${p.tasks.filter(t => t.done).length}/${p.tasks.length}</span></div><div class="progress-meta"><span>任务完成进度</span><strong>${p.tasks.length ? `${progress(p)}%` : '暂无任务'}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${progress(p)}%"></div></div>
    ${renderProjectTasks(p, { esc, icon, scope: 'detail' })}
    <div class="section-heading">${icon('book')}关联知识<span>${notes.length} 篇</span><button class="button small subtle" data-action="link-notes" data-id="${esc(p.id)}">${icon('link')}关联笔记</button></div>
    ${notes.map(n => `<button class="linked-note" data-note="${esc(n.id)}">${icon('note')}<span class="linked-note-info"><strong>${esc(n.title)}</strong><small>${esc(n.category)}${isNoteFavorite(n) ? ' · 已收藏' : ''}</small></span>${icon('chevron')}</button>`).join('') || '<p class="drawer-muted">关联一篇笔记，让项目和知识连接起来。</p>'}<button class="button small subtle" data-action="project-new-note" data-id="${esc(p.id)}">${icon('plus')}为此项目新建笔记</button>
    </div><div class="drawer-footer">${icon('shield')}修改自动保存在此浏览器<button type="button" class="button small subtle" style="margin-left:auto" data-action="${p.archived ? 'restore-project' : 'archive-project'}" data-id="${esc(p.id)}">${p.archived ? '恢复项目' : '归档项目'}</button><button class="danger-link" data-action="delete-project" data-id="${esc(p.id)}">${icon('trash')}删除项目</button></div></aside>`;
}
function modalShell(title, body, className = '') {
  return `<section class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title" tabindex="-1">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon('close')}</button></div><div class="modal-body">${body}</div></section>`;
}
function formActions(label = '创建', cancelAction = 'close-modal') { return `<div class="form-error" id="form-error" role="alert"></div><div class="form-actions"><button class="button" type="button" data-action="${cancelAction}">取消</button><button class="button primary" type="submit">${label}</button></div>`; }
function selectField(label, name, options, value) {
  const kind = ['status', 'priority'].includes(name) ? name : name === 'taskStatus' ? 'task' : '';
  return `<label class="form-field"><span>${label}</span>${renderSelect({ esc, options, value, kind, attributes: `name="${name}"` })}</label>`;
}
function modalMarkup() {
  if (!modal) return '';
  if (modal.type === 'module') {
    const project = getProject(modal.projectId), module = project?.modules?.find(item => item.id === modal.id);
    if (!project) return '';
    return modalShell(modal.ungrouped ? '重命名模块' : module ? '编辑模块' : '新建模块', `<form id="module-form"><label class="form-field"><span>模块名称</span><input name="name" maxlength="60" value="${esc(modal.ungrouped ? ungroupedName(project) : module?.name || '')}" placeholder="例如：界面、服务端、测试" required autocomplete="off"></label>${module || modal.ungrouped ? `<button type="button" class="danger-link" data-action="delete-module" data-project-id="${esc(project.id)}" data-id="${esc(module?.id || '')}">删除模块，${modal.ungrouped ? (project.modules?.length ? '事项移至首个模块' : '保留事项并取消分组') : `任务移至${esc(ungroupedName(project))}`}</button>` : ''}${formActions(module || modal.ungrouped ? '保存修改' : '创建模块')}</form>`);
  }
  if (modal.type === 'project-archives') return modalShell('已归档项目', `<p class="body-copy">保留任务和关联笔记，可随时恢复到项目列表。</p><div class="archive-list">${data.projects.filter(p => p.archived).map(p => `<div class="archive-row"><button type="button" data-project="${esc(p.id)}">${esc(p.title)}</button><button type="button" class="button small" data-action="restore-project" data-id="${esc(p.id)}" aria-label="恢复项目：${esc(p.title)}">恢复</button></div>`).join('') || '<p class="body-copy">暂无归档项目。</p>'}</div>`);
  if (modal.type === 'task-archives') {
    const project = getProject(modal.projectId); if (!project) return '';
    return modalShell('已归档事项', `<p class="body-copy">${esc(project.title)} · 归档事项保留原有状态和模块，恢复后重新显示。</p><div class="archive-list">${project.tasks.filter(task => task.archived).map(task => `<div class="archive-row"><button type="button" data-action="edit-task" data-project-id="${esc(project.id)}" data-id="${esc(task.id)}">${esc(task.title)}<small>${taskStates[taskStatus(task)]}</small></button><button type="button" class="button small" data-action="restore-task" data-project-id="${esc(project.id)}" data-id="${esc(task.id)}" aria-label="恢复事项：${esc(task.title)}">恢复</button></div>`).join('') || '<p class="body-copy">暂无归档事项。</p>'}</div>`);
  }
  if (modal.type === 'task') {
    const project = getProject(modal.projectId), task = project?.tasks.find(item => item.id === modal.id);
    if (!task) return '';
    const siblings = project.tasks.filter(item => !item.archived && (item.moduleId || '') === (task.moduleId || ''));
    return modalShell('编辑任务', `<form id="task-edit-form"><label class="form-field"><span>任务名称</span><input name="title" maxlength="500" value="${esc(task.title)}" required autocomplete="off"></label>${selectField('所属模块', 'moduleId', moduleOptions(project), task.moduleId || '')}${selectField('任务状态', 'taskStatus', Object.entries(taskStates), taskStatus(task))}${selectField('排列位置', 'position', siblings.map((item, index) => [String(index), `第 ${index + 1} 项`]), String(siblings.indexOf(task)))}<button type="button" class="button small subtle" data-action="${task.archived ? 'restore-task' : 'archive-task'}" data-project-id="${esc(project.id)}" data-id="${esc(task.id)}">${task.archived ? '恢复事项' : '归档事项'}</button><button type="button" class="danger-link" data-action="delete-task" data-project-id="${esc(project.id)}" data-id="${esc(task.id)}">${icon('trash')}删除任务</button>${formActions('保存修改')}</form>`);
  }
  if (modal.type === 'category') return modalShell(modal.previousName === null ? '新建二级分类' : '编辑二级分类', `<p class="modal-subtitle">归属位置：${esc(sectionNames[modal.section])}</p><form id="category-form"><label class="form-field"><span>分类名称</span><input name="name" id="create-title" maxlength="60" value="${esc(modal.previousName === '' ? '未分类' : modal.previousName || '')}" placeholder="例如：工作、学习、生活" required autocomplete="off"></label>${modal.previousName === null ? '' : '<button type="button" class="danger-link category-delete" data-action="delete-category">删除分类</button>'}${formActions(modal.previousName === null ? '创建分类' : '保存修改')}</form>`);
  if (modal.type === 'confirm-category-delete') return modalShell('删除这个分类？', `<p class="body-copy">删除「${esc(modal.previousName || '未分类')}」分类后，内容和关联都会保留。${modal.previousName === '' ? '文章直接列在侧栏，不再显示这个分类。' : '其中的项目或笔记将取消分类。'}</p><div class="form-actions"><button type="button" class="button" data-action="close-modal">取消</button><button type="button" class="button danger" data-action="confirm-delete-category">删除分类</button></div>`);
  if (modal.type === 'search') return `<section class="modal search-modal" role="dialog" aria-modal="true" aria-label="搜索全部"><div class="search-input-wrap">${icon('search')}<input class="search-input" id="global-search" autocomplete="off" aria-label="搜索项目、任务和笔记" placeholder="搜索项目、任务和笔记…"><button class="icon-button" data-action="close-modal" aria-label="关闭搜索">${icon('close')}</button></div><div class="search-types" role="group" aria-label="搜索类型">${[['all', '全部'], ['project', '项目'], ['task', '任务'], ['note', '笔记']].map(([value, label]) => `<button type="button" data-search-type="${value}" aria-pressed="${searchType === value}">${label}</button>`).join('')}</div><div class="search-results" id="search-results" aria-live="polite">${searchResults('')}</div><div class="search-hint"><span><kbd>↑ ↓</kbd>选择 · <kbd>Enter</kbd>打开 · <kbd>Esc</kbd>关闭</span><span>当前工作区</span></div></section>`;
  if (modal.type === 'new-project') return modalShell('新建项目', `<form id="project-form"><label class="form-field"><span>项目名称</span><input name="title" id="create-title" maxlength="200" placeholder="例如：我的个人网站" required autocomplete="off"></label><label class="form-field"><span>项目说明</span><textarea name="description" maxlength="20000" placeholder="这个项目想完成什么？"></textarea></label><div class="form-row">${selectField('状态', 'status', statuses.map(s => [s.id, s.label]), modal.status || 'planned')}${selectField('优先级', 'priority', Object.entries(priorities), modal.priority || 'medium')}</div><div class="form-row"><label class="form-field"><span>截止日期（可选）</span>${renderDateInput({ esc, icon, id: 'create-project-due', label: '截止日期（可选）', attributes: 'name="due"' })}</label><label class="form-field"><span>分类（可选）</span><input name="tag" maxlength="60" list="project-category-options" value="${esc(modal.category ?? (route().section === 'projects' ? route().category || '' : ''))}" placeholder="如：生活、创作"><datalist id="project-category-options">${categoryNames(data, 'projects').map(name => `<option value="${esc(name)}"></option>`).join('')}</datalist></label></div>${formActions('创建项目')}</form>`);
  if (modal.type === 'filter') return modalShell('筛选项目', `<form id="filter-form">${selectField('项目状态', 'status', [['', '全部状态'], ...statuses.map(s => [s.id, s.label])], filters.status)}${selectField('优先级', 'priority', [['', '全部优先级'], ...Object.entries(priorities)], filters.priority)}${selectField('项目分类', 'tag', [['', '全部分类'], ...[...new Set(data.projects.map(p => p.tag).filter(Boolean))].map(t => [t, t])], filters.tag)}${formActions('应用筛选')}</form>`);
  if (modal.type === 'view-options') return modalShell('视图设置', `<form id="view-form">${selectField('看板分组', 'group', [['status', '按项目状态'], ['priority', '按优先级']], data.preferences.group)}${formActions('保存设置')}</form>`);
  if (modal.type === 'new-field') return modalShell('添加项目属性', `<form id="field-form"><label class="form-field"><span>属性名称</span><input id="create-title" name="name" placeholder="例如：参考链接、预算" maxlength="40" required></label>${selectField('字段类型', 'type', [['text', '文本'], ['number', '数字'], ['date', '日期'], ['checkbox', '复选框']], 'text')}${formActions('添加属性')}</form>`);
  if (modal.type === 'link-notes') {
    return modalShell('关联已有笔记', `<form id="link-notes-form"><div class="check-list">${data.notes.map(n => `<label class="check-item"><input type="checkbox" name="notes" value="${esc(n.id)}" ${n.projectIds.includes(modal.id) ? 'checked' : ''}>${icon('note')}${esc(n.title)}</label>`).join('') || '<p class="drawer-muted">先创建一篇笔记，再来建立关联。</p>'}</div>${formActions('保存关联')}</form>`);
  }
  if (modal.type === 'link-projects') {
    const n = getNote(modal.id);
    return modalShell('关联项目', `<form id="link-projects-form"><div class="check-list">${data.projects.map(p => `<label class="check-item"><input type="checkbox" name="projects" value="${esc(p.id)}" ${n?.projectIds.includes(p.id) ? 'checked' : ''}>${icon(p.icon)}${esc(p.title)}</label>`).join('') || '<p class="drawer-muted">先创建一个项目，再来建立关联。</p>'}</div>${formActions('保存关联')}</form>`);
  }
  if (modal.type === 'settings') return modalShell('数据与备份', `<p class="modal-subtitle">记录自动保存在本机。登录账号可启用多端同步，也可以随时导出备份。</p>${storageError ? `<div class="notice" role="alert">${esc(storageError)}。请先导出当前内容再重新加载，以免丢失尚未保存的编辑。</div>` : ''}<div class="data-actions"><button class="data-action" data-action="export">${icon('download')}<span><strong>导出完整数据</strong><small>JSON 格式 · 包含项目、任务、笔记和关联</small></span>${icon('chevron')}</button><button class="data-action" data-action="import">${icon('upload')}<span><strong>导入为独立副本</strong><small>保留现有内容，使用新的记录 ID 导入</small></span>${icon('chevron')}</button><button class="data-action" data-action="trash">${icon('trash')}<span><strong>本机回收站</strong><small>恢复误删的项目、任务和笔记</small></span>${icon('chevron')}</button><button class="data-action" data-action="help">${icon('help')}<span><strong>使用与快捷键</strong><small>了解当前原型可以体验的功能</small></span>${icon('chevron')}</button></div><p class="modal-subtitle" style="margin:20px 0 0">当前有 ${data.projects.length} 个项目、${data.notes.length} 篇笔记。<br>清理浏览器数据可能移除本地内容，请定期导出。</p><input type="file" id="import-file" accept=".json,application/json" hidden>`);
  if (modal.type === 'help') return modalShell('从一个小进展开始', `<p class="body-copy">项目卡片可以拖动。打开项目后，可以更新状态、完成任务，并把已有笔记关联进来。知识库中的同一篇笔记可以关联多个项目。</p><div class="notice">项目、任务和笔记自动保存在本机。在“账号与多端同步”中登录并连接工作区后，修改会自动上传，页面每 15 秒检查其他设备的更新。编辑中或有未保存草稿时暂缓同步；断网可继续记录，联网后自动重试。自定义属性在表格视图添加。笔记支持插入、粘贴和拖入图片；删除后可从本机回收站恢复。</div><div class="help-shortcuts"><span>搜索全部内容</span><kbd>Ctrl / ⌘ K</kbd><span>快速记下想法</span><kbd>N</kbd><span>关闭当前弹窗或详情</span><kbd>Esc</kbd></div>`);
  if (modal.type === 'trash') return modalShell('本机回收站', `<p class="body-copy">当前设备与工作区的删除副本。恢复后可以继续同步；其他设备的回收站独立保存。</p><div class="trash-list">${trashRecords.map(item => `<div class="trash-row"><div><strong>${esc(item.label)}</strong><small>${{ project: '项目（含任务）', note: '笔记', task: '任务' }[item.data.kind]} · ${esc(new Date(item.createdAt).toLocaleString('zh-CN'))}</small></div><div class="trash-actions"><button type="button" class="button small" data-action="restore-trash" data-id="${esc(item.id)}" aria-label="恢复：${esc(item.label)}">恢复</button><button type="button" class="danger-link" data-action="delete-trash" data-id="${esc(item.id)}" aria-label="永久删除：${esc(item.label)}">永久删除</button></div></div>`).join('') || '<p class="body-copy">回收站为空。</p>'}</div>`);
  if (modal.type === 'confirm-purge') return modalShell('永久删除恢复副本？', `<p class="body-copy">这条本机恢复副本将被永久删除，之后无法通过回收站恢复。</p><div class="form-actions"><button class="button" data-action="trash">返回回收站</button><button class="button danger" data-action="confirm-purge">永久删除</button></div>`);
  if (modal.type === 'confirm-delete') return modalShell(`删除${modal.kind === 'project' ? '项目' : '笔记'}`, `<p class="body-copy">确定删除「${esc(modal.title)}」吗？${modal.kind === 'project' ? '项目内的任务会一起删除，关联笔记仍保留在知识库中。' : '笔记将从所有关联项目中移除。'}删除前会保存本机恢复副本，可在“数据与备份 → 本机回收站”恢复。</p><div class="form-actions"><button class="button" data-action="close-modal">取消</button><button class="button danger" data-action="confirm-delete">确认删除</button></div>`);
  if (modal.type === 'confirm-import') return modalShell('导入为独立副本', `<p class="body-copy">将导入 ${importCandidate.projects.length} 个项目和 ${importCandidate.notes.length} 篇笔记。现有内容会保留；导入的项目和笔记会标记“（导入）”，并使用新的 ID 保持副本间的关联。</p><div class="notice">本次导入仅包含项目、任务、笔记及自定义属性；当前视图设置保持不变。笔记图片会随副本一并导入。</div><div class="form-actions"><button class="button" data-action="close-modal">取消</button><button class="button primary" data-action="confirm-import">导入副本</button></div>`);
  return '';
}
function searchResults(query) {
  const q = query.trim();
  if (!q) {
    const recent = recentRecords.flatMap(item => {
      const record = item?.kind === 'project' ? getProject(item.id) : item?.kind === 'note' ? getNote(item.id) : null;
      return record ? [{ ...record, kind: item.kind, snippet: '' }] : [];
    });
    const source = recent.length ? recent : [...data.projects.map(p => ({ ...p, kind: 'project' })), ...data.notes.map(n => ({ ...n, kind: 'note' }))].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const results = source.filter(item => searchType === 'all' || item.kind === searchType).slice(0, 8);
    return `<div class="recent-heading">${recent.length ? '最近打开' : '最近更新'}</div>${results.map(item => searchResult(item, '')).join('') || '<div class="search-empty">输入关键词，查找项目、任务和笔记。</div>'}`;
  }
  const { results, total } = searchWorkspace(data, q, searchType);
  return total ? `<div class="recent-heading">找到 ${total} 条${total > results.length ? ` · 显示前 ${results.length} 条，请缩小搜索范围` : ''}</div>${results.map(item => searchResult(item, q)).join('')}` : '<div class="search-empty">没有找到相关内容，换个关键词或类型试试。</div>';
}
function searchResult(item, query) {
  const attrs = item.kind === 'note' ? `data-note="${esc(item.id)}"` : item.kind === 'task' ? `data-project="${esc(item.projectId)}" data-search-task="${esc(item.id)}"` : `data-project="${esc(item.id)}"`;
  const label = item.kind === 'task' ? `任务 · ${item.projectTitle}` : item.kind === 'note' ? `笔记${item.category ? ` · ${item.category}` : ''}` : '项目';
  return `<button type="button" class="search-result" ${attrs}>${icon(item.kind === 'task' ? 'checkCircle' : item.kind === 'note' ? 'note' : 'layers')}<span><strong>${highlightText(item.title, query, esc)}</strong><small>${esc(label)}${item.archived ? ' · 已归档' : ''}</small>${item.snippet ? `<span class="search-snippet">${highlightText(item.snippet, query, esc)}</span>` : ''}</span></button>`;
}
function rememberRecent(current) {
  const kind = current.kind;
  if (!['project', 'note'].includes(kind) || !(kind === 'project' ? getProject(current.id) : getNote(current.id))) return;
  if (recentRecords[0]?.kind === kind && recentRecords[0]?.id === current.id) return;
  recentRecords = [{ kind, id: current.id }, ...recentRecords.filter(item => item?.kind !== kind || item?.id !== current.id)].slice(0, 20);
  try { localStorage.setItem(recentKey, JSON.stringify(recentRecords)); } catch { /* Navigation does not depend on history storage. */ }
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
  sidebarCreateMenu.close();
  datePicker.close();
  const activeId = document.activeElement?.id;
  const activeTask = document.activeElement?.dataset.task;
  const activeTaskProject = document.activeElement?.dataset.projectId;
  const activeStatus = document.activeElement?.dataset.taskStatus;
  $$('[data-task-add] input').forEach(input => moduleTaskDrafts.set(input.id, input.value));
  const captureSelection = activeId === 'route-capture-body' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const scrollKey = scroll => JSON.stringify([scroll.closest('.mr-route-line').querySelector('[data-select-project]')?.dataset.selectProject, scroll.closest('[data-route-module]')?.dataset.routeModule || '']);
  const stationScroll = new Map($$('.mr-route-line .mr-stations-scroll').map(scroll => [scrollKey(scroll), scroll.scrollLeft]));
  const scrollTop = $('.drawer-scroll')?.scrollTop || 0;
  const current = route(), project = current.kind === 'project' && getProject(current.id), note = current.kind === 'note' && getNote(current.id);
  rememberRecent(current);
  document.title = `拾序 · ${project?.title || note?.title || { projects: '我的项目', knowledge: '知识库', inbox: '收藏夹' }[current.section]}`;
  $('#app').innerHTML = `<div class="app-shell">${sidebar()}<div class="main-wrap">${topbar()}${storageError ? `<div class="storage-warning" role="alert">${esc(storageError)} · <button data-action="settings">导出当前内容</button></div>` : ''}<main id="main">${current.kind === 'new-note' ? newNotePage() : note ? renderNotePage({ note, esc, icon, fullWidth: noteFullWidth }) : `${mobileCategories()}${current.section === 'projects' ? projectsPage() : notesPage(current.section === 'inbox')}`}</main>${mobileNav()}</div></div>`;
  sidebarControls.refresh();
  $('#overlay-root').innerHTML = `${project || modal ? '<div class="overlay" data-action="dismiss"></div>' : ''}${project ? projectDrawer(project) : ''}${modalMarkup()}`;
  const editorNote = note || (current.kind === 'new-note' ? noteCreation?.note : null);
  if (editorNote) liveEditor.mount($('#live-note-editor'), editorNote);
  else liveEditor.destroy();
  $('#app').inert = Boolean(project || modal);
  document.body.style.overflow = project || modal ? 'hidden' : '';
  if ($('.drawer-scroll')) $('.drawer-scroll').scrollTop = scrollTop;
  if (activeId && document.getElementById(activeId) && !document.getElementById(activeId).closest('[inert]')) document.getElementById(activeId).focus({ preventScroll: true });
  if (captureSelection) document.getElementById(activeId)?.setSelectionRange(...captureSelection);
  for (const scroll of $$('.mr-route-line .mr-stations-scroll')) scroll.scrollLeft = stationScroll.get(scrollKey(scroll)) || 0;
  $$('[data-task-add] input').forEach(input => { input.value = moduleTaskDrafts.get(input.id) || ''; });
  if (activeStatus) $$('[data-task-status]').find(el => el.dataset.taskStatus === activeStatus && el.dataset.projectId === activeTaskProject && !el.closest('[inert]'))?.focus({ preventScroll: true });
  if (activeTask && activeTaskProject) $$('[data-task][data-project-id]').find(el => el.dataset.task === activeTask && el.dataset.projectId === activeTaskProject && !el.closest('[inert]'))?.focus({ preventScroll: true });
  requestAnimationFrame(wirePretext);
  syncUI?.refresh();
  if (searchTarget && ((searchTarget.taskId && project?.id === searchTarget.projectId) || (searchTarget.noteId && note?.id === searchTarget.noteId))) {
    const target = searchTarget; searchTarget = null;
    requestAnimationFrame(() => {
      if (target.noteId) { liveEditor.focusMatch(target.query); return; }
      const row = $$('.drawer [data-task-row]').find(el => el.dataset.taskRow === target.taskId);
      if (row) {
        row.classList.add('search-located'); row.scrollIntoView({ block: 'center' });
        row.querySelector('.module-task-title')?.focus({ preventScroll: true });
      } else if (getProject(target.projectId)?.tasks.some(task => task.id === target.taskId)) showModal('task', { projectId: target.projectId, id: target.taskId });
    });
  }
}
function showModal(type, options = {}) {
  modal = { type, ...options }; render();
  requestAnimationFrame(() => { const target = $('.modal input:not([type=checkbox]):not([hidden])') || $('#modal-title') || $('.modal button'); target?.focus(); });
}
function dismissModal() {
  const hadSearch = modal?.type === 'search'; modal = null; importCandidate = null; render();
  ($('.drawer .icon-button') || $('.note-back') || (hadSearch ? $('.top-actions [data-action=search]') : $('[data-action=new-project]')) || $('.mobile-nav .mobile-create'))?.focus({ preventScroll: true });
}

document.addEventListener('click', async event => {
  const line = event.target.closest('.workspace-route .mr-route-line');
  if (line && !event.target.closest('.project-modules,form,label,input,textarea,select,a,button:not([data-select-project])')) {
    const id = line.querySelector('[data-select-project]').dataset.selectProject;
    if (routeState.selectedProject === id) openProject(id);
    else selectRouteProject(id);
    return;
  }
  const target = event.target.closest('button,a,[data-action],[data-project],[data-note],[data-category],[data-view],[data-editor-mode]');
  if (!target) return;
  if (target.hasAttribute('data-note-fold')) {
    const key = JSON.stringify([target.dataset.section, target.dataset.noteFold]), open = collapsedNoteCategories.has(key);
    open ? collapsedNoteCategories.delete(key) : collapsedNoteCategories.add(key);
    target.setAttribute('aria-expanded', String(open));
    target.setAttribute('aria-label', `${open ? '收起' : '展开'}${target.dataset.noteFold || '未分类'}文章`);
    document.getElementById(target.getAttribute('aria-controls')).hidden = !open; return;
  }
  if (target.hasAttribute('data-category-fold')) {
    event.preventDefault();
    const category = target.dataset.categoryFold, open = collapsedProjectCategories.has(category);
    open ? collapsedProjectCategories.delete(category) : collapsedProjectCategories.add(category);
    target.setAttribute('aria-expanded', String(open));
    document.getElementById(target.getAttribute('aria-controls')).hidden = !open;
    try { localStorage.setItem('shixu.sidebar.collapsed-categories.v1', JSON.stringify([...collapsedProjectCategories])); } catch { /* Keep this session usable. */ }
    if (route().section !== 'projects' || route().category !== category || route().kind) navigate(categoryPath('projects', category));
    return;
  }
  if (target.matches('.nav-item[href="#projects"]') && location.hash === '#projects') {
    event.preventDefault(); $('[data-nav-expand="projects"]').click(); return;
  }
  if (target.matches('.nav-item[href="#knowledge"]')) {
    if (route().section === 'knowledge') {
      event.preventDefault(); $('[data-nav-expand="knowledge"]').click(); return;
    }
    expandedSections.add('knowledge');
  }
  if (target.dataset.navExpand) {
    const section = target.dataset.navExpand, expanded = !expandedSections.has(section);
    expanded ? expandedSections.add(section) : expandedSections.delete(section);
    target.setAttribute('aria-expanded', String(expanded));
    target.setAttribute('aria-label', `${expanded ? '收起' : '展开'}${sectionNames[section]}分类`);
    document.getElementById(`nav-children-${section}`).hidden = !expanded;
    return;
  }
  if (target.getAttribute('href') === '#main') { event.preventDefault(); $('#main').setAttribute('tabindex', '-1'); $('#main').focus(); return; }
  if (target.dataset.searchType) {
    searchType = target.dataset.searchType;
    $$('[data-search-type]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.searchType === searchType)));
    $('#search-results').innerHTML = searchResults($('#global-search').value);
    return;
  }
  if (target.dataset.searchTask) {
    searchTarget = { projectId: target.dataset.project, taskId: target.dataset.searchTask };
    openProject(target.dataset.project); return;
  }
  if (target.dataset.project) { openProject(target.dataset.project); return; }
  if (target.dataset.note) {
    if (target.closest('#search-results') && $('#global-search')?.value.trim()) searchTarget = { noteId: target.dataset.note, query: $('#global-search').value.trim() };
    openNote(target.dataset.note); return;
  }
  if (workspaceViews.includes(target.dataset.view)) {
    routeState.projectOrder = null;
    workspaceView = target.dataset.view;
    try { localStorage.setItem(LAYOUT_KEY, workspaceView); } catch { toast('已切换布局，但无法记住选择，请检查浏览器存储空间。'); }
    render(); $$('.view-tab').find(el => el.dataset.view === workspaceView)?.focus({ preventScroll: true }); return;
  }
  if (['all', 'active', 'done'].includes(target.dataset.filter)) { routeState.filter = target.dataset.filter; render(); $$('.mr-filters button').find(el => el.dataset.filter === routeState.filter)?.focus({ preventScroll: true }); return; }
  if (['note', 'task'].includes(target.dataset.routeKind)) { routeState.kind = target.dataset.routeKind; render(); $('#route-capture-body')?.focus({ preventScroll: true }); return; }
  if (target.dataset.mdAction) { liveEditor.format(target.dataset.mdAction); return; }
  const action = target.dataset.action;
  switch (action) {
    case 'toggle-note-width': {
      noteFullWidth = !noteFullWidth;
      try { localStorage.setItem(NOTE_LAYOUT_KEY, noteFullWidth ? 'full' : 'standard'); } catch { /* Keep this session's width. */ }
      applyNoteWidth(); break;
    }
    case 'create-note': createNote(); break;
    case 'insert-note-image': $('#note-image-upload')?.click(); break;
    case 'new-section-page': {
      const section = target.dataset.section;
      if (section === 'projects') showModal('new-project', { section, category: '' });
      else openNoteCreate({ section });
      break;
    }
    case 'new-category-page': {
      const section = target.dataset.section;
      if (section === 'projects') showModal('new-project', { section, category: target.dataset.name });
      else openNoteCreate({ section, category: target.dataset.name });
      break;
    }
    case 'new-category': showModal('category', { section: target.dataset.section, previousName: null }); break;
    case 'edit-category': showModal('category', { section: target.dataset.section, previousName: target.dataset.name }); break;
    case 'delete-category': modal = { ...modal, type: 'confirm-category-delete' }; render(); $('.modal .button')?.focus(); break;
    case 'confirm-delete-category': {
      const section = modal.section;
      if (storageError) { toast('保存受阻，请先导出内容，再重新加载。'); break; }
      const previous = structuredClone(data);
      try {
        removeCategory(data, section, modal.previousName, new Date().toISOString());
        if (!save()) { data = previous; render(); break; }
        const destination = modal.previousName === '' ? section : categoryPath(section, '');
        modal = null; navigate(destination); render();
      } catch (error) { data = previous; toast(error.message); }
      break;
    }
    case 'search': searchType = 'all'; showModal('search'); break;
    case 'account': syncUI?.open(); break;
    case 'settings': showModal('settings'); break;
    case 'help': showModal('help'); break;
    case 'new-project': {
      const group = target.dataset.defaultGroup;
      showModal('new-project', data.preferences.group === 'priority' ? { priority: group } : { status: group }); break;
    }
    case 'new-note': openNoteCreate({ section: route().section === 'inbox' ? 'inbox' : 'knowledge' }); break;
    case 'quick-note': openNoteCreate(); break;
    case 'project-new-note': openNoteCreate({ projectId: target.dataset.id }); break;
    case 'cancel-note-create': { const projectId = route().id; noteCreation = null; if (getProject(projectId)) openProject(projectId); else closeDrawer(); break; }
    case 'close-modal': dismissModal(); break;
    case 'dismiss': if (modal) dismissModal(); else closeDrawer(); break;
    case 'close-drawer': closeDrawer(); break;
    case 'export-note': {
      const note = currentNote();
      if (!note) break;
      const name = note.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) || '未命名笔记';
      const url = URL.createObjectURL(new Blob([portableMarkdown(note.body, note.attachments)], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `${name}.md`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); break;
    }
    case 'filter': showModal('filter'); break;
    case 'clear-filter': filters = { status: '', priority: '', tag: '' }; render(); break;
    case 'view-options': showModal('view-options'); break;
    case 'new-field': if (data.fields.length >= 30) toast('原型最多支持 30 个自定义属性。'); else showModal('new-field'); break;
    case 'link-notes': showModal('link-notes', { id: target.dataset.id }); break;
    case 'link-projects': showModal('link-projects', { id: target.dataset.id }); break;
    case 'toggle-pin': { const p = getProject(target.dataset.id); if (p) { p.pinned = !p.pinned; save(p); render(); } break; }
    case 'new-module': showModal('module', { projectId: target.dataset.projectId }); break;
    case 'edit-module': showModal('module', { projectId: target.dataset.projectId, id: target.dataset.id, ungrouped: target.dataset.id === '' }); break;
    case 'edit-task': showModal('task', { projectId: target.dataset.projectId, id: target.dataset.id }); break;
    case 'delete-module': {
      const p = getProject(target.dataset.projectId);
      if (p) {
        if (saveTaskChange(p, () => {
          removeModule(p, target.dataset.id);
        })) {
          if (routeModuleTargets.get(p.id) === target.dataset.id) routeModuleTargets.delete(p.id);
          dismissModal();
        }
      }
      break;
    }
    case 'delete-task': await deleteToTrash('task', target.dataset.id, target.dataset.projectId || route().id); break;
    case 'toggle-note-favorite': {
      const note = currentNote(); if (!note) break;
      const previous = structuredClone(note);
      note.favorite = !isNoteFavorite(note);
      if (note !== noteCreation?.note && !save(note)) {
        for (const key of Object.keys(note)) delete note[key];
        Object.assign(note, previous); break;
      }
      render(); $('[data-action="toggle-note-favorite"]')?.focus({ preventScroll: true });
      toast(note === noteCreation?.note ? note.favorite ? '创建后将加入收藏夹。' : '已取消草稿收藏。' : note.favorite ? '已加入收藏夹。' : '已取消收藏。'); break;
    }
    case 'project-archives': showModal('project-archives'); break;
    case 'task-archives': showModal('task-archives', { projectId: target.dataset.projectId }); break;
    case 'archive-project': case 'restore-project': case 'archive-completed-projects': {
      const archived = action !== 'restore-project';
      const projects = action === 'archive-completed-projects' ? data.projects.filter(p => !p.archived && p.status === 'done') : data.projects.filter(p => p.id === target.dataset.id);
      if (!projects.length || storageError) break;
      if (archived && projects.some(p => routeDraft(p.id).trim() || [...moduleTaskDrafts].some(([id, text]) => id.includes(p.id) && text.trim()))) { toast('请先保存或清空这些项目的事项和记录草稿。'); break; }
      const previous = structuredClone(data);
      for (const p of projects) { p.archived = archived; p.updatedAt = new Date().toISOString(); }
      if (!save()) { data = previous; render(); break; }
      if (modal?.type !== 'project-archives') modal = null;
      if (route().kind === 'project' && archived && projects.some(p => p.id === route().id)) closeDrawer();
      render(); toast(archived ? '项目已归档，可在归档列表中恢复。' : '项目已恢复。'); break;
    }
    case 'archive-task': case 'restore-task': case 'archive-completed-tasks': {
      const p = getProject(target.dataset.projectId); if (!p) break;
      const tasks = action === 'archive-completed-tasks' ? p.tasks.filter(task => !task.archived && task.done) : p.tasks.filter(task => task.id === target.dataset.id);
      if (!tasks.length) break;
      if (saveTaskChange(p, () => tasks.forEach(task => { task.archived = action !== 'restore-task'; }))) {
        if (modal?.type === 'task') modal = null;
        render(); toast(action === 'restore-task' ? '事项已恢复。' : '事项已归档，可随时恢复。');
      } else render();
      break;
    }
    case 'delete-project': { const p = getProject(target.dataset.id); if (p) showModal('confirm-delete', { kind: 'project', id: p.id, title: p.title }); break; }
    case 'delete-note': { const n = getNote(target.dataset.id); if (n) showModal('confirm-delete', { kind: 'note', id: n.id, title: n.title }); break; }
    case 'confirm-delete': if (modal?.type === 'confirm-delete') await deleteToTrash(modal.kind, modal.id); break;
    case 'trash': await openTrash(); break;
    case 'restore-trash': await restoreTrash(target.dataset.id); break;
    case 'undo-delete': if (undoTrashId) await restoreTrash(undoTrashId); break;
    case 'delete-trash': showModal('confirm-purge', { id: target.dataset.id }); break;
    case 'confirm-purge': {
      if (modal?.type !== 'confirm-purge') break;
      try {
        const id = modal.id, context = await trashContext(), record = await getRecoveryEntry(id);
        if (!record || record.space !== 'main' || record.kind !== 'trash' || record.userId !== context.owner) throw new Error('当前工作区中找不到这条恢复记录。');
        await assertTrashContext(context);
        await deleteRecovery(id); await openTrash(); toast('已永久移除这条本机恢复副本。');
      } catch (error) { toast(error.message); }
      break;
    }
    case 'export': exportData(); break;
    case 'import': $('#import-file')?.click(); break;
    case 'confirm-import': await importData(); break;
  }
});

document.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target, values = new FormData(form);
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const title = String(values.get('title') || '').trim();
  if ((['project-form', 'task-edit-form'].includes(form.id) || form.hasAttribute('data-task-add')) && !title) { const input = form.querySelector('[name=title]'); input.setCustomValidity('请填写内容，不能只有空格。'); input.reportValidity(); return; }
  if (form.hasAttribute('data-task-add')) {
    const p = getProject(form.dataset.projectId);
    if (!p || storageError) return;
    if (p.tasks.length >= 1000) { toast('每个项目最多 1000 项任务。'); return; }
    const input = form.querySelector('input');
    if (saveTaskChange(p, () => p.tasks.push({ id: uid(), title, done: false, status: 'todo', moduleId: form.dataset.moduleId || '' }))) { input.value = ''; moduleTaskDrafts.delete(input.id); }
    render(); document.getElementById(input.id)?.focus({ preventScroll: true }); return;
  }
  switch (form.id) {
    case 'module-form': {
      const p = getProject(modal.projectId), name = String(values.get('name') || '').trim();
      if (!p || storageError) break;
      if (!name || (!modal.ungrouped && name === ungroupedName(p)) || (p.modules || []).some(module => module.id !== modal.id && module.name === name)) { $('#form-error').textContent = '请输入不重复的模块名称。'; break; }
      const module = p.modules?.find(item => item.id === modal.id);
      if (!module && !modal.ungrouped && (p.modules || []).length >= 100) { $('#form-error').textContent = '每个项目最多 100 个模块。'; break; }
      if (saveTaskChange(p, () => {
        if (modal.ungrouped) p.ungroupedName = name;
        else if (module) module.name = name;
        else (p.modules ||= []).push({ id: uid(), name });
      })) dismissModal(); break;
    }
    case 'task-edit-form': {
      const p = getProject(modal.projectId), task = p?.tasks.find(item => item.id === modal.id);
      if (!task || storageError) break;
      if (saveTaskChange(p, () => {
        const moved = (task.moduleId || '') !== String(values.get('moduleId') || '');
        task.title = title; task.moduleId = String(values.get('moduleId') || '');
        setTaskStatus(task, values.get('taskStatus'));
        const siblings = p.tasks.filter(item => item !== task && !item.archived && (item.moduleId || '') === task.moduleId);
        p.tasks = p.tasks.filter(item => item !== task);
        const before = !moved && siblings[Number(values.get('position'))];
        const index = before ? p.tasks.indexOf(before) : siblings.length ? p.tasks.indexOf(siblings.at(-1)) + 1 : p.tasks.length;
        p.tasks.splice(index, 0, task);
      })) dismissModal(); break;
    }
    case 'category-form': {
      if (storageError) { toast('保存受阻，请先导出内容，再重新加载。'); break; }
      try {
        const section = modal.section;
        const previous = structuredClone(data);
        const folder = writeCategory(data, section, modal.previousName, String(values.get('name') || ''), uid(), new Date().toISOString());
        if (!save(folder)) { data = previous; render(); break; }
        modal = null; expandedSections.add(section); navigate(categoryPath(section, folder.name));
      } catch (error) { $('#form-error').textContent = error.message; }
      break;
    }
    case 'route-capture-form': saveRouteCapture(form); break;
    case 'project-form': {
      const p = { id: uid(), title, description: String(values.get('description')).trim(), status: values.get('status'), priority: values.get('priority'), tag: String(values.get('tag') || '').trim(), due: values.get('due'), color: 'blue', icon: 'layers', tasks: [], pinned: false, custom: {}, updatedAt: new Date().toISOString() };
      const parent = modal.section ? categoryPath(modal.section, p.tag) : sectionPath();
      data.projects.unshift(p); const saved = save(); modal = null; filters = { status: '', priority: '', tag: '' }; routeState.filter = 'all'; routeState.selectedProject = p.id; openProject(p.id, parent); if (saved) toast('项目已创建，添加第一个任务吧。'); break;
    }
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
function summarize(body) { return body.replace(/!\[([^\[\]\n]*)\]\([^\n)]*\)/g, '$1').split('\n').filter(line => line.trim() && !line.startsWith('#')).join(' ').replace(/[*`>]/g, '').slice(0, 90); }
document.addEventListener('input', event => {
  const el = event.target;
  if (el.closest('[data-task-add]')) moduleTaskDrafts.set(el.id, el.value);
  if (el.matches('#project-form input[type=date]')) el.toggleAttribute('data-empty-date', !el.value);
  if (el.id === 'route-capture-body') { el.setCustomValidity(''); routeState.drafts.set(el.form.dataset.projectId || '', el.value); return; }
  if (el.name === 'title') el.setCustomValidity('');
  if (el.id === 'global-search') { $('#search-results').innerHTML = searchResults(el.value); return; }
  if (['title', 'description'].includes(el.dataset.editProject)) { const p = getProject(route().id); if (p && (el.dataset.editProject !== 'title' || el.value.trim())) { p[el.dataset.editProject] = el.value; save(p); document.title = `拾序 · ${p.title}`; if (el.dataset.editProject === 'title') refreshProjectNavTitle(p); } }
  if (el.dataset.editNote === 'title') {
    el.setCustomValidity('');
    const n = currentNote();
    if (n && (el.value.trim() || n === noteCreation?.note)) { n.title = el.value; if (n !== noteCreation?.note) { save(n); refreshNoteNavTitle(n); } document.title = `拾序 · ${n.title || '新建笔记'}`; }
  }
});
document.addEventListener('change', async event => {
  const el = event.target;
  if (el.id === 'note-image-upload') { void liveEditor.images([...el.files]); el.value = ''; return; }
  if (el.id === 'mobile-category') { navigate(el.value); return; }
  if (el.id === 'sort-select') { routeState.projectOrder = null; data.preferences.sort = el.value; save(); render(); }
  if (el.name === 'moduleId' && el.form?.id === 'route-capture-form') { routeModuleTargets.set(el.form.dataset.projectId, el.value); return; }
  if (el.dataset.taskStatus) { const p = getProject(el.dataset.projectId), task = p?.tasks.find(item => item.id === el.dataset.taskStatus); if (task) { saveTaskChange(p, () => setTaskStatus(task, el.value)); render(); } return; }
  if (el.dataset.task) { const p = getProject(el.dataset.projectId || route().id), t = p?.tasks.find(t => t.id === el.dataset.task); if (t) { saveTaskChange(p, () => setTaskStatus(t, el.checked ? 'done' : 'todo')); render(); } }
  if (el.dataset.editProject) {
    const p = getProject(route().id), key = el.dataset.editProject;
    if (p) { if (key === 'title' && !el.value.trim()) { el.value = p.title; toast('项目标题不能为空。'); return; } p[key] = el.value.trim(); save(p); document.title = `拾序 · ${p.title}`; if (key === 'title') refreshProjectNavTitle(p); if (key === 'tag') render(); }
  }
  if (el.dataset.customField) { const p = getProject(route().id), f = data.fields.find(f => f.id === el.dataset.customField); if (p && f) { p.custom[f.id] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value; save(p); } }
  if (el.dataset.editNote && el.dataset.editNote !== 'body') {
    const n = currentNote(), key = el.dataset.editNote;
    if (n === noteCreation?.note) return;
    if (n) { if (key === 'title' && !el.value.trim()) { el.value = n.title; toast('笔记标题不能为空。'); return; } n[key] = key === 'tags' ? [...new Set(el.value.split(/[,，]/).map(s => s.trim()).filter(Boolean))].slice(0, 20).map(t => t.slice(0, 60)) : el.value.trim(); save(n); document.title = `拾序 · ${n.title}`; if (key === 'category') render(); }
  }
  if (el.id === 'import-file' && el.files[0]) {
    try {
      const file = el.files[0]; if (file.size > WORKSPACE_BYTES) throw new Error('支持导入 32 MB 以内的备份。');
      importCandidate = validateData(JSON.parse(await file.text()));
      showModal('confirm-import');
    } catch (error) { toast(error instanceof SyntaxError ? '文件不是有效的 JSON 备份。' : error.message); el.value = ''; }
  }
});
function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `拾序备份-${new Date().toLocaleDateString('sv-SE')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('备份已生成，请在浏览器下载列表中查看。');
}
async function importData() {
  if (!importCandidate) return;
  const candidate = importCandidate, generation = saveGeneration;
  const incoming = structuredClone(candidate), projectIds = new Map(), fieldIds = new Map();
  try { await persistAttachments(incoming); }
  catch (error) { toast(error.message || '图片保存失败，尚未导入。'); return; }
  if (importCandidate !== candidate || saveGeneration !== generation || modal?.type !== 'confirm-import') { toast('内容已发生变化，请重新导入。'); return; }
  for (const f of incoming.fields) { const old = f.id; f.id = uid(); fieldIds.set(old, f.id); }
  for (const p of incoming.projects) {
    const old = p.id; p.id = uid(); projectIds.set(old, p.id); p.title = `${p.title.slice(0, 194)}（导入）`;
    p.pinned = false; p.tasks.forEach(t => t.id = uid()); p.custom = Object.fromEntries(Object.entries(p.custom).filter(([key]) => fieldIds.has(key)).map(([key, value]) => [fieldIds.get(key), value]));
  }
  for (const n of incoming.notes) { n.id = uid(); n.title = `${n.title.slice(0, 194)}（导入）`; n.projectIds = n.projectIds.map(id => projectIds.get(id)); }
  const folders = incoming.folders.filter(folder => !data.folders.some(existing => existing.section === folder.section && existing.name === folder.name)).map(folder => ({ ...folder, id: uid() }));
  const combined = { ...data, projects: [...data.projects, ...incoming.projects], notes: [...data.notes, ...incoming.notes], fields: [...data.fields, ...incoming.fields], folders: [...data.folders, ...folders] };
  try { validateData(combined); } catch { toast('导入后会超出原型容量，请减少备份中的记录或属性数量。'); return; }
  const previous = data; data = combined; const saved = save();
  if (!saved) { data = previous; return; }
  importCandidate = null; dismissModal(); toast('副本已导入，现有内容已保留。');
}
document.addEventListener('keydown', event => {
  if (event.target.closest('#sync-dialog')) return;
  if (event.isComposing || event.keyCode === 229) return;
  if (event.defaultPrevented && event.target.closest('.cm-editor')) return;
  if (event.key === 'Escape' && CSS.supports('selector(select:open)') && event.target.closest('select')?.matches(':open')) return;
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && event.target.closest('#route-capture-form')) { event.preventDefault(); event.target.closest('form').requestSubmit(); return; }
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchType = 'all'; showModal('search'); return; }
  if (modal?.type === 'search' && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
    const results = $$('#search-results .search-result'), index = results.indexOf(document.activeElement);
    if (event.key === 'Enter' && event.target.id === 'global-search') { event.preventDefault(); results[0]?.click(); return; }
    if (event.key !== 'Enter' && (event.target.id === 'global-search' || index >= 0)) {
      event.preventDefault();
      const next = index < 0 ? event.key === 'ArrowDown' ? 0 : results.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      results[next]?.focus(); return;
    }
  }
  if (event.key === 'Escape') { if (modal) dismissModal(); else if (route().kind && !event.target.closest('.cm-editor')) closeDrawer(); return; }
  if (!typing && event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !modal && !route().kind) { event.preventDefault(); openNoteCreate(); return; }
  const card = event.target.closest('[role=button][data-project],[role=button][data-note],tr[data-project]');
  if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); card.dataset.project ? openProject(card.dataset.project) : openNote(card.dataset.note); }
  const dialog = $('.modal') || $('.drawer');
  if (event.key === 'Tab' && dialog) {
    const controls = [...$$('button:not(:disabled),a[href],input:not([hidden]),select,textarea,[tabindex="0"]', dialog), ...$$('#toast.show button')].filter(e => !e.closest('[inert]') && e.getClientRects().length);
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
window.addEventListener('hashchange', () => { modal = null; if (route().category !== null) expandedSections.add(route().section); render(); const drawer = $('.drawer'); if (route().kind === 'new-note') { $('#note-title')?.focus({ preventScroll: true }); } else if (drawer) { $('.drawer-scroll').scrollTop = 0; $('.drawer .icon-button')?.focus(); } else { $('#main h1')?.setAttribute('tabindex', '-1'); $('#main h1')?.focus({ preventScroll: true }); } });
window.addEventListener('storage', event => {
  if (event.key === NOTE_LAYOUT_KEY) { noteFullWidth = event.newValue === 'full'; applyNoteWidth(); return; }
  if (event.key === LAYOUT_KEY) { workspaceView = workspaceViews.includes(event.newValue) ? event.newValue : 'route'; render(); return; }
  if (event.key === KEY && event.newValue !== lastDisk) { storageError = '另一个窗口已更新数据，请先导出当前编辑，再重新加载'; render(); toast(storageError); }
});
const recordDrag = installRecordDrag({ announce: toast, canStart: () => !modal && !storageError && !taskDrag.isDragging() && !datePicker.isOpen(), commit(operation) {
  if (storageError) return false;
  const previous = structuredClone(data), timestamp = new Date().toISOString();
  try {
    const changed = operation.kind === 'category' ? moveCategory(data, operation.section, operation.id, operation.beforeName, timestamp) : moveRecord(data, operation, timestamp);
    if (!changed) return false;
    if (!save()) { data = previous; render(); return false; }
    routeState.projectOrder = null;
    if (operation.category !== undefined) { collapsedProjectCategories.delete(operation.category); collapsedNoteCategories.delete(JSON.stringify([operation.section, operation.category])); expandedSections.add(operation.section); }
    const focus = operation.kind === 'category' ? ['category', operation.section, operation.id] : ['record', operation.section, operation.id];
    render();
    const surface = operation.visibleIds ? operation.section === 'projects' ? 'home' : 'notes' : 'sidebar';
    const handle = $$('[data-record-drag]').find(el => el.dataset.recordDrag === focus[0] && el.dataset.orderSection === focus[1] && el.dataset.orderId === focus[2] && (el.dataset.orderSurface || 'sidebar') === surface && el.getClientRects().length);
    handle?.focus({ preventScroll: true });
    toast(operation.kind === 'category' ? '分类顺序已保存。' : '顺序与分类已保存。');
    return true;
  } catch (error) { data = previous; toast(error.message || '拖动未保存。'); return false; }
} });
const taskDrag = installRouteTaskDrag({ getProject, saveTaskChange, render, announce: toast });
const liveEditor = createLiveNoteEditor({ getNote, notify: toast, onChange(id, body) {
  const note = getNote(id); if (!note) return;
  note.body = body; note.summary = summarize(body); if (note !== noteCreation?.note) save(note);
  if ($('#note-word-count')) $('#note-word-count').textContent = `${body.replace(/!\[[^\[\]\n]*\]\([^\n)]*\)/g, '').trim().length.toLocaleString('zh-CN')} 字`;
} });
const datePicker = installDatePicker({ commit(input, value) {
  if (input.dataset.editProject === 'due') {
    const project = getProject(route().id);
    return Boolean(project && saveTaskChange(project, () => { project.due = value; }));
  }
  return true;
} });
const sidebarControls = installSidebarControls();
const sidebarCreateMenu = installSidebarCreateMenu({ icon });
setLocale('zh-CN');
if (!lastDisk && !storageError) save();
if (!location.hash) history.replaceState(null, '', '#projects');
render();
function canSyncWorkspace() {
  if (route().kind === 'new-note') return false;
  if (storageError || modal || sidebarControls.isResizing() || taskDrag.isDragging() || recordDrag.isDragging() || datePicker.isOpen() || liveEditor.isBusy() || [...moduleTaskDrafts.values()].some(title => title.trim()) || [...routeState.drafts.values()].some(body => body.trim())) return false;
  const active = document.activeElement;
  if (active?.matches('input,textarea,select,[contenteditable=true]') && !active.closest('#sync-dialog')) return false;
  try { return localStorage.getItem(KEY) === lastDisk; } catch { return false; }
}
syncClient = createSyncClient({
  space: 'main', storageKey: KEY, freshLocal,
  getData: () => data,
  canSync: canSyncWorkspace,
  async applyData(next) {
    if (!canSyncWorkspace()) return false;
    try {
      const generation = saveGeneration;
      const incoming = validateData(next);
      await persistAttachments(incoming);
      if (!canSyncWorkspace() || saveGeneration !== generation) return false;
      if (incoming.projects.some(project => project.order !== undefined && project.order !== getProject(project.id)?.order)) incoming.preferences.sort = 'manual';
      const serialized = serializeWorkspace(incoming);
      localStorage.setItem(KEY, serialized); lastDisk = serialized; data = incoming;
      saveGeneration++;
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

import { seedData, statuses } from './data.js';
import { prepare, layout, setLocale } from './vendor/pretext/layout.js';

const themes = [
  { id: 'clarity', name: '澄明', en: 'CLARITY', color: '#007aff', type: '轻透工作台', description: '清晰的层级、轻透的侧栏，让正在做的事情自然浮现。', keywords: ['轻透材质', '分栏协作', '系统蓝'] },
  { id: 'paper', name: '纸间', en: 'PAPER', color: '#95734a', type: '温暖资料室', description: '把留白还给思考，像整理一本不断生长的项目手记。', keywords: ['温润纸色', '舒展排版', '阅读优先'] },
  { id: 'midnight', name: '夜航', en: 'MIDNIGHT', color: '#8b9fff', type: '沉浸指挥台', description: '更集中的信息密度，在安静的深色空间里保持专注。', keywords: ['深色层次', '紧凑列表', '专注阅读'] },
];
const screens = [
  { id: 'projects', label: '项目看板', icon: 'board' },
  { id: 'detail', label: '项目详情', icon: 'layers' },
  { id: 'library', label: '知识库', icon: 'book' },
  { id: 'reader', label: '笔记阅读', icon: 'note' },
];
const glyphs = {
  logo: '<path d="M4 4h10v4H8v8h6v4H4zM18 4h3v16h-3zM11 11h9v3h-9z" fill="currentColor" stroke="none"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M15 4v16M6 8v4M12 8v7M18 8v3"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  book: '<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
  inbox: '<path d="M4 4h16l2 11v5H2v-5zM2 15h6l2 3h4l2-3h6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
  link: '<path d="m10 14 4-4m-6 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
  filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  sort: '<path d="M8 4v16m-4-4 4 4 4-4M15 5h5M15 10h4M15 15h3"/>',
  pin: '<path d="m15 3 6 6-4 1-4 6-5-5 6-4zM8 16l-5 5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M7 15h2M13 15h3"/>',
  flag: '<path d="M5 21V3c5-4 9 4 14 0v11c-5 4-9-4-14 0"/>',
  cloud: '<path d="M6 18a5 5 0 1 1 1-10 6 6 0 0 1 11-1 5.5 5.5 0 0 1 0 11M8 17l4-4 4 4M12 13v9"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 13A8 8 0 0 1 11 3a9 9 0 1 0 9 10Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M10 4v16"/>',
  laptop: '<path d="M5 4h14v12H5zM2 20h20l-3-4H5z"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M16 21h5v-5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18"/>',
  pen: '<path d="m15 4 5 5-11 11H4v-5zM13 6l5 5"/>',
  mountain: '<path d="m2 20 7-12 4 6 3-9 6 15zM6 13l3 2 2-2M14 10l2 1 2-1"/>',
  camera: '<path d="M8 6l2-3h4l2 3h4a2 2 0 0 1 2 2v11H2V8a2 2 0 0 1 2-2z"/><circle cx="12" cy="12" r="4"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${glyphs[name] || glyphs.note}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params = new URLSearchParams(location.search);
const state = {
  theme: themes.some(t => t.id === params.get('theme')) ? params.get('theme') : 'clarity',
  screen: screens.some(s => s.id === params.get('screen')) ? params.get('screen') : 'projects',
  device: params.get('device') === 'phone' ? 'phone' : 'desktop',
  compare: params.get('compare') === '1',
  presentation: params.get('present') === '1',
  projectId: 'p1', noteId: 'n1', category: '全部', filter: 'all', query: '', table: false,
};
const data = seedData();
let dialog = null;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const theme = () => themes.find(t => t.id === state.theme);
const selectedProject = () => data.projects.find(p => p.id === state.projectId) || data.projects[0];
const selectedNote = () => data.notes.find(n => n.id === state.noteId) || data.notes[0];
const pct = p => Math.round(p.tasks.filter(t => t.done).length / Math.max(1, p.tasks.length) * 100);
const notesFor = p => data.notes.filter(n => n.projectIds.includes(p.id));
const date = value => value ? `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}` : '未设日期';
const statusName = p => statuses.find(s => s.id === p.status)?.label;

function labControls() {
  return `<header class="lab-header"><a href="/" class="lab-brand">${icon('logo')}<span>拾序<span class="lab-slash">/</span><strong>版面探索</strong></span></a><a class="lab-back" href="/layouts.html">第二轮 · 四种全新版面 ${icon('arrow')}</a><a class="lab-back" href="/">返回工作区 ${icon('arrow')}</a></header>
  <section class="lab-intro"><div><div class="lab-kicker">APPLE DESIGN EXPLORATIONS · 01—03</div><h1>三种气质，一套个人工作台。</h1><p>从项目推进到知识沉淀，探索更自然的界面与阅读节奏。</p></div><span class="lab-edition">3 个方向<br><strong>12 种版面</strong></span></section>
  <nav class="theme-picker" aria-label="设计方向">${themes.map((t, index) => `<button class="theme-option ${state.theme === t.id ? 'selected' : ''}" data-theme="${t.id}" aria-pressed="${state.theme === t.id}"><span class="theme-swatch ${t.id}"><span></span><span></span><span></span></span><span><small>0${index + 1} / ${t.en}</small><strong>${t.name}<em>${t.type}</em></strong></span>${icon('checkCircle')}</button>`).join('')}</nav>
  <div class="lab-toolbar"><nav class="screen-picker" aria-label="预览版面">${screens.map(s => `<button data-screen="${s.id}" aria-pressed="${state.screen === s.id}" class="${state.screen === s.id ? 'selected' : ''}">${icon(s.icon)}${s.label}</button>`).join('')}</nav><div class="lab-tools"><div class="device-picker" aria-label="预览设备"><button data-device="desktop" class="${state.device === 'desktop' ? 'selected' : ''}" aria-label="桌面预览" aria-pressed="${state.device === 'desktop'}">${icon('laptop')}</button><button data-device="phone" class="${state.device === 'phone' ? 'selected' : ''}" aria-label="手机预览" aria-pressed="${state.device === 'phone'}">${icon('phone')}</button></div><button class="compare-button ${state.compare ? 'selected' : ''}" data-action="compare" aria-pressed="${state.compare}">${icon('grid')}并排比较</button><a class="present-link" href="${previewURL(state.theme)}" target="_blank" rel="noopener" aria-label="单独打开当前设计">${icon('expand')}</a></div></div>`;
}
function previewURL(t) { return `/designs.html?theme=${t}&screen=${state.screen}&present=1${state.device === 'phone' ? '&device=phone' : ''}`; }
function sidebar() {
  const active = ['projects','detail'].includes(state.screen) ? 'projects' : 'library';
  return `<aside class="d-sidebar"><a class="d-brand" href="/">${icon('logo')}<span>拾序</span></a><button class="d-workspace" data-action="about"><span class="d-avatar">我</span><span><strong>我的个人空间</strong><small>个人工作区</small></span>${icon('down')}</button><span class="d-nav-label">工作空间</span><nav>${[['projects','board','我的项目',String(data.projects.length).padStart(2,'0')],['library','book','知识库',String(data.notes.filter(n=>!n.inbox).length).padStart(2,'0')]].map(([s,i,l,c]) => `<button class="d-nav ${active === s ? 'active' : ''}" data-screen="${s}" ${active === s ? 'aria-current="page"' : ''}>${icon(i)}<span>${l}</span><small>${c}</small></button>`).join('')}<button class="d-nav" data-action="capture">${icon('inbox')}<span>收集箱</span><small>01</small></button><button class="d-nav" data-action="search">${icon('search')}<span>搜索</span><kbd>⌘ K</kbd></button></nav><div class="d-side-rule"></div><span class="d-nav-label">常用项目</span>${data.projects.filter(p => p.pinned).map(p => `<button class="d-shortcut" data-project="${p.id}"><span class="color-dot ${p.color}"></span>${p.title}</button>`).join('')}<div class="d-side-bottom"><div class="d-local">${icon('shield')}<span>本地设计预览<small>示例数据，不修改工作区</small></span></div><button class="d-profile" data-action="about"><span class="d-avatar">我</span><span>个人空间</span>${icon('settings')}</button></div></aside>`;
}
function chrome() {
  const s = screens.find(s => s.id === state.screen);
  return `<header class="d-topbar"><div class="d-breadcrumb"><span class="mobile-brand">拾序</span><span class="desktop-crumb">个人空间</span><span class="crumb-divider">/</span><strong>${s.label}</strong></div><div class="d-top-actions"><span class="d-local-status">${icon('checkCircle')}设计预览</span><button data-action="search" class="d-icon" aria-label="搜索示例内容">${icon('search')}</button><button data-action="about" class="d-icon" aria-label="查看预览说明">${icon('cloud')}</button><span class="d-avatar small">我</span></div></header>`;
}
function mobileNav() { return `<nav class="d-mobile-nav" aria-label="预览内导航">${[['projects','board','项目'],['library','book','知识'],['reader','note','阅读']].map(([s,i,l]) => `<button data-screen="${s}" class="${state.screen === s || (s === 'projects' && state.screen === 'detail') ? 'active' : ''}">${icon(i)}${l}</button>`).join('')}<button data-action="capture">${icon('plus')}记录</button></nav>`; }
function pageHeading(title, subtitle, action, label) {
  return `<div class="d-page-heading"><div><span class="d-eyebrow">${state.theme === 'paper' ? 'MY PERSONAL COLLECTION' : state.theme === 'midnight' ? 'PERSONAL WORKSPACE' : '你的个人工作台'}</span><h1>${title}<span class="heading-period">.</span></h1><p>${subtitle}</p></div>${action ? `<button class="d-button primary" data-action="${action}">${icon('plus')}${label}</button>` : ''}</div>`;
}
function projectCard(p) {
  return `<button class="d-project-card ${p.status === 'done' ? 'is-complete' : ''}" data-project="${p.id}" aria-label="查看项目 ${p.title}"><div class="d-card-top"><span class="d-project-icon ${p.color}">${icon(p.icon)}</span>${p.priority === 'high' ? `<span class="d-priority">${icon('flag')}优先</span>` : `<span class="d-card-arrow">${icon('arrow')}</span>`}</div><h3>${p.title}</h3><p data-measure>${p.description}</p><div class="d-card-tags"><span class="d-tag ${p.color}">${p.tag}</span>${state.theme === 'midnight' ? `<span class="d-task-count">${p.tasks.filter(t => t.done).length}/${p.tasks.length} 项</span>` : ''}</div><div class="d-progress-label"><span>${state.theme === 'paper' ? '正在积累的小进展' : '任务进度'}</span><strong>${pct(p)}%</strong></div><div class="d-progress"><span style="width:${pct(p)}%"></span></div><footer><span>${icon('calendar')}${date(p.due)}</span><span>${icon('note')}${notesFor(p).length} 篇笔记</span></footer></button>`;
}
function projectRows(projects) {
  return `<div class="d-project-table" role="table" aria-label="项目列表"><div class="d-table-head" role="row"><span>项目名称</span><span>状态</span><span>任务进度</span><span>关联知识</span></div>${projects.map(p => `<button class="d-table-row" data-project="${p.id}" role="row"><span class="d-title-cell"><span class="d-project-icon ${p.color}">${icon(p.icon)}</span><span><strong>${p.title}</strong><small>${p.tag}</small></span></span><span class="d-status ${p.status}"><i></i>${statusName(p)}</span><span class="d-table-progress"><span class="d-progress"><span style="width:${pct(p)}%"></span></span>${pct(p)}%</span><span class="d-table-notes">${icon('note')}${notesFor(p).length} 篇</span></button>`).join('')}</div>`;
}
function projectsPage() {
  const projects = data.projects.filter(p => state.filter === 'all' || p.status === 'active');
  return `<section class="d-page d-projects">${pageHeading(state.theme === 'paper' ? '项目手记' : '我的项目', state.theme === 'midnight' ? '聚焦下一步，也看见每一步。' : state.theme === 'paper' ? '给正在发生的事，留一份清晰的记录。' : '看见正在推进的事，让每一步都有迹可循。', 'new-project', '新建项目')}
    <div class="d-overview"><div class="d-overview-numbers"><span><strong>${String(data.projects.length).padStart(2,'0')}</strong>全部项目</span><span><strong>${String(data.projects.filter(p=>p.status==='active').length).padStart(2,'0')}</strong>进行中</span><span><strong>${String(data.notes.length).padStart(2,'0')}</strong>沉淀笔记</span></div><button class="d-focus-link" data-project="p1"><span class="d-focus-orb">${icon('layers')}</span><span><small>接着上次的思路</small><strong>个人知识库 2.0</strong></span>${icon('arrow')}</button></div>
    ${state.theme === 'paper' ? '<div class="d-collection-caption"><span>正在生长的计划</span><span>OCTOBER · 2026</span></div>' : ''}
    <div class="d-content-toolbar"><div class="d-segment" aria-label="项目显示方式"><button data-view="board" class="${!state.table ? 'active' : ''}" aria-pressed="${!state.table}">${icon('board')}看板</button><button data-view="table" class="${state.table ? 'active' : ''}" aria-pressed="${state.table}">${icon('table')}列表</button></div><div class="d-toolbar-right"><button class="d-text-button ${state.filter === 'active' ? 'chosen' : ''}" data-action="filter" aria-pressed="${state.filter === 'active'}">${icon('filter')}${state.filter === 'active' ? '仅进行中' : '全部状态'}</button><span class="d-subtle desktop-only">最近更新</span></div></div>
    ${state.table ? projectRows(projects) : `<div class="d-board">${statuses.map(s => `<section class="d-column"><div class="d-column-title"><span class="d-status ${s.id}"><i></i>${s.label}</span><small>${projects.filter(p => p.status === s.id).length}</small><button class="d-icon" data-action="new-project" aria-label="在${s.label}添加项目">${icon('plus')}</button></div>${projects.filter(p => p.status === s.id).map(projectCard).join('')}<button class="d-add-card" data-action="new-project">${icon('plus')}添加项目</button></section>`).join('')}</div>`}
    <p class="d-footnote">${icon('shield')}设计预览中的操作仅在当前页面有效</p></section>`;
}
function noteLink(n) { return `<button class="d-related-note" data-note="${n.id}"><span class="d-file-icon">${icon('note')}</span><span><strong>${n.title}</strong><small>${n.category} · ${n.tags[0] || '笔记'}</small></span>${icon('arrow')}</button>`; }
function detailPage() {
  const p = selectedProject();
  return `<section class="d-page d-detail"><button class="d-back" data-screen="projects">${icon('back')}所有项目</button><div class="d-detail-hero"><span class="d-project-icon ${p.color}">${icon(p.icon)}</span><div><div class="d-detail-kicker"><span class="d-tag ${p.color}">${p.tag}</span><span class="d-status ${p.status}"><i></i>${statusName(p)}</span></div><h1>${p.title}</h1><p>${p.description}</p></div><button class="d-icon d-hero-pin" data-action="pin" aria-label="${p.pinned ? '取消置顶示例项目' : '置顶示例项目'}" aria-pressed="${p.pinned}">${icon('pin')}</button></div>
    <div class="d-detail-layout"><div class="d-detail-primary"><div class="d-section-heading"><h2>${icon('checkCircle')}下一步行动</h2><span>${p.tasks.filter(t => t.done).length} / ${p.tasks.length} 已完成</span></div><div class="d-task-progress"><div class="d-progress"><span style="width:${pct(p)}%"></span></div><strong>${pct(p)}%</strong></div><div class="d-tasks">${p.tasks.map(t => `<label class="d-task ${t.done ? 'completed' : ''}"><input type="checkbox" data-task="${t.id}" ${t.done ? 'checked' : ''}><span class="task-check">${icon('check')}</span><span>${t.title}</span></label>`).join('')}</div><form class="d-add-task" id="design-task-form"><input name="task" aria-label="添加预览任务" placeholder="写下一个具体的下一步…" maxlength="160" required><button aria-label="添加任务" class="d-icon">${icon('plus')}</button></form>
    <div class="d-section-heading"><h2>${icon('book')}与项目一起生长的知识</h2><span>${notesFor(p).length} 篇笔记</span></div><div class="d-related-list">${notesFor(p).map(noteLink).join('') || '<p class="d-muted">还没有关联笔记。</p>'}</div>
    <section class="d-project-journal"><div class="d-section-heading"><h2>进展手记</h2><span>10 月 18 日</span></div><div class="journal-entry"><span class="journal-dot"></span><div><strong>让记录与行动连在一起</strong><p>把零散的笔记关联到正在进行的项目，让知识在需要的时候回到手边。</p><small>今天 · 项目思考</small></div></div></section></div>
    <aside class="d-inspector"><div class="d-inspector-section"><span class="d-inspector-label">项目概览</span><div class="d-inspector-stat"><strong>${pct(p)}<small>%</small></strong><span>任务完成进度</span></div><div class="d-progress"><span style="width:${pct(p)}%"></span></div><dl><div><dt>${icon('calendar')}截止日期</dt><dd>${p.due ? `${p.due.slice(0,4)} 年 ${date(p.due).replace('/', ' 月 ')} 日` : '未设置'}</dd></div><div><dt>${icon('flag')}优先级</dt><dd>${{high:'高优先级',medium:'中优先级',low:'低优先级'}[p.priority]}</dd></div><div><dt>${icon('note')}关联笔记</dt><dd>${notesFor(p).length} 篇</dd></div></dl></div><div class="d-inspector-tip">${icon('link')}<h3>经验可以复用</h3><p>项目结束后，笔记会继续留在知识库，为下一个想法提供线索。</p><button class="d-text-button" data-screen="library">前往知识库 ${icon('arrow')}</button></div></aside></div></section>`;
}
function libraryCard(n, index) {
  return `<button class="d-library-card" data-note="${n.id}"><div class="d-note-art art-${index % 4}"><span class="note-art-page"></span><span class="note-art-line"></span><span class="note-art-orbit"></span>${icon(n.category === '技术实践' ? 'code' : n.category === '阅读与思考' ? 'book' : 'note')}</div><div class="d-library-card-text"><span class="d-note-category">${n.category}</span><h3>${n.title}</h3><p data-measure>${n.summary}</p><footer><span>${n.projectIds.length} 个关联项目</span>${icon('arrow')}</footer></div></button>`;
}
function libraryPage() {
  const notes = data.notes.filter(n => !n.inbox && (state.category === '全部' || n.category === state.category));
  return `<section class="d-page d-library">${pageHeading(state.theme === 'paper' ? '我的资料室' : '知识库', state.theme === 'paper' ? '读过的、想过的、做过的，都有归处。' : '不止收藏，更是下一次行动的起点。', 'capture', '记一篇笔记')}
    <div class="d-library-intro"><div><span class="d-eyebrow">持续积累</span><h2>${state.theme === 'midnight' ? '想法之间，自有连接。' : '知识在使用中，慢慢生长。'}</h2><p>${data.notes.filter(n=>!n.inbox).length} 篇笔记 · ${new Set(data.notes.filter(n=>!n.inbox).map(n=>n.category)).size} 个分类 · 来自你正在做的事</p></div><span class="d-library-emblem">${icon('book')}<i></i><i></i></span></div>
    <div class="d-content-toolbar library-toolbar"><div class="d-categories" aria-label="知识分类">${['全部','产品与设计','技术实践','阅读与思考','生活记录'].map(c => `<button class="${state.category === c ? 'active' : ''}" data-category="${c}" aria-pressed="${state.category === c}">${c}</button>`).join('')}</div><button class="d-icon" data-action="search" aria-label="在示例知识中搜索">${icon('search')}</button></div>
    ${state.theme === 'midnight' ? `<div class="d-note-list"><div class="d-note-list-heading"><span>笔记名称</span><span>分类</span><span>关联项目</span><span>更新</span></div>${notes.map(n => `<button class="d-note-list-row" data-note="${n.id}"><span class="d-note-row-title"><span class="d-file-icon">${icon('note')}</span><span><strong>${n.title}</strong><small>${n.summary}</small></span></span><span class="d-tag">${n.category}</span><span class="d-muted">${n.projectIds.length} 个项目</span><span class="d-muted">10/18</span></button>`).join('')}</div>` : `<div class="d-library-grid">${notes.map(libraryCard).join('')}</div>`}
    <p class="d-footnote">${icon('link')}同一篇笔记可以关联多个项目，无需重复保存。</p></section>`;
}
function bodyMarkup(n) {
  let inList = false, headingIndex = 0;
  const out = [];
  for (const line of n.body.split('\n').slice(1)) {
    if (line.startsWith('- ')) { if (!inList) out.push('<ul>'); inList = true; out.push(`<li>${esc(line.slice(2))}</li>`); continue; }
    if (inList) { out.push('</ul>'); inList = false; }
    if (line.startsWith('## ')) out.push(`<h2 id="reading-section-${headingIndex++}">${esc(line.slice(3))}</h2>`);
    else if (line.startsWith('> ')) out.push(`<blockquote>${esc(line.slice(2))}</blockquote>`);
    else if (line.trim()) out.push(`<p>${esc(line)}</p>`);
  }
  if (inList) out.push('</ul>');
  return out.join('');
}
function readerPage() {
  const n = selectedNote(), headings = n.body.split('\n').filter(s => s.startsWith('## ')).map(s => s.slice(3));
  return `<section class="d-reader"><div class="d-reader-tools"><button class="d-back" data-screen="library">${icon('back')}知识库</button><span class="d-reader-mode">阅读模式</span><button class="d-icon ${document.body.classList.contains('reading-focus') ? 'chosen' : ''}" data-action="reading-focus" aria-label="切换专注阅读" aria-pressed="${document.body.classList.contains('reading-focus')}">${icon('expand')}</button></div><div class="d-reading-layout"><aside class="d-reading-outline"><span class="d-inspector-label">这篇笔记</span><strong>${n.title}</strong><div class="outline-rule"></div>${headings.map((h, i) => `<button data-heading="reading-section-${i}" class="${i === 0 ? 'active' : ''}"><span>0${i+1}</span>${esc(h)}</button>`).join('')}<div class="d-reading-meta">${icon('note')}约 2 分钟阅读<br><span>更新于 2026 年 10 月 18 日</span></div></aside><article class="d-reading-paper"><header><div class="d-reading-kicker">${icon('book')}${n.category}<span>·</span>个人笔记</div><h1>${n.title}</h1><p class="d-reading-deck">${n.summary}</p><div class="d-reading-byline"><span class="d-avatar small">我</span><span>我的知识库</span><span>2026.10.18</span></div></header><div class="d-prose">${bodyMarkup(n)}</div><footer class="d-reading-footer"><div class="d-reader-tags">${n.tags.map(t => `<span class="d-tag"># ${t}</span>`).join('')}</div><div class="d-reading-connections"><span>来自这些项目</span>${n.projectIds.map(id => { const p = data.projects.find(p => p.id === id); return p ? `<button data-project="${id}">${icon(p.icon)}${p.title}${icon('arrow')}</button>` : ''; }).join('')}</div><p>把一个想法写清楚，也是向前走了一小步。</p></footer></article></div></section>`;
}
function productMarkup() {
  return `<div class="product-surface" data-theme="${state.theme}" data-screen="${state.screen}"><div class="d-workspace-grid">${sidebar()}<div class="d-main">${chrome()}<main id="design-main">${({projects:projectsPage,detail:detailPage,library:libraryPage,reader:readerPage}[state.screen])()}</main>${mobileNav()}</div></div></div>`;
}
function comparison() {
  return `<div class="comparison-grid">${themes.map((t, i) => `<section class="comparison-item"><div class="comparison-caption"><span><small>0${i+1}</small>${t.name}</span><span>${t.type}</span><button data-theme="${t.id}" data-exit-compare="1">放大 ${icon('expand')}</button></div><div class="comparison-frame"><iframe title="${t.name}：${screens.find(s=>s.id===state.screen).label}" src="${previewURL(t.id)}" loading="eager"></iframe></div></section>`).join('')}</div>`;
}
let resizeObserver, textObserver;
const textCache = new WeakMap();
function measure(el) {
  if (!el.clientWidth) return;
  try {
    const style = getComputedStyle(el), text = el.textContent, font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    let prepared = textCache.get(el);
    if (!prepared || prepared.text !== text || prepared.font !== font) { prepared = { text, font, value: prepare(text,font) }; textCache.set(el, prepared); }
    el.style.minHeight = `${layout(prepared.value,el.clientWidth,parseFloat(style.lineHeight)).height}px`;
  } catch { /* Text still flows with normal CSS. */ }
}
function wireMeasurements() {
  textObserver?.disconnect(); textObserver = new ResizeObserver(entries => entries.forEach(e => measure(e.target)));
  $$('[data-measure]').forEach(el => { measure(el); textObserver.observe(el); });
  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(entries => entries.forEach(({target}) => { const frame=target.querySelector('iframe'); const width = state.device === 'phone' ? 390 : 1280; const height = state.device === 'phone' ? 844 : 1000; const scale=target.clientWidth/width; frame.style.width=`${width}px`; frame.style.height=`${height}px`; frame.style.transform=`scale(${scale})`; target.style.height=`${height*scale}px`; }));
  $$('.comparison-frame').forEach(el => resizeObserver.observe(el));
}
function writeURL() {
  const query = new URLSearchParams({theme:state.theme,screen:state.screen});
  if (state.device === 'phone') query.set('device','phone');
  if (state.compare) query.set('compare','1');
  if (state.presentation) query.set('present','1');
  history.replaceState(null,'',`${location.pathname}?${query}`);
}
let renderedScreen = null;
function render() {
  const scroll = renderedScreen === state.screen ? $('#design-main')?.scrollTop || 0 : 0;
  const savedFocus = document.activeElement?.getAttribute('data-action');
  document.body.classList.toggle('presentation',state.presentation);
  document.body.classList.toggle('phone-presentation',state.presentation && state.device === 'phone');
  document.title = `拾序 · ${theme().name} · ${screens.find(s => s.id === state.screen).label}`;
  $('#design-lab').innerHTML = state.presentation ? `<div class="presentation-wrap">${productMarkup()}</div>` : `<div class="lab-container">${labControls()}<section class="design-stage ${state.device === 'phone' ? 'phone-stage' : ''}" aria-label="${theme().name}设计预览">${state.compare ? comparison() : `<div class="showcase">${productMarkup()}</div>`}</section><footer class="lab-footer"><div><span class="theme-dot" style="background:${theme().color}"></span><strong>${theme().name}</strong><span>${theme().description}</span></div><p>独立设计预览 · 使用示例数据 · 不修改现有工作区</p></footer></div>`;
  if (dialog) $('#design-lab').insertAdjacentHTML('beforeend', dialogMarkup());
  $('.lab-container,.presentation-wrap').inert = Boolean(dialog);
  document.body.style.overflow = dialog ? 'hidden' : '';
  if ($('#design-main')) $('#design-main').scrollTop=scroll;
  renderedScreen=state.screen;
  writeURL();
  requestAnimationFrame(wireMeasurements);
  if (savedFocus) $(`[data-action="${savedFocus}"]`)?.focus({preventScroll:true});
}
function announce(text) { const el=$('#design-message'); el.textContent=text; el.classList.add('show'); clearTimeout(announce.timer); announce.timer=setTimeout(()=>el.classList.remove('show'),2400); }
function dialogMarkup() {
  const capture=dialog==='capture', search=dialog==='search', project=dialog==='new-project';
  return `<div class="design-dialog-backdrop" data-dialog-theme="${state.theme}"><section class="design-dialog" role="dialog" aria-modal="true" aria-labelledby="design-dialog-title"><header><h2 id="design-dialog-title">${capture?'接住一个想法':search?'搜索示例内容':project?'一个新项目':'关于这组设计'}</h2><button data-action="close-dialog" aria-label="关闭设计弹窗">${icon('close')}</button></header>${search?`<input id="design-search" type="search" aria-label="搜索示例项目与笔记" placeholder="搜索项目或笔记…"><div id="design-search-results">${searchResults('')}</div>`:capture?`<form id="design-capture-form"><label>写下此刻的想法<textarea name="body" rows="5" maxlength="2000" required placeholder="不用急着整理，先写下来。"></textarea></label><p>内容仅保留在本次设计预览中，不写入工作区。</p><button class="dialog-save">记录想法</button></form>`:project?`<form id="design-project-form"><label>项目名称<input name="title" maxlength="100" required placeholder="给正在做的事情起个名字"></label><p>用于体验版面，刷新后恢复示例数据。</p><button class="dialog-save">添加示例项目</button></form>`:`<p class="about-text">${theme().name} · ${theme().type}<br><br>这里有项目看板、项目详情、知识库和阅读页四种版面，可以点击卡片浏览、完成示例任务或切换专注阅读。<br><br>所有操作只在这组设计预览中生效，不修改工作区数据。账号与云同步尚未接入。</p>`}</section></div>`;
}
function searchResults(q) {
  const query=q.trim().toLowerCase();
  return [...data.projects.filter(p=>p.title.toLowerCase().includes(query)).map(p=>`<button data-project="${p.id}">${icon(p.icon)}<span>${p.title}<small>项目</small></span>${icon('arrow')}</button>`),...data.notes.filter(n=>`${n.title} ${n.body}`.toLowerCase().includes(query)).map(n=>`<button data-note="${n.id}">${icon('note')}<span>${n.title}<small>笔记</small></span>${icon('arrow')}</button>`)].slice(0,7).join('')||'<p class="about-text">没有匹配的内容，换个关键词试试。</p>';
}
function showDialog(type) { dialog=type; render(); ($('.design-dialog input,.design-dialog textarea')||$('.design-dialog header button'))?.focus(); }
function closeDialog() { dialog=null;render(); }
function switchScreen(screen) { state.screen=screen; dialog=null; document.body.classList.remove('reading-focus');render(); }
document.addEventListener('click',e=>{
  const button=e.target.closest('button'); if(!button)return;
  if(button.dataset.theme){state.theme=button.dataset.theme;if(button.dataset.exitCompare)state.compare=false;render();return;}
  if(button.dataset.device){state.device=button.dataset.device;render();return;}
  if(button.dataset.screen){switchScreen(button.dataset.screen);return;}
  if(button.dataset.project){state.projectId=button.dataset.project;switchScreen('detail');return;}
  if(button.dataset.note){state.noteId=button.dataset.note;switchScreen('reader');return;}
  if(button.dataset.category){state.category=button.dataset.category;render();return;}
  if(button.dataset.view){state.table=button.dataset.view==='table';render();return;}
  if(button.dataset.heading){document.getElementById(button.dataset.heading)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});return;}
  switch(button.dataset.action){
    case 'compare':state.compare=!state.compare;render();break;
    case 'filter':state.filter=state.filter==='all'?'active':'all';render();break;
    case 'pin':selectedProject().pinned=!selectedProject().pinned;render();break;
    case 'reading-focus':document.body.classList.toggle('reading-focus');render();break;
    case 'search':showDialog('search');break;
    case 'capture':showDialog('capture');break;
    case 'new-project':showDialog('new-project');break;
    case 'about':showDialog('about');break;
    case 'close-dialog':closeDialog();break;
  }
});
document.addEventListener('change',e=>{if(e.target.dataset.task){const p=selectedProject(),id=e.target.dataset.task,task=p.tasks.find(t=>t.id===id);if(task){task.done=e.target.checked;const scroll=window.scrollY;render();window.scrollTo(0,scroll);$(`[data-task="${id}"]`)?.focus({preventScroll:true});}}});
document.addEventListener('input',e=>{if(e.target.id==='design-search')$('#design-search-results').innerHTML=searchResults(e.target.value);});
document.addEventListener('submit',e=>{
  e.preventDefault(); const values=new FormData(e.target);
  if(e.target.id==='design-task-form'){const title=String(values.get('task')||'').trim();if(!title)return;selectedProject().tasks.push({id:crypto.randomUUID(),title,done:false});render();announce('已添加预览任务');}
  if(e.target.id==='design-capture-form'){const body=String(values.get('body')||'').trim();if(!body)return;data.notes.push({id:crypto.randomUUID(),title:body.slice(0,24),summary:body.slice(0,90),body:`# ${body.slice(0,24)}\n\n${body}`,category:'生活记录',tags:['预览记录'],projectIds:[],inbox:false,updatedAt:new Date().toISOString()});dialog=null;state.screen='library';state.category='全部';render();announce('已留在本次预览中，工作区未修改');}
  if(e.target.id==='design-project-form'){const title=String(values.get('title')||'').trim();if(!title)return;const p={...data.projects[0],id:crypto.randomUUID(),title,description:'一个新的想法，正在从这里开始。',status:'planned',priority:'medium',pinned:false,tasks:[],tag:'新计划'};data.projects.unshift(p);dialog=null;state.screen='projects';state.filter='all';render();announce('已添加示例项目');}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&dialog){closeDialog();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showDialog('search');return;}
  if(e.key==='Tab'&&dialog){const nodes=$$('.design-dialog button,.design-dialog input,.design-dialog textarea').filter(n=>n.getClientRects().length);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}
});
setLocale('zh-CN'); render(); document.fonts.ready.then(wireMeasurements);

import { taskStatus, taskGroups, renderTaskAdd, renderModuleName, showModuleHeading } from './project-tasks.js';

const phaseLabels = { planned: '待开始', active: '进行中', review: '待回顾', done: '已完成' };
const routeColors = ['#2a7769', '#ac6439', '#726a9e', '#557998', '#a8792c', '#8e6581', '#58846b', '#727c88'];

function filters(state) {
  return `<nav class="mr-filters" aria-label="筛选项目">${[['all', '全部项目'], ['active', '未完成'], ['done', '已完成']].map(([key, title]) => `<button type="button" data-filter="${key}" aria-pressed="${state.filter === key}" class="${state.filter === key ? 'is-active' : ''}">${title}</button>`).join('')}</nav>`;
}

function statusSelect(project, esc) {
  return `<select class="mr-status mr-status-${esc(project.status)}" data-status="${esc(project.id)}" aria-label="${esc(project.title)}的状态">${Object.entries(phaseLabels).map(([key, title]) => `<option value="${key}" ${project.status === key ? 'selected' : ''}>${title}</option>`).join('')}</select>`;
}

export function renderMatrix(ctx) {
  const { data, state, esc, icon, pct, date, taskRow, captureForm, recordList } = ctx;
  const projects = data.projects;
  const allTasks = data.projects.flatMap(project => project.tasks);
  const complete = allTasks.filter(task => task.done).length;
  return `<section class="view-matrix" aria-label="清单总控版面">
    <header class="mr-matrix-heading">
      <div><span class="mr-kicker">MATRIX / 一张表，掌握全局</span><h1>把事情，逐项推进。</h1><p>状态直接改，任务随手勾。所有项目都有一行自己的位置。</p></div>
      <div class="mr-matrix-score"><strong>${complete}<span> / ${allTasks.length}</span></strong><span>任务已完成</span></div>
    </header>
    <div class="mr-matrix-capture">
      <div class="mr-capture-title">${icon('plus')}<span><strong>快速记一笔</strong><small>想法或待办，都从这里开始</small></span></div>
      ${captureForm({ id: 'matrix-capture', compact: true, placeholder: '记录一条想法，或写下接下来要做的事…', label: '快速记录' })}
    </div>
    <div class="mr-ledger-toolbar">${filters(state)}<span class="mr-result-count">${projects.length} 个项目 <i></i> ${data.notes.length} 条记录</span></div>
    <div class="mr-ledger-wrap">
      <table class="mr-ledger"><caption class="mr-sr-only">项目状态与任务进度表；展开任务可逐项完成</caption>
        <thead><tr><th scope="col" class="mr-col-index">#</th><th scope="col">项目 / 任务</th><th scope="col">状态</th><th scope="col">完成进度</th><th scope="col">下一步</th><th scope="col">目标日期</th></tr></thead>
        <tbody>${projects.map((project, index) => {
          const next = project.tasks.find(task => !task.done);
          const done = project.tasks.filter(task => task.done).length;
          return `<tr class="mr-ledger-project">
            <td class="mr-project-index">${String(index + 1).padStart(2, '0')}</td>
            <td class="mr-project-cell"><button type="button" data-project="${esc(project.id)}" class="mr-project-name">${esc(project.title)}${icon('arrow')}</button><span class="mr-project-tag">${esc(project.tag)}</span></td>
            <td class="mr-status-cell"><span class="mr-mobile-label">状态</span>${statusSelect(project, esc)}</td>
            <td class="mr-progress-cell"><div class="mr-progress-values"><strong>${pct(project)}<small>%</small></strong><span>${done}/${project.tasks.length} 项</span></div><div class="mr-meter" role="progressbar" aria-label="${esc(project.title)}任务完成进度" aria-valuenow="${pct(project)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct(project)}%"></span></div></td>
            <td class="mr-next-cell">${next ? taskRow(project, next) : `<span class="mr-all-done">${icon('check')}所有任务已完成</span>`}</td>
            <td class="mr-date-cell"><span class="mr-mobile-label">目标</span>${esc(date(project.due))}</td>
          </tr><tr class="mr-ledger-detail"><td colspan="6"><details class="mr-task-details" data-project-details="${esc(project.id)}"><summary>${icon('chevron')}<span>展开任务</span><small>${project.tasks.length} 项</small></summary><div class="mr-expanded-tasks"><div class="mr-task-grid">${project.tasks.map(task => taskRow(project, task)).join('') || '<p class="mr-empty">还没有任务，写下第一步吧。</p>'}</div>${captureForm({ id: `matrix-${project.id}`, projectId: project.id, compact: true, placeholder: '为这个项目补充任务或记录…', label: `记录到${project.title}` })}</div></details></td></tr>`;
        }).join('') || '<tr><td colspan="6" class="mr-empty">没有符合条件的项目。试试其他筛选条件。</td></tr>'}</tbody>
      </table>
    </div>
    <footer class="mr-matrix-footer"><span>${icon('check')}勾选即更新进度</span><span>项目状态可独立调整，保留你的工作节奏</span></footer>
    <section class="mr-matrix-recent"><h2>最近记录</h2>${recordList(data.notes, 3)}</section>
  </section>`;
}

export function renderRoute(ctx) {
  const { data, state, esc, icon, pct, date, captureForm, recordList, compact = false } = ctx;
  const projects = data.projects;
  const selected = projects.find(project => project.id === state.selectedProject) || projects[0];
  const selectedIndex = selected ? data.projects.indexOf(selected) : 0;
  const selectedNotes = selected ? data.notes.filter(note => note.projectIds.includes(selected.id)) : [];
  const completedTasks = data.projects.flatMap(project => project.tasks).filter(task => task.done).length;
  return `<section class="view-route" aria-label="路线图版面">
    ${compact ? '' : `<header class="mr-route-heading"><div><span class="mr-kicker">ROUTE MAP / 让进展看得见</span><h1>下一站，<em>完成。</em></h1><p>每个项目一条线，每个任务一站。勾亮一站，就向前一步。</p></div><div class="mr-route-total"><strong>${completedTasks}</strong><span>个任务已抵达</span><div class="mr-route-mini-track"><i></i><i></i><i></i><i></i></div></div></header>`}
    <div class="mr-route-toolbar">${filters(state)}${compact ? '' : '<div class="mr-route-key"><span><i class="is-done"></i>已完成</span><span><i></i>待完成</span><small>按任务顺序排列 · 非时间轴</small></div>'}</div>
    <div class="mr-route-workspace"><div class="mr-route-lines">
      ${projects.map(project => {
        const index = data.projects.indexOf(project);
        const color = routeColors[index % routeColors.length];
        const groups = compact ? taskGroups(project, true) : [{ id: '', name: '', tasks: project.tasks }];
        const grouped = compact && Boolean(project.modules?.length);
        return `<article ${compact ? `data-home-project="${esc(project.id)}"` : ''} class="mr-route-line ${selected?.id === project.id ? 'is-selected' : ''}" style="--route-color:${color}" aria-label="${esc(project.title)}任务路线">
          <header class="mr-line-heading">${compact ? `<button type="button" class="record-drag-handle home-record-handle" data-record-drag="record" data-order-id="${esc(project.id)}" data-order-section="projects" data-order-surface="home" data-drag-label="${esc(project.title)}" aria-label="拖动项目：${esc(project.title)}" title="拖动项目排序；Alt + 上下方向键排序"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6 4h.01M12 4h.01M6 9h.01M12 9h.01M6 14h.01M12 14h.01" stroke-width="3"/></svg></button>` : ''}<button class="mr-line-select" type="button" data-select-project="${esc(project.id)}" aria-pressed="${selected?.id === project.id}"><span class="mr-line-number">${String(index + 1).padStart(2, '0')}</span><span><strong>${esc(project.title)}</strong>${compact ? '' : `<small>${esc(phaseLabels[project.status])} <i>·</i> ${project.tasks.filter(task => task.done).length}/${project.tasks.length} 站完成</small>`}</span></button>${compact ? '' : `<span class="mr-line-percent">${pct(project)}<small>%</small></span>`}</header>
          <div class="mr-module-routes">${groups.map(group => {
            const next = group.tasks.find(task => !task.done);
            return `<section class="mr-module-route" data-route-module="${esc(group.id)}" ${compact ? `data-task-zone data-project-id="${esc(project.id)}" data-module-id="${esc(group.id)}" data-task-view="route" aria-label="${esc(group.name)}模块线路"` : ''}>
              ${compact && showModuleHeading(project, group, groups) ? `<header class="mr-module-heading">${renderModuleName(project, group, { esc, icon })}<span>${group.tasks.filter(task => task.done).length}/${group.tasks.length} 站完成</span></header>` : ''}
              <div class="mr-stations-scroll" tabindex="0" aria-label="${esc(project.title)}${grouped ? ` · ${esc(group.name)}` : ''}任务，可横向滚动"><div class="mr-stations">${group.tasks.map((task, taskIndex) => `<label ${compact ? `data-route-task="${esc(task.id)}" data-route-project="${esc(project.id)}" title="拖动圆点调整顺序或移至其他模块；Alt + 左右排序，上下切换模块"` : ''} class="mr-station ${taskStatus(task) === 'active' ? 'is-active' : ''} ${task.done ? 'is-done' : ''} ${task.id === next?.id ? 'is-next' : ''}"><input type="checkbox" data-task="${esc(task.id)}" data-project-id="${esc(project.id)}" ${task.done ? 'checked' : ''} aria-label="${esc(task.title)}"><span class="mr-station-dot">${task.done ? icon('check') : `<span>${taskIndex + 1}</span>`}</span><span class="mr-station-title">${esc(task.title)}</span>${compact ? '' : `<span class="mr-station-hint">${task.done ? '已完成' : task.id === next?.id ? '下一站' : '待完成'}</span>`}</label>`).join('') || `<p class="mr-empty">${grouped ? '此模块暂无事项，拖入事项或在下方添加。' : '路线还没有站点，在下方添加第一项事项。'}</p>`}</div></div>
              ${compact ? renderTaskAdd(project, group, { esc, icon, scope: 'route' }) : ''}
            </section>`;
          }).join('')}</div>
        </article>`;
      }).join('') || '<div class="mr-empty">没有符合条件的项目。试试其他筛选条件。</div>'}
      ${compact ? '' : `<p class="mr-route-caption">${icon('route')}点击站点完成任务；点击线路名称，切换右侧记录项目。</p>`}
    </div>
    <aside class="mr-route-dock" ${selected ? 'data-has-project' : ''} ${selected ? `style="--route-color:${routeColors[selectedIndex % routeColors.length]}"` : ''}>
      ${selected ? `${compact ? '' : `<div class="mr-dock-label"><span class="mr-dock-dot"></span>当前线路 <span>${String(selectedIndex + 1).padStart(2, '0')}</span></div>`}<button class="mr-dock-title" type="button" data-project="${esc(selected.id)}">${esc(selected.title)}${icon('arrow')}</button>${compact ? '' : `<p class="mr-dock-description">${esc(selected.description)}</p><div class="mr-dock-meta"><span aria-label="目标日期：${esc(date(selected.due))}" title="目标日期">${esc(date(selected.due))}<small>目标日期</small></span><span aria-label="任务进度：${pct(selected)}%" title="任务进度">${pct(selected)}%<small>任务进度</small></span></div>`}<div class="mr-dock-divider"></div>${compact ? '' : `<h2>${icon('plus')}在这条线上，记一笔</h2>`}${captureForm({ id: 'route-capture', projectId: selected.id, placeholder: '下一步做什么？或记下此刻的想法…', label: '线路记录' })}<div class="mr-dock-notes"><div class="mr-dock-notes-heading"><h2>${compact ? '关联笔记' : '随行笔记'}</h2><span>${selectedNotes.length}</span></div>${recordList(selectedNotes, 4)}</div>` : `<h2>${compact ? '快速记录' : '先把想法记下来'}</h2>${captureForm({ id: 'route-capture', placeholder: '记录一条想法…', label: '快速记录' })}`}
    </aside></div>
  </section>`;
}

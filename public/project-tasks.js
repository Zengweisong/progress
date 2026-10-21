import { renderSelect } from './select-control.js';

export const taskStates = { todo: '待办', active: '进行中', done: '已完成' };

// Older workspaces only stored completion. Keep those records readable as-is.
export const taskStatus = task => task.done ? 'done' : task.status === 'active' ? 'active' : 'todo';
export function setTaskStatus(task, status) {
  if (!Object.hasOwn(taskStates, status)) return;
  task.status = status;
  task.done = status === 'done';
}

export const ungroupedName = project => project.ungroupedName || '默认模块';
export const showModuleHeading = (project, module, groups) => groups.length > 1 || Boolean(module.id || project.ungroupedName);

export function removeModule(project, moduleId) {
  if (moduleId) {
    project.modules = (project.modules || []).filter(module => module.id !== moduleId);
    project.tasks.forEach(task => { if (task.moduleId === moduleId) task.moduleId = ''; });
  } else {
    const target = project.modules?.[0]?.id || '';
    const ids = new Set((project.modules || []).map(module => module.id));
    project.tasks.forEach(task => { if (!ids.has(task.moduleId)) task.moduleId = target; });
    delete project.ungroupedName;
    project.ungroupedHidden = true;
  }
}

export function moduleOptions(project) {
  return taskGroups(project, true).map(module => [module.id, module.name]);
}

export function taskGroups(project, includeUngrouped = false) {
  const modules = project.modules || [];
  const ids = new Set(modules.map(module => module.id));
  const tasks = project.tasks.filter(task => !task.archived);
  const ungrouped = tasks.filter(task => !ids.has(task.moduleId));
  const groups = modules.map(module => ({ ...module, tasks: tasks.filter(task => task.moduleId === module.id) }));
  if (ungrouped.length || !modules.length || (includeUngrouped && !project.ungroupedHidden)) groups.unshift({ id: '', name: ungroupedName(project), tasks: ungrouped });
  return groups;
}

export function renderTaskAdd(project, module, { esc, icon, scope }) {
  return `<form class="module-task-add ${scope === 'route' ? 'route-task-add' : ''}" data-task-add data-project-id="${esc(project.id)}" data-module-id="${esc(module.id)}"><input id="add-task-${scope}-${esc(project.id)}-${esc(module.id || 'ungrouped')}" name="title" maxlength="500" placeholder="${scope === 'route' ? '添加事项，回车保存' : '添加任务'}" aria-label="在${esc(module.name)}中添加任务" required autocomplete="off"><button type="submit" aria-label="添加到${esc(module.name)}">${icon('plus')}</button></form>`;
}

export function renderModuleName(project, module, { esc, icon }) {
  return `<button type="button" data-action="edit-module" data-project-id="${esc(project.id)}" data-id="${esc(module.id)}" aria-label="${module.id ? '编辑' : '重命名'}模块：${esc(module.name)}" title="重命名模块">${esc(module.name)}${icon('pen')}</button>`;
}

export function renderProjectTasks(project, { esc, icon, scope = 'route' }) {
  const groups = taskGroups(project, true);
  return `<div class="project-modules" data-project-id="${esc(project.id)}">
    <div class="module-toolbar"><button type="button" class="button small subtle" data-action="archive-completed-tasks" data-project-id="${esc(project.id)}" ${project.tasks.some(task => task.done && !task.archived) ? '' : 'disabled'}>归档已完成事项</button><button type="button" class="button small subtle" data-action="task-archives" data-project-id="${esc(project.id)}">已归档事项 ${project.tasks.filter(task => task.archived).length}</button>${groups.length === 1 && !groups[0].id && !project.ungroupedName ? `<button type="button" class="button small subtle" data-action="edit-module" data-project-id="${esc(project.id)}" data-id="" aria-label="编辑默认线路">${icon('pen')}编辑线路</button>` : ''}<button type="button" class="button small subtle" data-action="new-module" data-project-id="${esc(project.id)}">${icon('plus')}新建模块</button></div>
    <div class="module-grid">${groups.map(module => `<section class="task-module" data-module-id="${esc(module.id)}" data-task-zone data-project-id="${esc(project.id)}" data-task-view="detail" aria-label="${esc(module.name)}模块">
      ${showModuleHeading(project, module, groups) ? `<header class="module-heading">${renderModuleName(project, module, { esc, icon })}<span>${module.tasks.filter(task => task.done).length}/${module.tasks.length}</span></header>` : ''}
      <div class="module-tasks">${module.tasks.map(task => `<div class="module-task is-${taskStatus(task)}" data-task-row="${esc(task.id)}">
        <button type="button" class="module-task-drag" id="drag-task-${scope}-${esc(project.id)}-${esc(task.id)}" data-task-drag-handle="${esc(task.id)}" data-project-id="${esc(project.id)}" aria-label="拖动任务：${esc(task.title)}" title="拖动到其他模块；Alt + 左右方向键切换模块，上下方向键排序"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6 4h.01M12 4h.01M6 9h.01M12 9h.01M6 14h.01M12 14h.01" stroke-width="3"/></svg></button>
        <label class="module-task-check"><input type="checkbox" data-task="${esc(task.id)}" data-project-id="${esc(project.id)}" ${task.done ? 'checked' : ''} aria-label="${esc(task.title)}"><span aria-hidden="true">${task.done ? icon('check') : ''}</span></label>
        <button type="button" class="module-task-title" data-action="edit-task" data-project-id="${esc(project.id)}" data-id="${esc(task.id)}" aria-label="编辑任务：${esc(task.title)}">${esc(task.title)}</button>
        ${renderSelect({ esc, options: Object.entries(taskStates), value: taskStatus(task), kind: 'task', className: 'module-task-status', attributes: `data-task-status="${esc(task.id)}" data-project-id="${esc(project.id)}" aria-label="${esc(task.title)}的任务状态"` })}
      </div>`).join('')}</div>
      ${renderTaskAdd(project, module, { esc, icon, scope })}
    </section>`).join('')}</div>
  </div>`;
}

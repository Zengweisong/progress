export const taskStates = { todo: '待办', active: '进行中', done: '已完成' };

// Older workspaces only stored completion. Keep those records readable as-is.
export const taskStatus = task => task.done ? 'done' : task.status === 'active' ? 'active' : 'todo';
export function setTaskStatus(task, status) {
  if (!Object.hasOwn(taskStates, status)) return;
  task.status = status;
  task.done = status === 'done';
}

export function moduleOptions(project) {
  return [['', '未分组'], ...(project.modules || []).map(module => [module.id, module.name])];
}

export function renderProjectTasks(project, { esc, icon, scope = 'route' }) {
  const modules = project.modules || [];
  const ungrouped = project.tasks.filter(task => !modules.some(module => module.id === task.moduleId));
  const groups = [...modules.map(module => ({ ...module, tasks: project.tasks.filter(task => task.moduleId === module.id) }))];
  if (ungrouped.length || !modules.length) groups.unshift({ id: '', name: '未分组', tasks: ungrouped });
  return `<div class="project-modules" data-project-id="${esc(project.id)}">
    <div class="module-toolbar"><button type="button" class="button small subtle" data-action="new-module" data-project-id="${esc(project.id)}">${icon('plus')}新建模块</button></div>
    <div class="module-grid">${groups.map(module => `<section class="task-module" data-module-id="${esc(module.id)}" aria-label="${esc(module.name)}模块">
      <header class="module-heading">${module.id ? `<button type="button" data-action="edit-module" data-project-id="${esc(project.id)}" data-id="${esc(module.id)}" aria-label="编辑模块：${esc(module.name)}">${esc(module.name)}${icon('pen')}</button>` : '<strong>未分组</strong>'}<span>${module.tasks.filter(task => task.done).length}/${module.tasks.length}</span></header>
      <div class="module-tasks">${module.tasks.map(task => `<div class="module-task is-${taskStatus(task)}" data-task-row="${esc(task.id)}">
        <label class="module-task-check"><input type="checkbox" data-task="${esc(task.id)}" data-project-id="${esc(project.id)}" ${task.done ? 'checked' : ''} aria-label="${esc(task.title)}"><span aria-hidden="true">${task.done ? icon('check') : ''}</span></label>
        <button type="button" class="module-task-title" data-action="edit-task" data-project-id="${esc(project.id)}" data-id="${esc(task.id)}" aria-label="编辑任务：${esc(task.title)}">${esc(task.title)}</button>
        <select class="module-task-status" data-task-status="${esc(task.id)}" data-project-id="${esc(project.id)}" aria-label="${esc(task.title)}的任务状态">${Object.entries(taskStates).map(([value, label]) => `<option value="${value}" ${taskStatus(task) === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
      </div>`).join('')}</div>
      <form class="module-task-add" data-task-add data-project-id="${esc(project.id)}" data-module-id="${esc(module.id)}"><input id="add-task-${scope}-${esc(project.id)}-${esc(module.id || 'ungrouped')}" name="title" maxlength="500" placeholder="添加任务" aria-label="在${esc(module.name)}中添加任务" required autocomplete="off"><button type="submit" aria-label="添加到${esc(module.name)}">${icon('plus')}</button></form>
    </section>`).join('')}</div>
  </div>`;
}

import { createLiveNoteEditor } from './live-note-editor.js';

export function createDescriptionEditors({ getProject, saveTaskChange, notify }) {
  const editors = new Map(), drafts = new Map();
  function mount(root) {
    const visible = new Set();
    for (const host of root.querySelectorAll('[data-description-editor]')) {
      const { projectId, taskDescription: taskId } = host.dataset;
      const key = JSON.stringify([projectId, taskId ?? null]);
      const record = () => { const project = getProject(projectId); return taskId === undefined ? project : project?.tasks.find(task => task.id === taskId); };
      if (!record()) continue;
      visible.add(key);
      const label = taskId === undefined ? '项目说明' : `${record().title}的详细说明`;
      let entry = editors.get(key);
      if (entry && entry.label !== label) { entry.editor.destroy(); editors.delete(key); entry = null; }
      if (!entry) {
        entry = { label, group: Symbol(), contentId: taskId === undefined ? 'project-description' : `task-description-${projectId}-${taskId}` };
        entry.editor = createLiveNoteEditor({
          getNote: () => ({ id: key, body: drafts.get(key) ?? record()?.description ?? '' }),
          contentId: entry.contentId,
          label, placeholderText: taskId === undefined ? '项目说明，支持 Markdown…' : '添加详细说明，支持 Markdown…',
          maxLength: 20000, allowImages: false, limitMessage: '说明最多可输入 20000 字。', notify,
          onFocus: () => { entry.group = Symbol(); },
          onChange(_, body) {
            const project = getProject(projectId), target = record();
            if (!project || !target) return;
            if ((target.description || '') === body) { drafts.delete(key); return; }
            drafts.set(key, body);
            if (saveTaskChange(project, () => {
              if (body || taskId === undefined) target.description = body; else delete target.description;
            }, taskId === undefined ? '项目说明' : '事项说明', entry.group)) drafts.delete(key);
          },
        });
        editors.set(key, entry);
      }
      entry.editor.mount(host, { id: key, body: drafts.get(key) ?? record().description ?? '' });
      entry.editor.setSelection(entry.selection);
    }
    for (const [key, entry] of editors) if (!visible.has(key)) { entry.editor.destroy(); editors.delete(key); }
  }
  function preserveSelection() { for (const entry of editors.values()) entry.selection = entry.editor.getSelection(); }
  function focus(contentId) {
    const entry = [...editors.values()].find(entry => entry.contentId === contentId);
    if (!entry) return false;
    entry.editor.focus(); return true;
  }
  function withDrafts(workspace) {
    const copy = structuredClone(workspace);
    for (const [key, body] of drafts) {
      const [projectId, taskId] = JSON.parse(key), project = copy.projects.find(item => item.id === projectId);
      const target = taskId === null ? project : project?.tasks.find(task => task.id === taskId);
      if (!target) continue;
      if (body || taskId === null) target.description = body; else delete target.description;
    }
    return copy;
  }
  return { mount, preserveSelection, focus, withDrafts };
}

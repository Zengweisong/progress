import { validateData } from './data.js';

export function deletedRecord(data, kind, id, projectId) {
  const record = kind === 'project' ? data.projects.find(p => p.id === id)
    : kind === 'note' ? data.notes.find(n => n.id === id)
      : data.projects.find(p => p.id === projectId)?.tasks.find(t => t.id === id);
  if (!record) throw new Error('记录已发生变化，请重新打开后操作。');
  const collection = kind === 'project' ? data.projects : kind === 'note' ? data.notes : data.projects.find(p => p.id === projectId).tasks;
  return { kind, record: structuredClone(record), position: collection.indexOf(record), ...(kind === 'task' ? { projectId } : {}),
    ...(kind === 'project' ? { linkedNotes: data.notes.filter(n => n.projectIds.includes(id)).map(n => n.id) } : {}) };
}

export function removeRecord(data, item) {
  const { kind, record, projectId } = item;
  if (kind === 'project') {
    data.projects = data.projects.filter(p => p.id !== record.id);
    for (const note of data.notes) if (note.projectIds.includes(record.id)) {
      note.projectIds = note.projectIds.filter(id => id !== record.id);
      note.updatedAt = new Date().toISOString();
    }
  } else if (kind === 'note') data.notes = data.notes.filter(n => n.id !== record.id);
  else {
    const project = data.projects.find(p => p.id === projectId);
    if (!project) throw new Error('所属项目已不存在，请先恢复项目。');
    project.tasks = project.tasks.filter(t => t.id !== record.id);
    project.updatedAt = new Date().toISOString();
  }
}

export function restoreRecord(data, item) {
  const { kind, projectId } = item, record = structuredClone(item.record);
  record.updatedAt = new Date().toISOString();
  if (kind === 'project') {
    if (data.projects.some(p => p.id === record.id)) throw new Error('项目已存在，无需重复恢复。');
    data.projects.splice(item.position ?? data.projects.length, 0, record);
    for (const note of data.notes) if (item.linkedNotes.includes(note.id) && !note.projectIds.includes(record.id)) {
      note.projectIds.push(record.id); note.updatedAt = record.updatedAt;
    }
  } else if (kind === 'note') {
    if (data.notes.some(n => n.id === record.id)) throw new Error('笔记已存在，无需重复恢复。');
    record.projectIds = record.projectIds.filter(id => data.projects.some(p => p.id === id));
    data.notes.splice(item.position ?? data.notes.length, 0, record);
  } else if (kind === 'task') {
    const project = data.projects.find(p => p.id === projectId);
    if (!project) throw new Error('所属项目已不存在，请先恢复项目。');
    if (project.tasks.some(t => t.id === record.id)) throw new Error('任务已存在，无需重复恢复。');
    if (record.moduleId && !project.modules?.some(m => m.id === record.moduleId)) record.moduleId = '';
    project.tasks.splice(item.position ?? project.tasks.length, 0, record); project.updatedAt = record.updatedAt;
  } else throw new Error('无法恢复这种记录。');
  return validateData(data);
}

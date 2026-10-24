import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { workspaceChange, undoWorkspaceChange } from '../public/workspace-undo.js';
import { moveRecord, moveCategory } from '../public/record-order.js';
import { moveTaskToModule, reorderModuleTask } from '../public/route-task-drag.js';
import { removeCategory } from '../public/categories.js';
import { removeModule, setTaskStatus } from '../public/project-tasks.js';

const timestamp = '2026-10-24T10:00:00.000Z';
const withoutTime = value => JSON.parse(JSON.stringify(value, (key, value) => key === 'updatedAt' ? undefined : value));

test('undo record moves restores categories and sort preference while preserving later text edits', () => {
  const before = seedData(), after = structuredClone(before);
  moveRecord(after, { section: 'projects', id: 'p1', category: before.projects[1].tag, beforeId: 'p2' }, timestamp);
  const patches = workspaceChange(before, after);
  after.projects[0].title = '后续标题'; after.notes[0].body = '后续正文';
  const restored = undoWorkspaceChange(after, patches);
  assert.equal(restored.projects[0].title, '后续标题'); assert.equal(restored.notes[0].body, '后续正文');
  assert.equal(restored.projects[0].tag, before.projects[0].tag);
  assert.equal(restored.preferences.sort, before.preferences.sort);
  assert.deepEqual(restored.projects.map(p => p.order), before.projects.map(p => p.order));
  assert.equal(restored.projects[0].updatedAt, before.projects[0].updatedAt); validateData(restored);
});

test('undo category ordering removes generated folders and restores deleted categories', () => {
  const before = seedData(), after = structuredClone(before);
  moveCategory(after, 'projects', '工作', null, timestamp);
  assert.deepEqual(withoutTime(undoWorkspaceChange(after, workspaceChange(before, after))), withoutTime(before));
  const deleted = structuredClone(before); removeCategory(deleted, 'projects', '工作', timestamp);
  assert.deepEqual(withoutTime(undoWorkspaceChange(deleted, workspaceChange(before, deleted))), withoutTime(before));
});

test('task reorder, cross-module moves, completion and module deletion undo consecutively', () => {
  let current = seedData(); const project = current.projects[0];
  project.modules = [{ id: 'ui', name: '界面' }]; project.tasks[2].moduleId = 'ui';
  const initial = structuredClone(current), steps = [];
  for (const change of [
    p => reorderModuleTask(p, p.tasks[0].id, 1),
    p => moveTaskToModule(p, p.tasks[0].id, 'ui', 1),
    p => setTaskStatus(p.tasks[0], 'todo'),
    p => removeModule(p, 'ui'),
  ]) {
    const before = structuredClone(current); change(current.projects[0]);
    steps.push(workspaceChange(before, current));
  }
  while (steps.length) current = undoWorkspaceChange(current, steps.pop());
  assert.deepEqual(withoutTime(current), withoutTime(initial)); validateData(current);
});

test('task additions can be undone and unrelated tasks added later are kept', () => {
  const before = seedData(), after = structuredClone(before);
  after.projects[0].tasks.push({ id: 'new', title: '新增', done: false });
  const patches = workspaceChange(before, after);
  after.projects[0].tasks.push({ id: 'later', title: '后续新增', done: false });
  const restored = undoWorkspaceChange(after, patches);
  assert.deepEqual(restored.projects[0].tasks.map(t => t.id), [...before.projects[0].tasks.map(t => t.id), 'later']);
});

test('conflicting changes reject the whole inverse without changing data', () => {
  const before = seedData(), after = structuredClone(before);
  moveRecord(after, { section: 'projects', id: 'p1', beforeId: 'p3' }, timestamp);
  const patches = workspaceChange(before, after);
  after.preferences.sort = 'title'; const unchanged = structuredClone(after);
  assert.throws(() => undoWorkspaceChange(after, patches), /相关内容已发生变化/);
  assert.deepEqual(after, unchanged);
});

test('timestamps and unchanged operations create no history or copies of note bodies', () => {
  const before = seedData(), after = structuredClone(before);
  after.projects[0].updatedAt = timestamp;
  assert.deepEqual(workspaceChange(before, after), []);
  moveRecord(after, { section: 'knowledge', id: 'n2', beforeId: 'n1' }, timestamp);
  assert.ok(workspaceChange(before, after).every(patch => !patch.path.includes('body')));
});

test('undo preserves timestamps of later edits and restores the original update sort otherwise', () => {
  const before = seedData();
  before.projects.forEach((p, i) => { p.updatedAt = `2026-10-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`; });
  const after = structuredClone(before);
  moveRecord(after, { section: 'projects', id: 'p1', beforeId: 'p3' }, timestamp);
  const patches = workspaceChange(before, after);
  assert.deepEqual(undoWorkspaceChange(after, patches), before);
  after.projects[0].title = '后来编辑'; after.projects[0].updatedAt = '2026-10-24T12:00:00.000Z';
  assert.equal(undoWorkspaceChange(after, patches).projects[0].updatedAt, after.projects[0].updatedAt);
});

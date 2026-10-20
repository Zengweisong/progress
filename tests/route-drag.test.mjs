import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { reorderTask, reorderModuleTask, moveTaskToModule } from '../public/route-task-drag.js';
import { mergeWorkspaces, resolveWorkspaceConflicts } from '../public/sync-merge.js';

test('moving between modules inserts at the chosen position and keeps all other task fields', () => {
  const project = seedData().projects[0];
  project.modules = [{ id: 'ui', name: '界面' }, { id: 'empty', name: '空模块' }];
  project.tasks[1].moduleId = 'ui'; project.tasks[3].moduleId = 'ui';
  const original = structuredClone(project.tasks), moved = project.tasks[0];
  assert.equal(moveTaskToModule(project, moved.id, 'ui', 1), true);
  assert.deepEqual(project.tasks.filter(task => task.moduleId === 'ui').map(task => task.id), ['p1-t1', 'p1-t0', 'p1-t3']);
  assert.deepEqual(moved, { ...original[0], moduleId: 'ui' });
  assert.equal(moveTaskToModule(project, moved.id, 'empty', 0), true);
  assert.equal(moveTaskToModule(project, moved.id, '', 0), true);
  assert.equal(project.tasks.filter(task => !task.moduleId)[0], moved);
  const beforeInvalid = structuredClone(project.tasks);
  for (const [moduleId, index] of [['missing', 0], ['ui', -1], ['ui', 3], ['ui', 1.2]]) assert.equal(moveTaskToModule(project, moved.id, moduleId, index), false);
  assert.deepEqual(project.tasks, beforeInvalid);
  for (const task of original) {
    const current = project.tasks.find(item => item.id === task.id);
    assert.deepEqual({ ...current, moduleId: task.moduleId || '' }, { ...task, moduleId: task.moduleId || '' });
  }
});

test('module reordering changes only its own slots in an interleaved task array', () => {
  const project = seedData().projects[0];
  project.modules = [{ id: 'ui', name: '界面' }];
  project.tasks[0].moduleId = 'ui'; project.tasks[3].moduleId = 'ui';
  const original = structuredClone(project.tasks);
  assert.equal(reorderModuleTask(project, 'p1-t0', 1), true);
  assert.deepEqual(project.tasks, [original[3], original[1], original[2], original[0], original[4]]);
  assert.equal(reorderModuleTask(project, 'p1-t0', 2), false);
  assert.equal(reorderModuleTask(project, 'missing', 0), false);
});

test('moving a dot preserves every task field and rejects invalid targets', () => {
  const project = seedData().projects[0], original = structuredClone(project.tasks);
  assert.equal(reorderTask(project, original[0].id, 3), true);
  assert.deepEqual(project.tasks.map(task => task.id), ['p1-t1', 'p1-t2', 'p1-t3', 'p1-t0', 'p1-t4']);
  assert.deepEqual([...project.tasks].sort((a, b) => a.id.localeCompare(b.id)), original);
  assert.equal(reorderTask(project, original[0].id, 0), true);
  assert.deepEqual(project.tasks, original);
  for (const index of [-1, 5, NaN, 1.5]) assert.equal(reorderTask(project, original[0].id, index), false);
  assert.equal(reorderTask(project, 'missing', 0), false);
  assert.deepEqual(project.tasks, original);
});

test('remote reorder combines with independent local task completion', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  local.projects[0].tasks[3].done = true;
  reorderTask(remote.projects[0], 'p1-t4', 0);
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert.equal(conflicts.length, 0);
  assert.deepEqual(data.projects[0].tasks.map(task => task.id), remote.projects[0].tasks.map(task => task.id));
  assert.equal(data.projects[0].tasks.find(task => task.id === 'p1-t3').done, true);
  validateData(data);
});

test('different reorderings on two devices produce a resolvable conflict', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  reorderTask(local.projects[0], 'p1-t4', 0);
  reorderTask(remote.projects[0], 'p1-t0', 4);
  assert.equal(mergeWorkspaces(base, local, remote).conflicts.length, 1);
  for (const [choice, source] of [['local', local], ['remote', remote]]) {
    const data = resolveWorkspaceConflicts(base, local, remote, choice);
    assert.deepEqual(data.projects[0].tasks.map(task => task.id), source.projects[0].tasks.map(task => task.id));
    validateData(data);
  }
});

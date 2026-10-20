import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { reorderTask } from '../public/route-task-drag.js';
import { mergeWorkspaces, resolveWorkspaceConflicts } from '../public/sync-merge.js';

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

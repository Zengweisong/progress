import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { taskStatus, setTaskStatus, taskGroups, moduleOptions } from '../public/project-tasks.js';
import { mergeWorkspaces, resolveWorkspaceConflicts } from '../public/sync-merge.js';

test('default group names survive backup and merge without changing task membership', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  local.projects[0].ungroupedName = '总体';
  remote.projects[0].tasks[3].done = true;
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert.equal(conflicts.length, 0);
  assert.equal(taskGroups(data.projects[0])[0].name, '总体');
  assert.deepEqual(moduleOptions(data.projects[0])[0], ['', '总体']);
  assert.deepEqual(data.projects[0].tasks, remote.projects[0].tasks);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
  assert.equal(taskGroups(base.projects[0])[0].name, '默认模块');
  for (const name of ['', '  ', 'a'.repeat(61), 42, null]) {
    const invalid = structuredClone(base); invalid.projects[0].ungroupedName = name;
    assert.throws(() => validateData(invalid));
  }
});

test('old completion records load unchanged and new task states count independently', () => {
  const data = seedData(), original = structuredClone(data);
  validateData(data); assert.deepEqual(data, original);
  assert.equal(taskStatus({ done: true }), 'done');
  assert.equal(taskStatus({ done: false }), 'todo');
  const tasks = [{ done: false }, { done: false }];
  tasks.forEach(task => setTaskStatus(task, 'active'));
  assert.equal(tasks.filter(task => taskStatus(task) === 'active').length, 2);
  assert.equal(tasks.filter(task => task.done).length, 0);
  setTaskStatus(tasks[0], 'done'); assert.equal(tasks[0].done, true);
  setTaskStatus(tasks[0], 'todo'); assert.equal(tasks[0].done, false);
});

test('backup validation rejects broken module references and inconsistent task status', () => {
  const data = seedData(), p = data.projects[0];
  p.modules = [{ id: 'ui', name: '界面' }];
  p.tasks[0].moduleId = 'ui'; setTaskStatus(p.tasks[0], 'active');
  assert.doesNotThrow(() => validateData(structuredClone(data)));
  p.tasks[0].moduleId = 'missing'; assert.throws(() => validateData(structuredClone(data)));
  p.tasks[0].moduleId = 'ui'; p.tasks[0].done = true; assert.throws(() => validateData(structuredClone(data)));
  p.tasks[0].done = false; p.modules.push({ id: 'ui', name: '重复编号' }); assert.throws(() => validateData(structuredClone(data)));
});

test('parallel module creation and independent task state changes merge', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  local.projects[0].modules = [{ id: 'ui', name: '界面' }];
  remote.projects[0].modules = [{ id: 'api', name: '接口' }];
  local.projects[0].tasks[0].moduleId = 'ui'; setTaskStatus(local.projects[0].tasks[0], 'active');
  remote.projects[0].tasks[1].moduleId = 'api'; setTaskStatus(remote.projects[0].tasks[1], 'active');
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert.equal(conflicts.length, 0);
  assert.deepEqual(data.projects[0].modules.map(module => module.id), ['ui', 'api']);
  assert.equal(data.projects[0].tasks.filter(task => taskStatus(task) === 'active').length, 2);
  validateData(data);
});

test('competing task statuses stay coherent for every conflict resolution', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  setTaskStatus(local.projects[0].tasks[3], 'active');
  setTaskStatus(remote.projects[0].tasks[3], 'done');
  const merged = mergeWorkspaces(base, local, remote);
  assert.equal(merged.conflicts.length, 1);
  assert.equal(taskStatus(merged.data.projects[0].tasks[3]), 'active');
  for (const choice of ['local', 'remote', 'both']) validateData(resolveWorkspaceConflicts(base, local, remote, choice));
});

test('deleting a module while another device adds a task retains the task ungrouped', () => {
  const base = seedData(); base.projects[0].modules = [{ id: 'ui', name: '界面' }];
  const local = structuredClone(base), remote = structuredClone(base);
  local.projects[0].modules = [];
  remote.projects[0].tasks.push({ id: 'new', title: '新任务', done: false, status: 'active', moduleId: 'ui' });
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(data.projects[0].tasks.at(-1), { id: 'new', title: '新任务', done: false, status: 'active', moduleId: '' });
  validateData(data);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { taskGroups } from '../public/project-tasks.js';
import { mergeWorkspaces } from '../public/sync-merge.js';
test('project and task archives survive backup and independent cross-device edits', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  local.projects[0].archived = true; local.projects[0].tasks[0].archived = true;
  remote.projects[0].tasks[1].title = '另一端修改';
  const result = mergeWorkspaces(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  const data = validateData(JSON.parse(JSON.stringify(result.data)));
  assert.equal(data.projects[0].archived, true);
  assert.equal(data.projects[0].tasks[0].archived, true);
  assert.equal(data.projects[0].tasks[1].title, '另一端修改');
  assert(!taskGroups(data.projects[0], true).flatMap(group => group.tasks).some(task => task.id === base.projects[0].tasks[0].id));
  assert.deepEqual(data.notes, base.notes);
  for (const value of ['true', null, 1]) {
    const invalid = seedData(); invalid.projects[0].archived = value; assert.throws(() => validateData(invalid));
    const invalidTask = seedData(); invalidTask.projects[0].tasks[0].archived = value; assert.throws(() => validateData(invalidTask));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { mergeWorkspaces } from '../public/sync-merge.js';
import { deletedRecord, removeRecord, restoreRecord } from '../public/recycle-bin.js';
import { searchWorkspace } from '../public/workspace-search.js';
import { workspaceChange, undoWorkspaceChange } from '../public/workspace-undo.js';

test('optional task descriptions accept old data and reject malformed or oversized values', () => {
  const data = seedData(); validateData(data);
  for (const value of ['', '具体步骤\n验收标准', '字'.repeat(20000)]) {
    data.projects[0].tasks[0].description = value;
    assert.equal(validateData(structuredClone(data)).projects[0].tasks[0].description, value);
  }
  for (const value of [null, 42, {}, '字'.repeat(20001)]) {
    data.projects[0].tasks[0].description = value;
    assert.throws(() => validateData(data), /备份格式/);
  }
});

test('task descriptions survive backup, deletion recovery and independent sync edits', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  local.projects[0].tasks[0].description = '先梳理边界\n再补充验收条件';
  remote.projects[0].tasks[0].title = '远程修改的待办名称';
  const merged = mergeWorkspaces(base, local, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.data.projects[0].tasks[0].description, local.projects[0].tasks[0].description);
  assert.equal(merged.data.projects[0].tasks[0].title, remote.projects[0].tasks[0].title);
  const restored = validateData(JSON.parse(JSON.stringify(merged.data)));
  const item = deletedRecord(restored, 'task', 'p1-t0', 'p1');
  removeRecord(restored, item); restoreRecord(restored, item);
  assert.equal(restored.projects[0].tasks[0].description, item.record.description);
  const competing = structuredClone(local); competing.projects[0].tasks[0].description = '另一端的说明';
  assert.equal(mergeWorkspaces(base, local, competing).conflicts.length, 1);
});

test('search includes descriptions and undo changes only the edited description', () => {
  const before = seedData(), after = structuredClone(before);
  after.projects[0].tasks[0].description = '检查验收条件';
  const found = searchWorkspace(after, '验收条件', 'task');
  assert.equal(found.total, 1); assert.equal(found.results[0].id, 'p1-t0');
  assert.match(found.results[0].snippet, /验收条件/);
  const patches = workspaceChange(before, after);
  after.projects[0].title = '后续项目标题';
  const restored = undoWorkspaceChange(after, patches);
  assert.equal(restored.projects[0].tasks[0].description, undefined);
  assert.equal(restored.projects[0].title, '后续项目标题');
});

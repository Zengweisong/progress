import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { navigationCategories, uncategorizedHidden, writeCategory, removeCategory } from '../public/categories.js';
import { removeModule, taskGroups, moduleOptions } from '../public/project-tasks.js';
import { mergeWorkspaces } from '../public/sync-merge.js';
const timestamp = '2026-10-21T04:00:00Z';

test('default category rename and removal preserve notes, links and cross-device edits', () => {
  const base = seedData(); base.notes[0].category = '';
  const local = structuredClone(base), remote = structuredClone(base);
  removeCategory(local, 'knowledge', '', timestamp);
  remote.notes[1].body = '另一端编辑'; remote.notes[1].updatedAt = timestamp;
  const result = mergeWorkspaces(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  const saved = validateData(JSON.parse(JSON.stringify(result.data)));
  assert(uncategorizedHidden(saved, 'knowledge'));
  assert(!uncategorizedHidden(saved, 'inbox'));
  assert(!navigationCategories(saved, 'knowledge').includes(''));
  assert.deepEqual(saved.notes[0], base.notes[0]);
  assert.equal(saved.notes[1].body, '另一端编辑');
  const renamed = structuredClone(base);
  writeCategory(renamed, 'knowledge', '', '我的文章', 'folder-name', timestamp);
  assert.equal(renamed.notes[0].category, '我的文章');
  assert.deepEqual(renamed.notes[0].projectIds, base.notes[0].projectIds);
  assert(!navigationCategories(renamed, 'knowledge').includes(''));
});

test('deleted default modules do not return empty and concurrent unassigned tasks remain accessible', () => {
  const base = seedData(); const project = base.projects[0];
  project.modules = [{ id: 'ui', name: '界面' }];
  const local = structuredClone(base), remote = structuredClone(base);
  removeModule(local.projects[0], '');
  assert.equal(taskGroups(local.projects[0], true).length, 1);
  assert.deepEqual(moduleOptions(local.projects[0]), [['ui', '界面']]);
  assert.deepEqual(local.projects[0].tasks, project.tasks.map(task => ({ ...task, moduleId: 'ui' })));
  const withEmptyModule = structuredClone(local.projects[0]);
  withEmptyModule.modules.push({ id: 'empty', name: '空模块' });
  removeModule(withEmptyModule, 'empty');
  assert.deepEqual(moduleOptions(withEmptyModule), [['ui', '界面']]);
  remote.projects[0].tasks.push({ id: 'new-task', title: '另一端新增', done: false });
  const result = mergeWorkspaces(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  const merged = validateData(result.data).projects[0];
  assert(taskGroups(merged, true).find(group => !group.id).tasks.some(task => task.id === 'new-task'));
  const single = seedData().projects[0], original = structuredClone(single.tasks);
  single.ungroupedName = '计划'; removeModule(single, '');
  assert.equal(single.ungroupedName, undefined);
  assert.deepEqual(single.tasks.map(task => ({ ...task, moduleId: '' })), original.map(task => ({ ...task, moduleId: '' })));
});

test('default-group visibility flags reject malformed backups', () => {
  const data = seedData(); data.projects[0].ungroupedHidden = 'yes';
  assert.throws(() => validateData(data));
  const malformed = seedData(); malformed.folders.push({ id: 'hidden', section: 'knowledge', name: '用户分类', uncategorizedHidden: true, updatedAt: timestamp });
  assert.throws(() => validateData(malformed));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { categoryNames } from '../public/categories.js';
import { moveRecord, moveCategory, orderedRecords } from '../public/record-order.js';
import { mergeWorkspaces, resolveWorkspaceConflicts } from '../public/sync-merge.js';
const timestamp = '2026-10-21T08:00:00Z';
test('category moves materialize inferred categories and keep records intact through backup and sync', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  const names = categoryNames(base, 'projects'); let id = 0;
  assert(moveCategory(local, 'projects', names.at(-1), names[0], timestamp, () => `folder-${++id}`));
  assert.deepEqual(categoryNames(local, 'projects'), [names.at(-1), ...names.slice(0, -1)]);
  remote.notes[0].body = '另一端编辑';
  const merged = mergeWorkspaces(base, local, remote); assert.equal(merged.conflicts.length, 0);
  const restored = validateData(JSON.parse(JSON.stringify(merged.data)));
  assert.deepEqual(categoryNames(restored, 'projects'), categoryNames(local, 'projects'));
  assert.deepEqual(restored.projects, base.projects);
  assert.equal(restored.notes[0].body, '另一端编辑');
});
test('records move across categories preserving all content, archive flags and note relationships', () => {
  const data = seedData(), original = structuredClone(data), p = data.projects[0];
  data.projects[1].archived = true;
  assert(moveRecord(data, { section: 'projects', id: p.id, category: '生活' }, timestamp));
  assert.equal(p.tag, '生活'); assert.equal(data.preferences.sort, 'manual');
  assert.deepEqual(p.tasks, original.projects[0].tasks); assert.deepEqual(data.notes, original.notes);
  assert.deepEqual(data.projects[1], { ...original.projects[1], archived: true });
  const n = data.notes[0]; assert(moveRecord(data, { section: 'knowledge', id: n.id, category: '技术实践' }, timestamp));
  assert.equal(n.category, '技术实践'); assert.equal(n.body, original.notes[0].body); assert.deepEqual(n.projectIds, original.notes[0].projectIds);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
  const snapshot = structuredClone(data);
  assert.equal(moveRecord(data, { section: 'knowledge', id: n.id, category: '不存在' }, timestamp), false);
  assert.deepEqual(data, snapshot);
});
test('home reorders a filtered subset while keeping hidden slots and supports explicit conflicts', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  const ids = [base.projects[0].id, base.projects[2].id, base.projects[4].id];
  assert(moveRecord(local, { section: 'projects', id: ids[2], beforeId: ids[0], visibleIds: ids }, timestamp));
  const ordered = orderedRecords(local.projects).map(p => p.id);
  assert.deepEqual(ordered.filter(id => ids.includes(id)), [ids[2], ids[0], ids[1]]);
  assert.deepEqual(ordered, base.projects.map((project, index) => ({ 0: ids[2], 2: ids[0], 4: ids[1] })[index] || project.id));
  remote.projects[0].tasks[0].title = '独立任务编辑';
  const merge = mergeWorkspaces(base, local, remote); assert.equal(merge.conflicts.length, 0);
  assert.equal(merge.data.projects[0].tasks[0].title, '独立任务编辑');
  const other = structuredClone(base);
  moveRecord(other, { section: 'projects', id: ids[0], beforeId: null, visibleIds: ids }, timestamp);
  const conflict = mergeWorkspaces(base, local, other); assert(conflict.conflicts.length > 0);
  validateData(resolveWorkspaceConflicts(base, local, other, 'both'));
});
test('unsafe ranks and capacity failures are rejected before mutations', () => {
  for (const value of [-1, 1.5, Infinity, '1']) for (const collection of ['projects', 'notes', 'folders']) {
    const data = seedData(); if (collection === 'folders') data.folders.push({ id: 'f1', name: '资料', section: 'knowledge', updatedAt: timestamp });
    data[collection][0].order = value; assert.throws(() => validateData(data));
  }
  const data = seedData(); data.folders = Array.from({ length: 300 }, (_, i) => ({ id: `f${i}`, name: `分类${i}`, section: 'inbox', updatedAt: timestamp }));
  const before = structuredClone(data), names = categoryNames(data, 'projects');
  assert.throws(() => moveCategory(data, 'projects', names[1], names[0], timestamp)); assert.deepEqual(data, before);
});

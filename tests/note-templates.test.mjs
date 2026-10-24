import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { mergeWorkspaces } from '../public/sync-merge.js';
import { resolveWorkspaceConflicts } from '../public/sync-merge.js';
import { builtinTemplates, commonTemplates, moveCommonTemplate, importCommonTemplates } from '../public/note-templates.js';
import { workspaceChange, undoWorkspaceChange } from '../public/workspace-undo.js';

test('template flags survive backups and merge with independent note content changes', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  local.notes[0].isTemplate = true; remote.notes[0].body = '更新的模板内容';
  const merged = mergeWorkspaces(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.data.notes[0].isTemplate, true);
  assert.equal(merged.data.notes[0].body, '更新的模板内容');
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(merged.data))), merged.data);
  for (const invalid of ['true', 1, {}, null]) {
    const data = seedData(); data.notes[0].isTemplate = invalid;
    assert.throws(() => validateData(data));
  }
});

test('old workspaces receive independent editable defaults and validate template data', () => {
  const old = seedData(); delete old.templates;
  const restored = validateData(old);
  assert.equal(restored.templates.length, builtinTemplates.length);
  restored.templates[0].title = '自己的会议模板';
  assert.equal(builtinTemplates[0].title, '会议记录'); assert.equal(seedData().templates[0].title, '会议记录');
  for (const change of [t => { t.body = 7; }, t => { t.body = '字'.repeat(200001); }, t => { t.title = ''; }, t => { t.order = -1; }]) {
    const data = seedData(); change(data.templates[0]); assert.throws(() => validateData(data));
  }
  const duplicate = seedData(); duplicate.templates.push({ ...duplicate.templates[0] }); assert.throws(() => validateData(duplicate));
});

test('common template moves preserve contents, support undo and reject no-op targets', () => {
  const before = seedData(), data = structuredClone(before), timestamp = '2026-10-24T10:00:00.000Z';
  assert.equal(moveCommonTemplate(data, 'weekly', 'meeting', timestamp), true);
  assert.deepEqual(commonTemplates(data.templates).map(t => t.id), ['weekly', 'meeting', 'review', 'reading', 'planning']);
  assert.equal(data.templates.find(t => t.id === 'meeting').body, before.templates[0].body);
  const restored = undoWorkspaceChange(data, workspaceChange(before, data));
  assert.deepEqual(restored, before);
  assert.equal(moveCommonTemplate(data, 'missing', null, timestamp), false);
  assert.equal(moveCommonTemplate(data, 'weekly', 'weekly', timestamp), false);
  assert.equal(moveCommonTemplate(data, 'weekly', 'meeting', timestamp), false);
});

test('template content and ordering sync independently and conflicting versions can both survive', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  local.templates[0].body = '## 本机修改的模板';
  moveCommonTemplate(remote, 'weekly', 'meeting', '2026-10-24T10:00:00.000Z');
  const merged = mergeWorkspaces(base, local, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.data.templates.find(t => t.id === 'meeting').body, local.templates[0].body);
  assert.equal(commonTemplates(merged.data.templates)[0].id, 'weekly');
  remote.templates.find(t => t.id === 'meeting').body = '## 云端不同的修改';
  assert.equal(mergeWorkspaces(base, local, remote).conflicts[0].collection, 'templates');
  const both = resolveWorkspaceConflicts(base, local, remote, 'both');
  assert.equal(both.templates.length, base.templates.length + 1);
  assert.ok(both.templates.some(t => t.body === local.templates[0].body));
  assert.ok(both.templates.some(t => t.body === '## 云端不同的修改'));
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(both))), both);
});

test('import keeps existing common templates and creates independent copies of different content', () => {
  const current = seedData().templates, incoming = structuredClone(current);
  assert.deepEqual(importCommonTemplates(current, incoming, () => 'copy'), current);
  incoming[0].body = '导入的模板内容';
  const merged = importCommonTemplates(current, incoming, () => 'copy');
  assert.equal(merged.length, current.length + 1);
  assert.equal(merged.find(t => t.id === 'meeting').body, current[0].body);
  assert.equal(merged.find(t => t.id === 'copy').body, '导入的模板内容');
  assert.match(merged.find(t => t.id === 'copy').title, /导入/);
});

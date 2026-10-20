import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { categoryNames, writeCategory, removeCategory } from '../public/categories.js';
import { mergeWorkspaces, resolveWorkspaceConflicts } from '../public/sync-merge.js';

const timestamp = '2026-10-20T10:00:00.000Z';

test('old workspaces retain their record categories and accept empty custom groups', () => {
  const data = seedData(), original = structuredClone(data);
  delete data.folders;
  validateData(data);
  assert.deepEqual(data, original);
  assert.ok(categoryNames(data, 'projects').includes('个人成长'));
  assert.ok(categoryNames(data, 'knowledge').includes('产品与设计'));
  writeCategory(data, 'projects', null, ' 空分类 ', 'folder1', timestamp);
  assert.ok(categoryNames(data, 'projects').includes('空分类'));
  assert.ok(!categoryNames(data, 'inbox').includes('空分类'));
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
});

test('category names reject duplicates, blank input and reserved labels before mutation', () => {
  const data = seedData(), original = structuredClone(data);
  for (const name of ['', '   ', '个人成长', '未分类', '全部项目', 'a'.repeat(61)]) {
    assert.throws(() => writeCategory(data, 'projects', null, name, 'new', timestamp));
    assert.deepEqual(data, original);
  }
  assert.throws(() => writeCategory(data, 'unknown', null, '测试', 'new', timestamp));
});

test('renaming and deleting change only the selected section and preserve contents and links', () => {
  const data = seedData(), before = structuredClone(data);
  const folder = writeCategory(data, 'knowledge', '产品与设计', '设计资料', 'folder1', timestamp);
  assert.equal(folder.name, '设计资料');
  assert.equal(data.notes.find(note => note.inbox).category, '产品与设计');
  assert.equal(data.notes.find(note => note.id === 'n1').category, '设计资料');
  removeCategory(data, 'knowledge', '设计资料', timestamp);
  assert.ok(!categoryNames(data, 'knowledge').includes('设计资料'));
  assert.equal(data.notes.length, before.notes.length);
  assert.equal(data.notes.find(note => note.id === 'n1').category, '');
  assert.deepEqual(data.notes.map(note => [note.body, note.projectIds]), before.notes.map(note => [note.body, note.projectIds]));
  assert.deepEqual(data.projects, before.projects);
});

test('folder validation rejects malformed definitions without rejecting legacy backups', () => {
  const folder = { id: 'folder1', section: 'projects', name: '自定义', updatedAt: timestamp };
  for (const folders of [null, {}, [{ ...folder, section: 'nested' }], [{ ...folder, name: '' }], [{ ...folder, name: 'a'.repeat(61) }], [folder, folder], [{ ...folder, updatedAt: 'not-a-date' }]]) {
    assert.throws(() => validateData({ ...seedData(), folders }));
  }
});

test('independent category creation and record assignment merge across devices', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  writeCategory(local, 'projects', null, '本机分类', 'folder-local', timestamp);
  writeCategory(remote, 'knowledge', null, '云端分类', 'folder-remote', timestamp);
  local.projects[0].tag = '本机分类'; remote.notes[0].category = '云端分类';
  const result = mergeWorkspaces(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(new Set(result.data.folders.map(folder => folder.name)), new Set(['本机分类', '云端分类']));
  assert.equal(result.data.projects[0].tag, '本机分类');
  assert.equal(result.data.notes[0].category, '云端分类');
});

test('competing empty category renames keep both definitions when requested', () => {
  const base = seedData();
  writeCategory(base, 'inbox', null, '原分类', 'folder1', timestamp);
  const local = structuredClone(base), remote = structuredClone(base);
  writeCategory(local, 'inbox', '原分类', '本机分类', 'unused', timestamp);
  writeCategory(remote, 'inbox', '原分类', '云端分类', 'unused', timestamp);
  assert.equal(mergeWorkspaces(base, local, remote).conflicts[0].collection, 'folders');
  const both = resolveWorkspaceConflicts(base, local, remote, 'both');
  assert.deepEqual(new Set(both.folders.map(folder => folder.name)), new Set(['本机分类', '云端分类']));
  assert.equal(new Set(both.folders.map(folder => folder.id)).size, 2);
});

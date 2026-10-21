import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { deletedRecord, removeRecord, restoreRecord } from '../public/recycle-bin.js';
import { searchWorkspace, highlightText, textMatches } from '../public/workspace-search.js';

test('restoring a deleted project preserves tasks and relinks surviving notes without reverting edits', () => {
  const data = seedData(), original = structuredClone(data.projects[0]);
  const item = deletedRecord(data, 'project', original.id);
  const note = data.notes.find(n => n.projectIds.includes(original.id));
  removeRecord(data, item);
  validateData(data);
  note.body = '删除期间继续编辑的正文';
  restoreRecord(data, item);
  assert.deepEqual(data.projects[0].tasks, original.tasks);
  assert.ok(note.projectIds.includes(original.id));
  assert.equal(note.body, '删除期间继续编辑的正文');
  assert.throws(() => restoreRecord(data, item), /已存在/);
});

test('note restoration retains images and drops missing project references', () => {
  const data = seedData(), item = deletedRecord(data, 'note', data.notes[0].id);
  item.record.attachments = [{ id: 'image', name: 'test.png', mime: 'image/png', data: 'data:image/png;base64,AAAA' }];
  removeRecord(data, item);
  data.projects = [];
  for (const note of data.notes) note.projectIds = [];
  restoreRecord(data, item);
  assert.deepEqual(data.notes[0].projectIds, []);
  assert.equal(data.notes[0].attachments[0].data, 'data:image/png;base64,AAAA');
});

test('task restoration preserves order and handles a removed module or missing parent', () => {
  const data = seedData(), project = data.projects[0];
  project.modules = [{ id: 'module', name: '模块' }]; project.tasks[1].moduleId = 'module';
  const item = deletedRecord(data, 'task', project.tasks[1].id, project.id);
  removeRecord(data, item); project.modules = [];
  restoreRecord(data, item);
  assert.equal(project.tasks[1].id, item.record.id);
  assert.equal(project.tasks[1].moduleId, '');
  removeRecord(data, item); data.projects = [];
  assert.throws(() => restoreRecord(data, item), /先恢复项目/);
});

test('search ranks titles, filters types, includes body context and locates task owners', () => {
  const data = seedData();
  data.notes[0].title = '唯一关键词'; data.notes[0].body = '前面的上下文。唯一关键词后面的细节。';
  data.projects[0].tasks[0].title = '完成唯一关键词检查';
  const result = searchWorkspace(data, '唯一关键词');
  assert.equal(result.results[0].kind, 'note');
  assert.match(result.results[0].snippet, /上下文.*细节/);
  const task = searchWorkspace(data, '唯一关键词', 'task').results[0];
  assert.equal(task.projectId, data.projects[0].id);
  assert.equal(task.id, data.projects[0].tasks[0].id);
  assert.equal(searchWorkspace(data, '唯一关键词', 'project').total, 0);
  assert.equal(searchWorkspace(data, data.projects[0].title, 'task').total, 0);
  assert.equal(searchWorkspace(data, '唯一关键词', 'all', 1).total, 2);
});

test('highlighting escapes hostile content and treats regex symbols literally', () => {
  const escape = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const html = highlightText('<img src=x onerror=alert(1)> .*', '.*', escape);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('<mark>.*</mark>'));
  assert.equal(highlightText('AbCaBc', 'abc', escape), '<mark>AbC</mark><mark>aBc</mark>');
  assert.deepEqual([...textMatches('İİİX', 'x')], [{ from: 3, to: 4 }]);
  assert.equal(highlightText('İİİX', 'x', escape), 'İİİ<mark>X</mark>');
});

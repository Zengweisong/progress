import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { emptyWorkspace, equalData, mergeWorkspaces, resolveWorkspaceConflicts } from '../public/sync-merge.js';

const clone = value => structuredClone(value);
function fixture() {
  const data = seedData();
  data.projects = data.projects.slice(0, 2);
  data.notes = data.notes.slice(0, 3).map(note => ({ ...note, projectIds: note.projectIds.filter(id => ['p1', 'p2'].includes(id)) }));
  return data;
}
function versions() { const base = fixture(); return { base, local: clone(base), remote: clone(base) }; }
const valid = data => assert.doesNotThrow(() => validateData(clone(data)));

test('different records and independent fields on a single project combine', () => {
  const { base, local, remote } = versions();
  local.projects[0].title = '本机标题';
  local.notes[0].body = '本机笔记';
  remote.projects[0].description = '云端说明';
  remote.projects[1].status = 'done';
  remote.notes[1].body = '云端笔记';
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert.equal(conflicts.length, 0);
  assert.equal(data.projects[0].title, '本机标题');
  assert.equal(data.projects[0].description, '云端说明');
  assert.equal(data.projects[1].status, 'done');
  assert.equal(data.notes[0].body, '本机笔记');
  assert.equal(data.notes[1].body, '云端笔记');
  valid(data);
});

test('different tasks, independent task fields, and additions merge', () => {
  const { base, local, remote } = versions();
  local.projects[0].tasks[0].title = '任务名';
  remote.projects[0].tasks[0].done = false;
  local.projects[0].tasks[1].done = false;
  remote.projects[0].tasks[2].done = false;
  local.projects[0].tasks.push({ id: 'local-task', title: '本地新增', done: false });
  remote.projects[0].tasks.push({ id: 'remote-task', title: '云端新增', done: true });
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  const tasks = data.projects[0].tasks;
  assert.equal(conflicts.length, 0);
  assert.equal(tasks[0].title, '任务名');
  assert.equal(tasks[0].done, false);
  assert.equal(tasks[1].done, false);
  assert.equal(tasks[2].done, false);
  assert.equal(tasks.length, base.projects[0].tasks.length + 2);
  valid(data);
});

test('task edit collisions do not choose the newer timestamp', () => {
  const { base, local, remote } = versions();
  local.projects[0].tasks[0].title = '保留本地';
  remote.projects[0].tasks[0].title = '远端冲突';
  remote.projects[0].updatedAt = '2030-01-01T00:00:00.000Z';
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert.equal(conflicts.length, 1);
  assert.equal(data.projects[0].tasks[0].title, '保留本地');
  assert.equal(conflicts[0].remote.tasks[0].title, '远端冲突');
  assert.equal(data.projects[0].updatedAt, remote.projects[0].updatedAt);
});

test('identical edits and timestamp-only changes do not conflict', () => {
  const { base, local, remote } = versions();
  local.notes[0].body = remote.notes[0].body = '一致';
  local.notes[0].updatedAt = '2028-02-01T00:00:00.000Z';
  remote.notes[0].updatedAt = '2027-02-01T00:00:00.000Z';
  remote.projects[0].updatedAt = '2030-02-01T00:00:00.000Z';
  assert.equal(equalData(local, remote), true);
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert.equal(conflicts.length, 0);
  assert.equal(data.notes[0].updatedAt, local.notes[0].updatedAt);
  assert.equal(data.projects[0].updatedAt, remote.projects[0].updatedAt);
});

test('device preferences stay local and are ignored for upload equality', () => {
  const { base, local, remote } = versions();
  local.preferences = { view: 'table', sort: 'due', group: 'priority' };
  assert.equal(equalData(local, remote), true);
  assert.deepEqual(mergeWorkspaces(base, local, remote).data.preferences, local.preferences);
  assert.deepEqual(resolveWorkspaceConflicts(base, local, remote, 'remote').preferences, local.preferences);
});

test('custom values, tags, and independent project links merge', () => {
  const { base, local, remote } = versions();
  local.projects[0].custom = { local: 5, same: 3 };
  remote.projects[0].custom = { remote: true, same: 3 };
  local.notes[0].tags = ['知识管理', '本机新增'];
  remote.notes[0].tags = ['知识管理', '方法', '远端新增'];
  local.notes[0].projectIds = [];
  remote.notes[0].projectIds.push('p2');
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert.equal(conflicts.length, 0);
  assert.deepEqual(data.projects[0].custom, { local: 5, same: 3, remote: true });
  assert.deepEqual(new Set(data.notes[0].tags), new Set(['知识管理', '本机新增', '远端新增']));
  assert.deepEqual(data.notes[0].projectIds, ['p2']);
});

test('ordinary deletions remove records and existing project links safely', () => {
  const { base, local, remote } = versions();
  local.projects = local.projects.filter(project => project.id !== 'p1');
  local.notes.forEach(note => { note.projectIds = note.projectIds.filter(id => id !== 'p1'); });
  local.notes = local.notes.filter(note => note.id !== 'n2');
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert.equal(conflicts.length, 0);
  assert.deepEqual(data.projects.map(project => project.id), ['p2']);
  assert.equal(data.notes.some(note => note.id === 'n2'), false);
  valid(data);
});

test('deletion versus edit is explicit, and both preserves the edited entity', () => {
  const { base, local, remote } = versions();
  local.notes = local.notes.filter(note => note.id !== 'n1');
  remote.notes[0].body = '不能丢失的云端记录';
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert.equal(conflicts.length, 1);
  assert.equal(data.notes.some(note => note.id === 'n1'), false);
  assert.equal(conflicts[0].local, null);
  assert.equal(conflicts[0].remote.body, '不能丢失的云端记录');
  assert.equal(resolveWorkspaceConflicts(base, local, remote, 'remote').notes.find(note => note.id === 'n1').body, '不能丢失的云端记录');
  const both = resolveWorkspaceConflicts(base, local, remote, 'both');
  assert.equal(both.notes.filter(note => note.id === 'n1').length, 1);
  valid(both);
});

test('resolving conflicting scalars retains independent safe fields', () => {
  const { base, local, remote } = versions();
  local.projects[0].title = '本机项目';
  local.projects[0].description = '安全本机修改';
  remote.projects[0].title = '云端项目';
  remote.projects[0].due = '2030-10-01';
  for (const choice of ['local', 'remote']) {
    const data = resolveWorkspaceConflicts(base, local, remote, choice);
    assert.equal(data.projects[0].title, choice === 'local' ? '本机项目' : '云端项目');
    assert.equal(data.projects[0].description, '安全本机修改');
    assert.equal(data.projects[0].due, '2030-10-01');
    valid(data);
  }
});

test('project deletion versus remote new linked note produces conflicts', () => {
  const { base, local, remote } = versions();
  local.projects = local.projects.filter(project => project.id !== 'p1');
  local.notes.forEach(note => { note.projectIds = note.projectIds.filter(id => id !== 'p1'); });
  remote.notes.push({ ...clone(remote.notes[0]), id: 'remote-note', title: '云端新笔记' });
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert(conflicts.some(item => item.collection === 'projects' && item.id === 'p1'));
  assert(conflicts.some(item => item.collection === 'notes' && item.id === 'remote-note' && item.remote.projectIds.includes('p1')));
  valid(data);
  for (const choice of ['remote', 'both']) {
    const restored = resolveWorkspaceConflicts(base, local, remote, choice);
    assert(restored.projects.some(project => project.id === 'p1'));
    assert(restored.notes.find(note => note.id === 'remote-note').projectIds.includes('p1'));
    valid(restored);
  }
});

test('project deletion versus an existing note edit detects the relationship conflict', () => {
  const { base, local, remote } = versions();
  remote.projects = remote.projects.filter(project => project.id !== 'p1');
  remote.notes.forEach(note => { note.projectIds = note.projectIds.filter(id => id !== 'p1'); });
  local.notes[0].body = '本机新编辑';
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert(conflicts.some(item => item.collection === 'projects' && item.id === 'p1'));
  assert(data.projects.some(project => project.id === 'p1'));
  assert(data.notes[0].projectIds.includes('p1'));
  const resolvedRemote = resolveWorkspaceConflicts(base, local, remote, 'remote');
  assert.equal(resolvedRemote.projects.some(project => project.id === 'p1'), false);
  assert.equal(resolvedRemote.notes[0].body, '本机新编辑');
  valid(data);
  valid(resolvedRemote);
});

test('retaining an edited project restores existing notes affected by deletion', () => {
  const { base, local, remote } = versions();
  local.projects[0].description = '编辑了项目';
  remote.projects = remote.projects.filter(project => project.id !== 'p1');
  remote.notes.forEach(note => { note.projectIds = note.projectIds.filter(id => id !== 'p1'); });
  const merged = mergeWorkspaces(base, local, remote);
  assert.equal(merged.conflicts.length, 1);
  assert(merged.data.notes.find(note => note.id === 'n1').projectIds.includes('p1'));
  const both = resolveWorkspaceConflicts(base, local, remote, 'both');
  assert(both.notes.find(note => note.id === 'n3').projectIds.includes('p1'));
  valid(both);
});

test('keeping a project with both does not resurrect independently deleted notes', () => {
  const { base, local, remote } = versions();
  local.projects[0].description = '编辑了项目';
  remote.projects = remote.projects.filter(project => project.id !== 'p1');
  remote.notes = remote.notes.filter(note => note.id !== 'n1');
  remote.notes.forEach(note => { note.projectIds = note.projectIds.filter(id => id !== 'p1'); });
  const data = resolveWorkspaceConflicts(base, local, remote, 'both');
  assert(data.projects.some(project => project.id === 'p1'));
  assert.equal(data.notes.some(note => note.id === 'n1'), false);
  valid(data);
});

test('both clones conflicting projects and remaps copies of their remote notes', () => {
  const { base, local, remote } = versions();
  local.projects[0].title = '本机项目';
  remote.projects[0].title = '云端项目';
  remote.notes[0].body = '远端关联内容';
  const data = resolveWorkspaceConflicts(base, local, remote, 'both');
  const duplicate = data.projects.find(project => project.id.startsWith('p1~conflict'));
  assert(duplicate.title.endsWith('（冲突副本）'));
  assert.equal(data.projects.find(project => project.id === 'p1').title, '本机项目');
  const note = data.notes.find(item => item.id.startsWith('n1~conflict'));
  assert.equal(note.body, '远端关联内容');
  assert.deepEqual(note.projectIds, [duplicate.id]);
  assert.equal(data.notes.filter(item => item.id.startsWith('n1~conflict')).length, 1);
  assert.equal(new Set(duplicate.tasks.map(task => task.id)).size, duplicate.tasks.length);
  valid(data);
});

test('conflicting field definitions preserve both names and each side custom values', () => {
  const { base, local, remote } = versions();
  const field = { id: 'f1', name: '预算', type: 'number' };
  base.fields = [clone(field)]; local.fields = [clone(field)]; remote.fields = [clone(field)];
  base.projects[0].custom.f1 = 1;
  local.fields[0].name = '本机工时';
  local.projects[0].custom.f1 = 2;
  remote.fields[0].name = '云端金额';
  remote.projects[0].custom.f1 = 3;
  const data = resolveWorkspaceConflicts(base, local, remote, 'both');
  const duplicate = data.fields.find(item => item.id !== 'f1');
  assert.equal(data.fields.find(item => item.id === 'f1').name, '本机工时');
  assert.equal(duplicate.name, '云端金额（冲突副本）');
  assert.equal(data.projects.find(item => item.id === 'p1').custom.f1, 2);
  assert.equal(data.projects.find(item => item.id === 'p1').custom[duplicate.id], 3);
  const projectCopy = data.projects.find(item => item.id.startsWith('p1~conflict'));
  assert.equal(projectCopy.custom[duplicate.id], 3);
  assert.equal(Object.hasOwn(projectCopy.custom, 'f1'), false);
  valid(data);
});

test('field deletion versus newly entered values is explicit and retains values with both', () => {
  const { base, local, remote } = versions();
  const field = { id: 'f1', name: '工时', type: 'number' };
  base.fields = [clone(field)]; remote.fields = [clone(field)];
  base.projects[0].custom.f1 = 1;
  remote.projects[0].custom.f1 = 5;
  const merged = mergeWorkspaces(base, local, remote);
  assert(merged.conflicts.some(item => item.collection === 'fields' && item.id === 'f1'));
  assert(merged.conflicts.some(item => item.collection === 'projects' && item.id === 'p1'));
  assert.equal(merged.data.fields.length, 0);
  assert.equal(Object.hasOwn(merged.data.projects[0].custom, 'f1'), false);
  for (const choice of ['remote', 'both']) {
    const data = resolveWorkspaceConflicts(base, local, remote, choice);
    assert.equal(data.fields[0].id, 'f1');
    assert.equal(data.projects.find(project => project.id === 'p1').custom.f1, 5);
    valid(data);
  }
});

test('retaining a renamed field restores values affected by deleting that field', () => {
  const { base, local, remote } = versions();
  base.fields = [{ id: 'f1', name: '预算', type: 'number' }];
  local.fields = [{ id: 'f1', name: '预算（元）', type: 'number' }];
  base.projects[0].custom.f1 = local.projects[0].custom.f1 = 99;
  const merged = mergeWorkspaces(base, local, remote);
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.data.fields[0].name, '预算（元）');
  assert.equal(merged.data.projects[0].custom.f1, 99);
  const resolved = resolveWorkspaceConflicts(base, local, remote, 'remote');
  assert.equal(resolved.fields.length, 0);
  assert.equal(Object.hasOwn(resolved.projects[0].custom, 'f1'), false);
});

test('ordinary field deletion removes stale values without a conflict', () => {
  const { base, local, remote } = versions();
  base.fields = remote.fields = [{ id: 'f1', name: '预算', type: 'number' }];
  base.projects[0].custom.f1 = remote.projects[0].custom.f1 = 99;
  const merged = mergeWorkspaces(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.data.fields.length, 0);
  assert.equal(Object.hasOwn(merged.data.projects[0].custom, 'f1'), false);
  valid(merged.data);
});

test('field type conversion versus concurrent value editing retains both meanings', () => {
  const { base, local, remote } = versions();
  base.fields = [{ id: 'f1', name: '预算', type: 'number' }];
  local.fields = [{ id: 'f1', name: '已审批', type: 'checkbox' }];
  remote.fields = [{ id: 'f1', name: '预算', type: 'number' }];
  base.projects[0].custom.f1 = 1;
  local.projects[0].custom.f1 = true;
  remote.projects[0].custom.f1 = 5;
  const merged = mergeWorkspaces(base, local, remote);
  assert(merged.conflicts.some(item => item.collection === 'fields'));
  assert.equal(merged.data.fields[0].type, 'checkbox');
  const chosenRemote = resolveWorkspaceConflicts(base, local, remote, 'remote');
  assert.equal(chosenRemote.fields[0].type, 'number');
  assert.equal(chosenRemote.projects[0].custom.f1, 5);
  const both = resolveWorkspaceConflicts(base, local, remote, 'both');
  const field = both.fields.find(item => item.id !== 'f1');
  assert.equal(field.type, 'number');
  assert.equal(both.fields[0].type, 'checkbox');
  assert.equal(both.projects[0].custom.f1, true);
  assert.equal(both.projects[0].custom[field.id], 5);
  valid(both);
});

test('first attach with null baseline detects same id with unrelated content', () => {
  const local = fixture(), remote = fixture();
  local.projects[0].title = '本机全新内容';
  remote.projects[0].description = '远端全新内容';
  const { data, conflicts } = mergeWorkspaces(null, local, remote);
  assert.equal(conflicts.filter(item => item.collection === 'projects').length, 1);
  assert.equal(data.projects[0].title, local.projects[0].title);
  assert.equal(data.projects[0].description, local.projects[0].description);
  assert.equal(conflicts[0].base, null);
  assert.equal(mergeWorkspaces(null, fixture(), fixture()).conflicts.length, 0);
  assert.deepEqual(mergeWorkspaces(null, emptyWorkspace(), remote).data, remote);
});

test('new conflicting task ids are explicit and all duplicate title/id limits hold', () => {
  const { base, local, remote } = versions();
  local.projects[0].title = '本'.repeat(200);
  remote.projects[0].title = '远'.repeat(200);
  local.projects[0].tasks.push({ id: 'same-new', title: '本地', done: false });
  remote.projects[0].tasks.push({ id: 'same-new', title: '远程', done: false });
  const merged = mergeWorkspaces(base, local, remote);
  assert.equal(merged.conflicts.length, 1);
  assert(merged.conflicts[0].reason.includes('新记录的编号相同'));
  const both = resolveWorkspaceConflicts(base, local, remote, 'both');
  assert(both.projects.every(project => project.title.length <= 200));
  valid(both);
});

test('safe custom keys including prototype names are preserved without pollution', () => {
  const { base, local, remote } = versions();
  local.projects[0].custom = JSON.parse('{"__proto__":"local","constructor":7}');
  remote.projects[0].custom = JSON.parse('{"prototype":true}');
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert.equal(conflicts.length, 0);
  assert.equal(Object.hasOwn(data.projects[0].custom, '__proto__'), true);
  assert.equal(data.projects[0].custom.__proto__, 'local');
  assert.equal(data.projects[0].custom.constructor, 7);
  assert.equal(data.projects[0].custom.prototype, true);
  assert.equal(Object.getPrototypeOf(data.projects[0].custom), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test('a custom field named updatedAt remains real user data', () => {
  const { base, local, remote } = versions();
  local.projects[0].custom.updatedAt = '本机值';
  remote.projects[0].custom.updatedAt = '云端值';
  assert.equal(equalData(base, local), false);
  assert.equal(equalData(local, remote), false);
  const merged = mergeWorkspaces(base, local, remote);
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.data.projects[0].custom.updatedAt, '本机值');
  assert.equal(merged.conflicts[0].remote.custom.updatedAt, '云端值');
});

test('input data and conflict payloads never alias the result', () => {
  const { base, local, remote } = versions();
  local.notes[0].body = '本机'; remote.notes[0].body = '远端';
  const originals = [base, local, remote].map(clone);
  const merged = mergeWorkspaces(base, local, remote);
  for (const choice of ['local', 'remote', 'both']) resolveWorkspaceConflicts(base, local, remote, choice);
  assert.deepEqual([base, local, remote], originals);
  merged.data.notes[0].body = '结果修改';
  merged.conflicts[0].remote.body = '冲突快照修改';
  assert.deepEqual([base, local, remote], originals);
});

test('non-finite custom values are rejected before merging', () => {
  const { base, local, remote } = versions();
  local.projects[0].custom.cost = Infinity;
  assert.throws(() => mergeWorkspaces(base, local, remote), /无效数字/);
  remote.projects[0].custom.cost = NaN;
  assert.throws(() => mergeWorkspaces(base, base, remote), /无效数字/);
});

import { validateData } from './data.js';
import { taskStatus } from './project-tasks.js';
import { defaultTemplates } from './note-templates.js';

const ABSENT = Symbol('absent');
const COLLECTIONS = ['projects', 'notes', 'fields', 'folders', 'templates'];
const owns = (value, key) => value != null && Object.hasOwn(value, key);
const at = (value, key) => owns(value, key) ? value[key] : ABSENT;
const byId = records => new Map(records.map(record => [record.id, record]));

// Object.fromEntries creates own properties even for keys such as __proto__.
// Never assign externally supplied keys to an object's prototype setter.
function copy(value, ancestors = new Set()) {
  if (value === ABSENT) return ABSENT;
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('同步数据包含无效数字。');
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new Error('同步数据包含循环引用。');
  ancestors.add(value);
  const result = Array.isArray(value)
    ? value.map(item => copy(item, ancestors))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item, ancestors)]));
  ancestors.delete(value);
  return result;
}

function equal(a, b, root = false, ignoreTimestamp = true) {
  if (Object.is(a, b)) return true;
  if (a === ABSENT || b === ABSENT || a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
  const keys = value => Object.keys(value).filter(key => !(ignoreTimestamp && key === 'updatedAt') && !(root && key === 'preferences')).sort();
  const ak = keys(a), bk = keys(b);
  return ak.length === bk.length && ak.every((key, index) => key === bk[index] && equal(a[key], b[key], false, key !== 'custom'));
}

/** Semantic equality: edit timestamps and device-local view preferences do not sync. */
export function equalData(a, b) { return equal(a, b, true); }

export function emptyWorkspace() {
  return { version: 1, projects: [], notes: [], fields: [], folders: [], templates: defaultTemplates(), preferences: { view: 'board', sort: 'updated', group: 'status' } };
}

function workspace(value) { return validateData(copy(value ?? emptyWorkspace())); }

function newestTimestamp(result, ...records) {
  const timestamps = records.filter(record => record && record !== ABSENT && typeof record.updatedAt === 'string').map(record => record.updatedAt);
  if (!timestamps.length || result === ABSENT) return result;
  const updatedAt = timestamps.reduce((latest, timestamp) => Date.parse(timestamp) > Date.parse(latest) ? timestamp : latest);
  return { ...result, updatedAt };
}

function mergeSet(base, local, remote) {
  const bs = new Set(base), ls = new Set(local), rs = new Set(remote);
  // Membership is a boolean, so independent additions and removals can merge.
  return [...new Set([...local, ...remote])].filter(item => bs.has(item) ? ls.has(item) && rs.has(item) : ls.has(item) || rs.has(item));
}

function runMerge(baseValue, localValue, remoteValue, choice) {
  const base = workspace(baseValue), local = workspace(localValue), remote = workspace(remoteValue);
  const maps = Object.fromEntries(COLLECTIONS.map(collection => [collection, { base: byId(base[collection]), local: byId(local[collection]), remote: byId(remote[collection]) }]));
  const conflictMap = new Map();

  function conflict(collection, id, reason) {
    const key = `${collection}:${id}`;
    const old = conflictMap.get(key);
    if (old) { if (!old.reason.split('；').includes(reason)) old.reason += `；${reason}`; return; }
    const versions = maps[collection];
    const b = versions.base.get(id), l = versions.local.get(id), r = versions.remote.get(id);
    conflictMap.set(key, {
      key, collection, id, title: l?.title || r?.title || b?.title || l?.name || r?.name || b?.name || id,
      local: l ? copy(l) : null, remote: r ? copy(r) : null, base: b ? copy(b) : null, reason,
    });
  }

  function scalar(b, l, r, onConflict) {
    if (equal(l, r)) return copy(l);
    if (equal(l, b)) return copy(r);
    if (equal(r, b)) return copy(l);
    onConflict();
    return copy(choice === 'remote' ? r : l);
  }

  function entity(b, l, r, collection, ownerId, path = '') {
    if (equal(l, r)) return newestTimestamp(copy(l), b, l, r);
    if (equal(l, b)) return newestTimestamp(copy(r), b, l, r);
    if (equal(r, b)) return newestTimestamp(copy(l), b, l, r);
    if (b === ABSENT || l === ABSENT || r === ABSENT) {
      conflict(collection, ownerId, b === ABSENT ? `新记录的编号相同，内容不同${path}` : `一端删除，另一端修改${path}`);
      const selected = choice === 'both' && (l === ABSENT || r === ABSENT) ? (l === ABSENT ? r : l) : choice === 'remote' ? r : l;
      return newestTimestamp(copy(selected), b, l, r);
    }
    const entries = [];
    for (const key of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b)])) {
      if (key === 'updatedAt') continue;
      // Completion and status describe one state; merging them separately can
      // produce an active task whose completion checkbox is still checked.
      if (collection === 'projects' && path.startsWith(' / 任务 ') && key === 'status') continue;
      const bv = at(b, key), lv = at(l, key), rv = at(r, key);
      let merged;
      if (collection === 'projects' && path.startsWith(' / 任务 ') && key === 'done') {
        const status = scalar(taskStatus(b), taskStatus(l), taskStatus(r), () => conflict(collection, ownerId, `任务状态在两端修改${path}`));
        merged = status === 'done';
        if ([b, l, r].some(task => owns(task, 'status'))) entries.push(['status', status]);
      } else if (collection === 'projects' && !path && key === 'modules') {
        const bm = byId(b.modules || []), lm = byId(l.modules || []), rm = byId(r.modules || []);
        merged = [...new Set([...lm.keys(), ...rm.keys(), ...bm.keys()])].map(id => entity(bm.get(id) ?? ABSENT, lm.get(id) ?? ABSENT, rm.get(id) ?? ABSENT, collection, ownerId, ` / 模块 ${id}`)).filter(module => module !== ABSENT);
      } else if (collection === 'projects' && !path && key === 'tasks') {
        const bm = byId(b.tasks), lm = byId(l.tasks), rm = byId(r.tasks);
        merged = [...new Set([...lm.keys(), ...rm.keys(), ...bm.keys()])].map(id => entity(bm.get(id) ?? ABSENT, lm.get(id) ?? ABSENT, rm.get(id) ?? ABSENT, collection, ownerId, ` / 任务 ${id}`)).filter(task => task !== ABSENT);
        const common = new Set(b.tasks.filter(task => lm.has(task.id) && rm.has(task.id)).map(task => task.id));
        const order = tasks => tasks.filter(task => common.has(task.id)).map(task => task.id);
        const bo = order(b.tasks), lo = order(l.tasks), ro = order(r.tasks);
        let preferred = l.tasks;
        if (!equal(lo, ro)) {
          if (equal(lo, bo)) preferred = r.tasks;
          else if (!equal(ro, bo)) {
            conflict(collection, ownerId, '任务顺序在两端修改');
            preferred = choice === 'remote' ? r.tasks : l.tasks;
          }
        }
        const positions = new Map(preferred.map((task, index) => [task.id, index]));
        merged.sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
      } else if (collection === 'projects' && !path && key === 'custom') {
        merged = Object.fromEntries([...new Set([...Object.keys(l.custom), ...Object.keys(r.custom), ...Object.keys(b.custom)])].map(id => [id, scalar(at(b.custom, id), at(l.custom, id), at(r.custom, id), () => conflict(collection, ownerId, `自定义字段在两端修改：${id}`))]).filter(([, value]) => value !== ABSENT));
      } else if (collection === 'notes' && (key === 'tags' || key === 'projectIds')) {
        merged = mergeSet(bv, lv, rv);
      } else {
        merged = scalar(bv, lv, rv, () => conflict(collection, ownerId, `同一字段在两端修改：${key}${path}`));
      }
      if (merged !== ABSENT) entries.push([key, merged]);
    }
    return newestTimestamp(Object.fromEntries(entries), b, l, r);
  }

  const data = { version: 1, preferences: copy(local.preferences) };
  for (const collection of COLLECTIONS) {
    const { base: bm, local: lm, remote: rm } = maps[collection];
    data[collection] = [...new Set([...lm.keys(), ...rm.keys(), ...bm.keys()])].map(id => entity(bm.get(id) ?? ABSENT, lm.get(id) ?? ABSENT, rm.get(id) ?? ABSENT, collection, id)).filter(record => record !== ABSENT);
  }

  // Project deletion also affects note links. Detect concurrent note changes even
  // when the set merge would otherwise remove the reference without a warning.
  for (const original of base.projects) {
    const lp = maps.projects.local.get(original.id), rp = maps.projects.remote.get(original.id);
    if (Boolean(lp) === Boolean(rp)) continue;
    const survivor = lp ? 'local' : 'remote';
    const competingNotes = [...maps.notes[survivor].values()].filter(note => note.projectIds.includes(original.id) && !equal(note, maps.notes.base.get(note.id) ?? ABSENT));
    if (competingNotes.length) {
      conflict('projects', original.id, '删除项目时，另一端修改了关联笔记');
      competingNotes.forEach(note => conflict('notes', note.id, '关联项目在另一端已删除'));
    }
    const keepProject = competingNotes.length ? choice === 'both' || choice === survivor : data.projects.some(project => project.id === original.id);
    if (keepProject) {
      if (!data.projects.some(project => project.id === original.id)) data.projects.push(copy(lp || rp));
      // If a project survives a deletion/edit conflict, retain the surviving
      // device's links too, including notes whose text was not edited.
      for (const note of maps.notes[survivor].values()) {
        if (!note.projectIds.includes(original.id)) continue;
        const mergedNote = data.notes.find(item => item.id === note.id);
        if (mergedNote && !mergedNote.projectIds.includes(original.id)) mergedNote.projectIds.push(original.id);
      }
    } else {
      data.projects = data.projects.filter(project => project.id !== original.id);
    }
  }

  // A field definition and its values form one relation. Deleting the
  // definition must not hide a concurrently entered value without a conflict.
  for (const original of base.fields) {
    const lf = maps.fields.local.get(original.id), rf = maps.fields.remote.get(original.id);
    if (lf && rf) {
      // A concurrent type conversion and value entry cannot be interpreted
      // safely as independent edits, even if the schema accepts both values.
      const localTypeChanged = lf.type !== original.type, remoteTypeChanged = rf.type !== original.type;
      if (localTypeChanged === remoteTypeChanged || lf.type === rf.type) continue;
      const valueSide = localTypeChanged ? 'remote' : 'local';
      const competingProjects = [...maps.projects[valueSide].values()].filter(project => !equal(at(project.custom, original.id), at(maps.projects.base.get(project.id)?.custom, original.id)));
      if (!competingProjects.length) continue;
      conflict('fields', original.id, '一端更改字段类型，另一端修改了字段值');
      const selectedSide = choice === 'remote' ? 'remote' : 'local';
      const selectedField = selectedSide === 'local' ? lf : rf;
      const field = data.fields.find(item => item.id === original.id);
      if (field) field.type = selectedField.type;
      for (const source of competingProjects) {
        conflict('projects', source.id, `字段类型在另一端已改变：${original.id}`);
        const project = data.projects.find(item => item.id === source.id);
        if (!project) continue;
        const value = at(maps.projects[selectedSide].get(source.id)?.custom, original.id);
        const values = new Map(Object.entries(project.custom));
        if (value === ABSENT) values.delete(original.id); else values.set(original.id, copy(value));
        project.custom = Object.fromEntries(values);
      }
      continue;
    }
    if (!lf && !rf) continue;
    const survivor = lf ? 'local' : 'remote';
    const projectsWithValues = [...maps.projects[survivor].values()].filter(project => owns(project.custom, original.id));
    const competingProjects = projectsWithValues.filter(project => !equal(project.custom[original.id], at(maps.projects.base.get(project.id)?.custom, original.id)));
    if (competingProjects.length) {
      conflict('fields', original.id, '删除字段时，另一端修改了字段值');
      competingProjects.forEach(project => conflict('projects', project.id, `关联字段在另一端已删除：${original.id}`));
    }
    const keepField = competingProjects.length ? choice === 'both' || choice === survivor : data.fields.some(field => field.id === original.id);
    if (keepField) {
      if (!data.fields.some(field => field.id === original.id)) data.fields.push(copy(lf || rf));
      for (const source of projectsWithValues) {
        const project = data.projects.find(item => item.id === source.id);
        if (project && !owns(project.custom, original.id)) project.custom = Object.fromEntries([...Object.entries(project.custom), [original.id, copy(source.custom[original.id])]]);
      }
    } else {
      data.fields = data.fields.filter(field => field.id !== original.id);
      for (const project of data.projects) project.custom = Object.fromEntries(Object.entries(project.custom).filter(([id]) => id !== original.id));
    }
  }

  const projectIds = new Set(data.projects.map(project => project.id));
  for (const project of data.projects) {
    const moduleIds = new Set((project.modules || []).map(module => module.id));
    for (const task of project.tasks) if (task.moduleId && !moduleIds.has(task.moduleId)) {
      conflict('projects', project.id, '任务所属模块在另一端已删除，任务已保留');
      task.moduleId = '';
    }
  }
  for (const note of data.notes) note.projectIds = note.projectIds.filter(id => projectIds.has(id));
  return { data, conflicts: [...conflictMap.values()], base, local, remote };
}

function checked(data) {
  if (data.projects.length > 3000 || data.notes.length > 10000 || data.fields.length > 30 || data.folders.length > 300 || data.templates.length > 100) throw new Error('合并后的记录数量超过工作区上限，请先导出备份并整理记录。');
  return validateData(copy(data));
}

/** A three-way merge never uses a timestamp to choose between competing edits. */
export function mergeWorkspaces(base, local, remote) {
  const merged = runMerge(base, local, remote, 'local');
  return { data: checked(merged.data), conflicts: merged.conflicts };
}

function duplicateTitle(title, max) {
  const suffix = '（冲突副本）';
  return `${title.slice(0, max - suffix.length)}${suffix}`;
}

function idFactory(records) {
  const used = new Set(records.map(record => record.id));
  return source => {
    let index = 1, id;
    do { id = `${source.slice(0, 80)}~conflict${index === 1 ? '' : `-${index}`}`; index += 1; } while (used.has(id));
    used.add(id);
    return id;
  };
}

/** Resolve only competing edits. Safe changes from both devices remain merged. */
export function resolveWorkspaceConflicts(base, local, remote, choice) {
  if (!['local', 'remote', 'both'].includes(choice)) throw new Error('请选择本机、云端或保留两份。');
  const merged = runMerge(base, local, remote, choice);
  const { data, conflicts } = merged;
  if (choice !== 'both') return checked(data);
  const newIds = Object.fromEntries(COLLECTIONS.map(collection => [collection, idFactory([...data[collection], ...merged.local[collection], ...merged.remote[collection]])]));
  const projectRemap = new Map(), fieldRemap = new Map();
  const duplicates = conflicts.filter(conflict => conflict.local && conflict.remote && !equal(conflict.local, conflict.remote));

  for (const conflict of duplicates.filter(item => item.collection === 'templates')) {
    data.templates.push({ ...copy(conflict.remote), id: newIds.templates(conflict.id), title: duplicateTitle(conflict.remote.title, 200) });
  }

  for (const conflict of duplicates.filter(item => item.collection === 'folders')) {
    data.folders.push({ ...copy(conflict.remote), id: newIds.folders(conflict.id) });
  }

  for (const conflict of duplicates.filter(item => item.collection === 'fields')) {
    const id = newIds.fields(conflict.id);
    fieldRemap.set(conflict.id, id);
    data.fields.push({ ...copy(conflict.remote), id, name: duplicateTitle(conflict.remote.name, 40) });
  }

  // Each definition keeps the corresponding device's values. A remote numeric
  // field renamed concurrently must not overwrite the local field's meaning.
  const localProjects = byId(merged.local.projects), remoteProjects = byId(merged.remote.projects);
  for (const project of data.projects) {
    const values = new Map(Object.entries(project.custom));
    for (const [oldId, newId] of fieldRemap) {
      const localCustom = localProjects.get(project.id)?.custom;
      const remoteCustom = remoteProjects.get(project.id)?.custom;
      if (owns(localCustom, oldId)) values.set(oldId, copy(localCustom[oldId])); else values.delete(oldId);
      if (owns(remoteCustom, oldId)) values.set(newId, copy(remoteCustom[oldId]));
    }
    project.custom = Object.fromEntries(values);
  }

  for (const conflict of duplicates.filter(item => item.collection === 'projects')) {
    const id = newIds.projects(conflict.id);
    projectRemap.set(conflict.id, id);
    const project = copy(conflict.remote);
    project.id = id;
    project.title = duplicateTitle(project.title, 200);
    project.custom = Object.fromEntries(Object.entries(project.custom).map(([key, value]) => [fieldRemap.get(key) || key, value]));
    const taskId = idFactory(project.tasks);
    project.tasks = project.tasks.map(task => ({ ...task, id: taskId(task.id) }));
    data.projects.push(project);
  }

  const noteDuplicates = new Map(duplicates.filter(item => item.collection === 'notes').map(item => [item.id, item.remote]));
  for (const note of merged.remote.notes) {
    if (note.projectIds.some(id => projectRemap.has(id))) noteDuplicates.set(note.id, note);
  }
  const existingProjects = new Set(data.projects.map(project => project.id));
  for (const note of noteDuplicates.values()) {
    data.notes.push({
      ...copy(note), id: newIds.notes(note.id), title: duplicateTitle(note.title, 200),
      projectIds: [...new Set(note.projectIds.map(id => projectRemap.get(id) || id))].filter(id => existingProjects.has(id)),
    });
  }
  return checked(data);
}

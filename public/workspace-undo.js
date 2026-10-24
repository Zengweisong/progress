// Keep only the fields changed by an operation, so undo preserves later edits.
const equal = (a, b) => JSON.stringify(a, (key, value) => key === 'updatedAt' ? undefined : value) === JSON.stringify(b, (key, value) => key === 'updatedAt' ? undefined : value);
const records = value => Array.isArray(value) && value.every(item => item && typeof item.id === 'string');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const conflict = () => { throw new Error('相关内容已发生变化，无法撤销这一步。'); };

export function workspaceChange(before, after) {
  const patches = [];
  function diff(a, b, path) {
    if (equal(a, b)) return;
    if (records(a) && records(b)) {
      const old = new Map(a.map(item => [item.id, item])), next = new Map(b.map(item => [item.id, item]));
      for (const id of new Set([...old.keys(), ...next.keys()])) diff(old.get(id), next.get(id), [...path, { id }]);
      const from = a.map(item => item.id), to = b.map(item => item.id);
      if (!equal(from, to)) patches.push({ path, before: from, after: to, order: true });
    } else if (object(a) && object(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) if (key !== 'updatedAt') diff(a[key], b[key], [...path, key]);
      if (a.updatedAt !== b.updatedAt) patches.push({ path: [...path, 'updatedAt'], before: a.updatedAt, after: b.updatedAt, timestamp: true });
    } else patches.push({ path, before: structuredClone(a), after: structuredClone(b) });
  }
  diff(before, after, []);
  return patches;
}

function valueAt(data, path) {
  return path.reduce((value, key) => typeof key === 'object' ? value?.find(item => item.id === key.id) : value?.[key], data);
}

export function undoWorkspaceChange(data, patches) {
  // Validate the complete inverse before applying any of it.
  for (const patch of patches) {
    if (patch.timestamp) continue;
    const value = valueAt(data, patch.path);
    if (patch.order) {
      if (!records(value) || !equal(value.filter(item => patch.after.includes(item.id)).map(item => item.id), patch.after)) conflict();
    } else if (!equal(value, patch.after)) conflict();
  }
  const next = structuredClone(data);
  for (const patch of patches) {
    // Restore the previous sort-by-update position only if no later edit changed
    // its timestamp. Sync detects content changes independently of timestamps.
    if (patch.timestamp && valueAt(data, patch.path) !== patch.after) continue;
    const parent = valueAt(next, patch.path.slice(0, -1)), key = patch.path.at(-1);
    if (!parent) conflict();
    if (patch.order) {
      const array = valueAt(next, patch.path), previous = patch.before.map(id => array.find(item => item.id === id)).filter(Boolean);
      const ids = new Set(patch.before); let slot = 0;
      array.forEach((item, index) => { if (ids.has(item.id)) array[index] = previous[slot++]; });
    } else if (typeof key === 'object') {
      const index = parent.findIndex(item => item.id === key.id);
      if (patch.before === undefined) parent.splice(index, 1);
      else if (index < 0) parent.push(structuredClone(patch.before));
      else parent[index] = structuredClone(patch.before);
    } else if (patch.before === undefined) delete parent[key];
    else parent[key] = structuredClone(patch.before);
  }
  return next;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { mergeWorkspaces } from '../public/sync-merge.js';

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

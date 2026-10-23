import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { categoryRecords, isNoteFavorite } from '../public/categories.js';
import { mergeWorkspaces } from '../public/sync-merge.js';

test('legacy inbox notes remain in favorites and every note stays in the knowledge library', () => {
  const data = seedData(), legacy = data.notes.find(note => note.inbox);
  assert.equal(isNoteFavorite(legacy), true);
  assert.equal(categoryRecords(data, 'knowledge').length, data.notes.length);
  assert.ok(categoryRecords(data, 'inbox').includes(legacy));
  legacy.favorite = false;
  assert.equal(isNoteFavorite(legacy), false);
  assert.ok(!categoryRecords(data, 'inbox').includes(legacy));
  assert.ok(categoryRecords(data, 'knowledge').includes(legacy));
});

test('favorite state survives backup and validates independently of the legacy inbox flag', () => {
  const data = seedData();
  data.notes[0].favorite = true;
  const restored = validateData(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.notes[0].favorite, true);
  assert.equal(restored.notes.length, data.notes.length);
  assert.strictEqual(categoryRecords(restored, 'inbox')[0], restored.notes[0]);
  restored.notes[0].favorite = 'yes';
  assert.throws(() => validateData(restored));
});

test('starring a note merges with a concurrent body edit without duplicating the note', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  local.notes[0].favorite = true;
  remote.notes[0].body = '另一台设备编辑的正文';
  const merged = mergeWorkspaces(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.data.notes.length, base.notes.length);
  assert.equal(merged.data.notes[0].favorite, true);
  assert.equal(merged.data.notes[0].body, '另一台设备编辑的正文');
});

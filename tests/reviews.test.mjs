import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData, validateData } from '../public/data.js';
import { weekStart, reviewPeriod } from '../public/reviews.js';
import { mergeWorkspaces, resolveWorkspaceConflicts } from '../public/sync-merge.js';

const record = () => ({ id: 'review-1', mode: 'daily', date: '2026-11-04', title: '每日复盘', values: { event: '讨论方案', feeling: '紧张' }, updatedAt: '2026-11-04T01:00:00Z' });
test('review periods cross month and year boundaries with Monday weeks', () => {
  assert.equal(weekStart('2027-01-03'), '2026-12-28');
  assert.equal(weekStart('2026-11-02'), '2026-11-02');
  assert.equal(reviewPeriod('monthly', '2026-11-04'), '2026');
});
test('legacy backups load, review content round trips and malformed reviews are rejected', () => {
  const data = seedData(); delete data.reviews;
  assert.deepEqual(validateData(data).reviews, []);
  data.reviews.push(record());
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))).reviews, data.reviews);
  for (const patch of [{ date: '2026-02-30' }, { mode: 'unknown' }, { values: { event: 42 } }, { values: { unknown: 'text' } }]) {
    const invalid = structuredClone(data); Object.assign(invalid.reviews[0], patch);
    assert.throws(() => validateData(invalid));
  }
});
test('independent canvas edits merge and conflicting reviews can retain both copies', () => {
  const base = seedData(); base.reviews.push(record());
  const local = structuredClone(base), remote = structuredClone(base);
  local.reviews[0].values.feeling = '逐渐放松'; remote.reviews[0].values.next = '先准备提纲';
  const merged = mergeWorkspaces(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.data.reviews[0].values.feeling, '逐渐放松');
  assert.equal(merged.data.reviews[0].values.next, '先准备提纲');
  remote.reviews[0].values.feeling = '依然紧张';
  const both = resolveWorkspaceConflicts(base, local, remote, 'both');
  assert.equal(both.reviews.length, 2);
  assert.equal(new Set(both.reviews.map(r => r.id)).size, 2);
  assert.doesNotThrow(() => validateData(both));
});

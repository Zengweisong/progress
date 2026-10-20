import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays, dateValue, parseDate, shiftMonth } from '../public/date-picker.js';

test('calendar dates round trip leap days and early years without accepting invalid dates', () => {
  for (const value of ['0001-01-01', '0099-12-31', '2024-02-29', '2026-10-20', '9999-12-31']) assert.equal(dateValue(parseDate(value)), value);
  for (const value of ['', '2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '2026-1-01']) assert.equal(parseDate(value), null);
});

test('six-week calendar starts on Monday and month navigation respects year boundaries', () => {
  const days = calendarDays(2026, 9);
  assert.equal(days.length, 42);
  assert.equal(days[0].value, '2026-09-28');
  assert.equal(days.at(-1).value, '2026-11-08');
  assert.equal(days.filter(day => !day.outside).length, 31);
  assert.deepEqual(shiftMonth(2026, 0, -1), [2025, 11]);
  assert.deepEqual(shiftMonth(2026, 11, 1), [2027, 0]);
  assert.deepEqual(shiftMonth(1, 0, -1), [1, 0]);
  assert.deepEqual(shiftMonth(9999, 11, 1), [9999, 11]);
});

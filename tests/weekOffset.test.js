import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { parseWeekOffset } from '$lib/server/weekOffset';

describe('parseWeekOffset', () => {
  test('valid integers', () => {
    assert.equal(parseWeekOffset('0'), 0);
    assert.equal(parseWeekOffset('1'), 1);
    assert.equal(parseWeekOffset('-3'), -3);
    assert.equal(parseWeekOffset('10'), 10);
  });
  test('fractional -> 0', () => {
    assert.equal(parseWeekOffset('1.5'), 0);
    assert.equal(parseWeekOffset('0.1'), 0);
    assert.equal(parseWeekOffset('-2.7'), 0);
  });
  test('NaN -> 0', () => {
    assert.equal(parseWeekOffset('NaN'), 0);
    assert.equal(parseWeekOffset('abc'), 0);
    assert.equal(parseWeekOffset('12abc'), 0);
  });
  test('Infinity -> 0', () => {
    assert.equal(parseWeekOffset('Infinity'), 0);
    assert.equal(parseWeekOffset('-Infinity'), 0);
  });
  test('empty string -> 0', () => {
    assert.equal(parseWeekOffset(''), 0);
    assert.equal(parseWeekOffset('   '), 0);
  });
  test('missing (null) -> 0', () => {
    assert.equal(parseWeekOffset(null), 0);
  });
  test('unsafe integers -> 0', () => {
    assert.equal(parseWeekOffset('1e308'), 0);
    assert.equal(parseWeekOffset('-1e308'), 0);
    assert.equal(parseWeekOffset(String(Number.MAX_SAFE_INTEGER + 1)), 0);
    assert.equal(parseWeekOffset(String(Number.MIN_SAFE_INTEGER - 1)), 0);
    assert.equal(parseWeekOffset('9007199254740992'), 0);
    assert.equal(parseWeekOffset('-9007199254740992'), 0);
  });
});

describe('vancouver wall-day helpers (server-TZ independent)', () => {
  test('addWallDays / wallDayIso are pure calendar math', async () => {
    const { addWallDays, wallDayIso } = await import('$lib/server/weekOffset');
    assert.deepEqual(addWallDays({ year: 2026, month: 9, day: 4 }, 1), { year: 2026, month: 9, day: 5 });
    assert.deepEqual(addWallDays({ year: 2026, month: 9, day: 4 }, -4), { year: 2026, month: 8, day: 31 });
    assert.deepEqual(addWallDays({ year: 2026, month: 12, day: 31 }, 1), { year: 2027, month: 1, day: 1 });
    assert.equal(wallDayIso({ year: 2026, month: 9, day: 5 }), '2026-09-05');
  });
  test('vancouverDayRange covers exactly the wall day', async () => {
    const mod = await import('$lib/server/weekOffset');
    const db = await import('$lib/server/db');
    const { start, end } = mod.vancouverDayRange({ year: 2026, month: 9, day: 5 });
    assert.equal(end - start, 86400);
    const ps = db.getVancouverParts(start);
    assert.deepEqual([ps.year, ps.month, ps.day, ps.hour, ps.minute], [2026, 9, 5, 0, 0]);
    const pe = db.getVancouverParts(end - 1);
    assert.deepEqual([pe.year, pe.month, pe.day], [2026, 9, 5]);
    const pn = db.getVancouverParts(end);
    assert.deepEqual([pn.year, pn.month, pn.day, pn.hour], [2026, 9, 6, 0]);
  });
  test('DST boundaries: 23h spring-forward, 25h fall-back (US 2026)', async () => {
    const mod = await import('$lib/server/weekOffset');
    const spring = mod.vancouverDayRange({ year: 2026, month: 3, day: 8 });
    assert.equal(spring.end - spring.start, 23 * 3600);
    const fall = mod.vancouverDayRange({ year: 2026, month: 11, day: 1 });
    assert.equal(fall.end - fall.start, 25 * 3600);
  });
});

import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { parseWeekOffset, startOfDayLocal } from '$lib/server/weekOffset';

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

describe('week base helpers', () => {
  test('startOfDayLocal is local midnight, same date', () => {
    const base = startOfDayLocal(new Date(2026, 8, 4, 15, 30, 45, 123));
    assert.equal(base.getFullYear(), 2026);
    assert.equal(base.getMonth(), 8);
    assert.equal(base.getDate(), 4);
    assert.equal(base.getHours(), 0);
    assert.equal(base.getMinutes(), 0);
    assert.equal(base.getSeconds(), 0);
    assert.equal(base.getMilliseconds(), 0);
  });
  test('rolling base: offset weeks shift by exactly 7 days', () => {
    const now = new Date(2026, 8, 4, 9, 0, 0);
    for (const w of [-1, 0, 1, 2]) {
      const base = startOfDayLocal(now);
      base.setDate(base.getDate() + w * 7);
      const expected = new Date(2026, 8, 4);
      expected.setDate(expected.getDate() + w * 7);
      assert.equal(base.getTime(), expected.getTime());
    }
  });
});

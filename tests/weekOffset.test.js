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

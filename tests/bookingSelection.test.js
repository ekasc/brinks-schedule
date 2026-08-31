import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeDuration, normalizeTechSelection } from '$lib/server/bookingSelection';

describe('normalizeDuration', () => {
  test('accepts only 60, 90, 120', () => {
    assert.equal(normalizeDuration('60'), 60);
    assert.equal(normalizeDuration('90'), 90);
    assert.equal(normalizeDuration('120'), 120);
  });
  test('falls back to 90 for invalid', () => {
    assert.equal(normalizeDuration(null), 90);
    assert.equal(normalizeDuration(''), 90);
    assert.equal(normalizeDuration('45'), 90);
    assert.equal(normalizeDuration('NaN'), 90);
    assert.equal(normalizeDuration('abc'), 90);
    assert.equal(normalizeDuration('90.5'), 90);
    assert.equal(normalizeDuration('-60'), 90);
    assert.equal(normalizeDuration('999'), 90);
  });
});

describe('normalizeTechSelection', () => {
  test('returns active id when valid', () => {
    assert.equal(normalizeTechSelection('2', [1, 2, 3]), 2);
  });
  test('falls back for invalid', () => {
    assert.equal(normalizeTechSelection('999', [1, 2]), 1);
    assert.equal(normalizeTechSelection('NaN', [1, 2]), 1);
    assert.equal(normalizeTechSelection('', [1, 2]), 1);
    assert.equal(normalizeTechSelection(null, [1, 2]), 1);
    assert.equal(normalizeTechSelection('1.5', [1, 2]), 1);
    assert.equal(normalizeTechSelection('-1', [1, 2]), 1);
    assert.equal(normalizeTechSelection('2', []), 0);
    assert.equal(normalizeTechSelection(null, []), 0);
  });
  test('inactive id not in active list falls back', () => {
    assert.equal(normalizeTechSelection('99', [1, 2, 3]), 1);
  });
});

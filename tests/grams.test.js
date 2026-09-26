/**
 * Gram weights keep five decimals on the screens, as they do on the server.
 *
 *   node --test tests/grams.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAM_STEP, formatGrams, roundGrams } from '../src/utils/grams.js';

test('a weight is rounded to five decimals, never two or three', () => {
  assert.equal(roundGrams(12.345671), 12.34567);
  assert.equal(roundGrams(33 * 1.18), 38.94);
  assert.equal(roundGrams(0.000014), 0.00001);
});

test('a weight reads as typed, without trailing zeros', () => {
  assert.equal(formatGrams(33), '33 g');
  assert.equal(formatGrams(38.94), '38.94 g');
  assert.equal(formatGrams(12.34567), '12.34567 g');
  assert.equal(formatGrams(null), '—');
});

test('the inputs accept five decimals', () => {
  assert.equal(GRAM_STEP, '0.00001');
  assert.equal(Number(GRAM_STEP), 0.00001);
});

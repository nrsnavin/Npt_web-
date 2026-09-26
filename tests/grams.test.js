/**
 * Gram weights keep five decimals on the screens, as they do on the server.
 *
 *   node --test tests/grams.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAM_STEP, cutGrams, formatGrams } from '../src/utils/grams.js';

test('a weight is cut at five decimals, never rounded', () => {
  assert.equal(cutGrams(1.234567), 1.23456, 'rounding would say 1.23457');
  assert.equal(cutGrams(1.23457 * 1.1), 1.35802, '1.358027 g cut, as the server cuts it');
  assert.equal(cutGrams(1.23456), 1.23456, 'an exact five-decimal weight is left alone');
  assert.equal(cutGrams(33 * 1.18), 38.94);
  assert.equal(cutGrams(0.0000075), 0);
});

test('a weight reads as typed, without trailing zeros', () => {
  assert.equal(formatGrams(33), '33 g');
  assert.equal(formatGrams(38.94), '38.94 g');
  assert.equal(formatGrams(12.34567), '12.34567 g');
  assert.equal(formatGrams(12.345679), '12.34567 g', 'cut, not rounded to 12.34568');
  assert.equal(formatGrams(null), '—');
});

test('the inputs accept five decimals', () => {
  assert.equal(GRAM_STEP, '0.00001');
  assert.equal(Number(GRAM_STEP), 0.00001);
});

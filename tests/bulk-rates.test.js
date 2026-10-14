/**
 * The material bulk price update [src/utils/bulkRates.js].
 *
 *   node --test tests/bulk-rates.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { changedRates, invalidRates, moveOf } from '../src/utils/bulkRates.js';

const rows = [
  { _id: 'pp', ratePerKg: 96 },
  { _id: 'hips', ratePerKg: 118 },
  { _id: 'abs', ratePerKg: 160 },
];

test('only typed prices that move are sent', () => {
  assert.deepEqual(changedRates(rows, { pp: '101.5', hips: '118', abs: '' }), [{ id: 'pp', ratePerKg: 101.5 }]);
  assert.deepEqual(changedRates(rows, {}), [], 'blank leaves every price alone');
  assert.deepEqual(changedRates(rows, { pp: ' 99 ' }), [{ id: 'pp', ratePerKg: 99 }]);
});

test('zero, negative or text is not a price', () => {
  assert.deepEqual(changedRates(rows, { pp: '0', hips: '-5', abs: 'abc' }), []);
  assert.deepEqual(invalidRates({ pp: '0', hips: '-5', abs: 'abc', x: '', y: '12' }).sort(), ['abs', 'hips', 'pp']);
});

test('the move is shown as a percentage of the old price', () => {
  assert.equal(moveOf(96, 101.5), 5.7);
  assert.equal(moveOf(160, 152), -5);
  assert.equal(moveOf(0, 10), null);
  assert.equal(moveOf(96, ''), null);
});

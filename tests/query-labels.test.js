/**
 * The label editor says what the server will refuse, before the save.
 *
 *   node --test tests/query-labels.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { labelProblem, normaliseLabel } from '../src/utils/labels.js';

test('a label is stored trimmed, single-spaced and lower case, as the server stores it', () => {
  assert.equal(normaliseLabel('  Payment   Follow-up '), 'payment follow-up');
});

test('the editor refuses what the server refuses', () => {
  assert.match(labelProblem('a'), /two characters/);
  assert.match(labelProblem('x'.repeat(31)), /30 characters/);
  assert.match(labelProblem('<b>'), /letters, numbers/);
  assert.match(labelProblem('quality', ['quality']), /already/);
  assert.match(labelProblem('six', ['a1', 'b2', 'c3', 'd4', 'e5']), /at most 5/);
  assert.equal(labelProblem('diwali rush', ['quality']), null);
  assert.equal(labelProblem('கூடுதல்'), null, 'a label in Tamil is refused');
});

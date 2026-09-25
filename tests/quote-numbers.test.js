/**
 * The quote numbering form says what the server will say, before anything is sent.
 *
 *   node --test tests/quote-numbers.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatQuoteNumber, numberingProblem } from '../src/utils/quoteNumbers.js';

const sequence = { lowestAllowed: 43, lastIssued: 'NP/26-27/042' };

test('numbers are written the plant’s way, three digits and more when needed', () => {
  assert.equal(formatQuoteNumber('26-27', 7), 'NP/26-27/007');
  assert.equal(formatQuoteNumber('26-27', 1234), 'NP/26-27/1234');
});

test('the next number must be a whole number above every one already on a quote', () => {
  assert.equal(numberingProblem('43', sequence), null);
  assert.equal(numberingProblem('500', sequence), null, 'moving on is fine');
  assert.match(numberingProblem('42', sequence), /NP\/26-27\/042 is already on a quote — the next can be 43 or higher/);
  assert.match(numberingProblem('', sequence), /Give the number/);
  assert.match(numberingProblem('4.5', sequence), /whole number/);
  assert.match(numberingProblem('abc', sequence), /whole number/);
  assert.match(numberingProblem('0', { lowestAllowed: 1, lastIssued: null }), /start at 1/);
  assert.match(numberingProblem('100000', sequence), /more quotes/);
});

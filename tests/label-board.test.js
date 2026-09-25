/**
 * The query board: a column per label, and what dragging between them asks for.
 *
 *   node --test tests/label-board.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNLABELLED, boardColumns, moveRequests } from '../src/utils/labelBoard.js';

const rows = [
  { _id: 'a', labels: ['quality'] },
  { _id: 'b', labels: ['quality', 'lorry'] },
  { _id: 'c', labels: [] },
  { _id: 'd', labels: ['gone'] },
];
const labels = [{ label: 'quality', count: 2 }, { label: 'lorry', count: 1 }];

test('a query shows under every label it carries, and the rest under No label', () => {
  const columns = boardColumns(rows, labels);
  const ids = Object.fromEntries(columns.map((column) => [column.key, column.rows.map((row) => row._id)]));
  assert.deepEqual(ids[UNLABELLED], ['c', 'd'], 'a query whose only label has no column vanished');
  assert.deepEqual(ids.quality, ['a', 'b']);
  assert.deepEqual(ids.lorry, ['b']);
  assert.equal(columns[0].key, UNLABELLED, 'No label is not the first column');
});

test('a move takes the old label off and puts the new one on, in that order', () => {
  assert.deepEqual(moveRequests(['a'], 'quality', 'lorry'), [
    { ids: ['a'], remove: 'quality' },
    { ids: ['a'], add: 'lorry' },
  ]);
  assert.deepEqual(moveRequests(['c'], UNLABELLED, 'lorry'), [{ ids: ['c'], add: 'lorry' }]);
  assert.deepEqual(moveRequests(['a'], 'quality', UNLABELLED), [{ ids: ['a'], remove: 'quality' }]);
  assert.deepEqual(moveRequests(['a'], 'quality', 'quality'), [], 'a drop on its own column did something');
});

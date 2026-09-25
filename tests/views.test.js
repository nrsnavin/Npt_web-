/**
 * A saved view opens as a link carrying only the filters that were set.
 *
 *   node --test tests/views.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { viewHref, viewParams } from '../src/utils/views.js';

test('only the filters that are set are kept, in a stable order', () => {
  assert.deepEqual(viewParams({ status: 'open', q: '', tagged: 'me', person: undefined, label: 'quality' }), {
    label: 'quality', status: 'open', tagged: 'me',
  });
});

test('a view opens its own list with its filters in the address', () => {
  assert.equal(viewHref({ page: 'queries', params: { tagged: 'me', status: 'open' } }), '/queries?status=open&tagged=me');
  assert.equal(viewHref({ page: 'samples', params: {} }), '/samples');
  assert.equal(viewHref({ page: 'queries', params: { q: 'short & broken' } }), '/queries?q=short+%26+broken');
});

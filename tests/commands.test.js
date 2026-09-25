/**
 * The command bar's grammar: what typing gets you, and what it never offers.
 *
 *   node --test tests/commands.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAction, queryRef, suggestCommands } from '../src/utils/commands.js';

const ids = (list) => list.map((entry) => entry.id);

test('a query can be named the way people say it', () => {
  assert.deepEqual(queryRef('QRY-2026-0006'), { exact: 'QRY-2026-0006' });
  assert.deepEqual(queryRef('qry-6'), { tail: '0006' });
  assert.deepEqual(queryRef('#12'), { tail: '0012' });
  assert.deepEqual(queryRef('6'), { tail: '0006' });
  assert.equal(queryRef('quality'), null);
});

test('actions read as verb, query, then the rest', () => {
  assert.deepEqual(parseAction('label QRY-6 payment follow-up'), { verb: 'label', ref: { tail: '0006' }, rest: 'payment follow-up' });
  assert.equal(parseAction('label quality'), null, 'a label with no query is not an action');
  assert.equal(parseAction('delete QRY-6'), null, 'a verb the bar does not know is not guessed at');
});

test('labelling says what it will do, and refuses what the server refuses', () => {
  const [ok] = suggestCommands('label QRY-6 Quality');
  assert.equal(ok.title, 'Label QRY-…0006 #quality');
  assert.equal(ok.disabled, false);
  const [bad] = suggestCommands('label 6 x');
  assert.equal(bad.disabled, true);
  assert.match(bad.hint, /two characters/);
});

test('urgent is only offered to an administrator', () => {
  assert.deepEqual(suggestCommands('urgent 6'), []);
  assert.equal(suggestCommands('urgent 6', { isAdmin: true })[0].run.type, 'urgent');
});

test('pages and forms follow the person’s access', () => {
  const reader = { canRead: (key) => key !== 'pricing', canWrite: (key) => key === 'queries' };
  const all = ids(suggestCommands('new', reader));
  assert.ok(all.includes('new-query'), 'somebody who can read queries can ask one');
  assert.ok(!all.includes('new-sample'), 'a form they cannot save was offered');
  assert.ok(!ids(suggestCommands('costing', reader)).includes('go-pricings'), 'a page they cannot open was offered');
  assert.ok(ids(suggestCommands('sam')).includes('go-samples'));
  assert.ok(ids(suggestCommands('new sample')).includes('new-sample'));
});

test('an empty bar offers a few everyday things, not everything', () => {
  const start = suggestCommands('');
  assert.ok(start.length > 0 && start.length <= 5);
  assert.ok(ids(start).includes('new-query'));
});

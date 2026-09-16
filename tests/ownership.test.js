/**
 * Whose records a screen may offer an action on [BLUEPRINT §29].
 *
 * The server decides this and nothing here grants anything: a screen that answered `true` too
 * freely would still be refused at the door. What this helper is for is the other direction —
 * a button offered on a record the door will refuse, which is a promise the software cannot
 * keep. The costings register offered marketing "Raise a quote" on every approved sheet,
 * including the accounts a colleague works, and the refusal arrived after the quote form had
 * been filled in.
 *
 *   node --test tests/ownership.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { isOwnershipScoped, ownsRecord } from '../src/utils/pipeline.js';

const nandhini = { id: 'u-nandhini', department: 'marketing', role: 'member' };
const arun = { id: 'u-arun', department: 'marketing', role: 'member' };

test('marketing is scoped and nobody else is', () => {
  assert.equal(isOwnershipScoped(nandhini), true);
  for (const department of ['sampling', 'production', 'despatch', 'quality', 'management']) {
    assert.equal(
      isOwnershipScoped({ id: 'u', department, role: 'member' }),
      false,
      `${department} is competing for nobody's customers and must see its whole module`
    );
  }
});

test('an admin is never scoped, whatever department they sit in', () => {
  assert.equal(isOwnershipScoped({ id: 'u', department: 'marketing', role: 'admin' }), false);
});

/**
 * The session user is serialised with `id` and records carry Mongo's `_id`.
 *
 * Reading only `_id` off the user compared a blank against an id, so every row failed — and the
 * register told Nandhini her own buyers belonged to somebody else, by name. A rule that fails
 * closed is still a rule that lies, and this is the assertion that would have caught it.
 */
test('the user’s id is matched however it is spelled', () => {
  const hers = { assignedTo: { _id: 'u-nandhini', name: 'Nandhini S' } };

  assert.equal(ownsRecord(nandhini, hers), true, 'session `id` against record `_id`');
  assert.equal(ownsRecord({ ...nandhini, _id: 'u-nandhini', id: undefined }, hers), true);
  /* And an unpopulated reference, which is what a lean list row carries. */
  assert.equal(ownsRecord(nandhini, { assignedTo: 'u-nandhini' }), true);
});

test('a colleague’s buyer is not yours', () => {
  const his = { assignedTo: { _id: 'u-arun', name: 'Arun K' } };

  assert.equal(ownsRecord(nandhini, his), false);
  assert.equal(ownsRecord(arun, his), true);
});

/** Everyone unscoped passes, which is what lets one component serve every reader. */
test('an unscoped reader owns everything', () => {
  const his = { assignedTo: { _id: 'u-arun', name: 'Arun K' } };
  assert.equal(ownsRecord({ id: 'u-md', department: 'management', role: 'member' }, his), true);
  assert.equal(ownsRecord({ id: 'u-boss', department: 'marketing', role: 'admin' }, his), true);
});

/**
 * Two blanks are not a match.
 *
 * A record with no owner does not reach a scoped reader — the server's filter pins `assignedTo`
 * — so one arriving here means something is wrong, and answering "yours" would offer a step the
 * door refuses. The same goes for a user with no id at all, which is what a half-loaded session
 * looks like.
 */
test('nothing matches nothing', () => {
  assert.equal(ownsRecord(nandhini, {}), false, 'an unowned record');
  assert.equal(ownsRecord(nandhini, { assignedTo: null }), false);
  assert.equal(
    ownsRecord({ department: 'marketing', role: 'member' }, { assignedTo: null }),
    false,
    'a session with no id yet'
  );
});

/** The field is a parameter because ownership hangs off different names on different records. */
test('another owner field can be named', () => {
  const row = { raisedBy: { _id: 'u-nandhini' }, assignedTo: { _id: 'u-arun' } };
  assert.equal(ownsRecord(nandhini, row, 'raisedBy'), true);
  assert.equal(ownsRecord(nandhini, row), false);
});

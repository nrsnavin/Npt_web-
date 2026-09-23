/**
 * The two honesty rules the query screens carry, guarded as source.
 *
 * Both are things that cannot be caught by rendering the component, because the failure is not
 * a broken screen — it is a working screen that tells somebody the wrong thing, quietly, and
 * keeps doing it. There is no JSX loader here, so these read the files as text and ask one
 * question of each, which is the same bargain `component-references.test.js` makes.
 *
 *   node --test tests/query-screens.test.js
 *
 * **A priority always says whose it is.** The urgency chip on the list is either the rules
 * counting hours off the record or a model reading the words, and the two are not the same kind
 * of claim. An unlabelled chip reads as the plant's own judgement about a colleague's work.
 *
 * **A draft is never a message.** What the model writes goes into the box the person was
 * already typing in and becomes theirs; the only thing that reaches the thread is what somebody
 * pressed send on. The server holds that line too — nothing is stored either side — but the
 * screen is where it would be crossed, by an edit that looked like a convenience.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('the urgency chip says which reading it is', () => {
  const list = source('pages/Queries.jsx');

  assert.match(list, /reading\.readBy === 'model'/, 'the chip branches on where it came from');
  assert.match(list, /Read by the model/);
  assert.match(list, /From the record/);
  /* And the sentence behind it, because a level with no account is one people learn to skip. */
  assert.match(list, /reading\.why/);
});

test('the model is asked about the rows only where there is a model', () => {
  const list = source('pages/Queries.jsx');

  assert.match(list, /useModelReadings\(data, Boolean\(can\.readUrgency\)\)/);
  /* The rows are coloured before it is asked, so a page is never partly blank while it waits. */
  assert.match(list, /readings\[row\._id\] \|\| row\.urgency/);
});

test('a drafted reply is offered, never sent', () => {
  const detail = source('pages/QueryDetail.jsx');

  /* The draft's one destination is the composer's own state. */
  assert.match(detail, /setBody\(drafted\.draft\)/);
  /* And the only thing that reaches the thread is what `say` was pressed for. */
  const sends = detail.match(/queriesApi\.say\(/g) || [];
  assert.equal(sends.length, 1, 'exactly one path says anything in a thread');
  assert.ok(
    !/queriesApi\.draftReply\([^)]*\)[\s\S]{0,400}?queriesApi\.say\(/.test(detail),
    'drafting never falls through into sending'
  );
});

test('the button is not offered where there is no model behind it', () => {
  const detail = source('pages/QueryDetail.jsx');
  assert.match(detail, /can\.draftReply && \(/, 'gated on what the server said it can do');
});

test('a note is never given a side in the conversation', () => {
  const thread = source('components/QueryThread.jsx');

  /*
   * A reply is addressed to the thread and takes the reader's side when it is theirs; a note is
   * an observation. Siding a note would make it read as an answer somebody gave, which is how a
   * thread of nine notes comes to look answered.
   */
  assert.match(thread, /const side = !note && mine/);
});

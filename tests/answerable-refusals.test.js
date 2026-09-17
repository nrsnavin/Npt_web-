/**
 * The refusals a screen can answer [BLUEPRINT §15, §19].
 *
 * Two of the server's gates reply 409 with `details.needs` naming the one field they want: a
 * reason for dispatching past quality, a reason for closing with no proof of delivery. Both are
 * soft on purpose, and both are only safe because the answer is recorded — so the dialog that
 * collects it has to say where it ends up, in that case's own words.
 *
 * What this file is really guarding is the shape rather than the strings. The first version of
 * the dialog was written for quality alone, with the heading, the notice, the question, the
 * placeholder and both buttons typed into the JSX. Adding the POD case to it put up a dialog
 * headed "Quality has not cleared this" over a consignment whose only problem was a missing
 * signature — confidently, with no error anywhere, asking the wrong question about the wrong
 * thing. A third case would have done it again.
 *
 *   node --test tests/answerable-refusals.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ANSWERABLE, MIN_REASON, answerableField } from '../src/utils/answerable.js';

const CASES = Object.keys(ANSWERABLE);

test('both soft gates the server has are answerable here', () => {
  /* Named rather than counted: a table that had lost one of them would still have a length. */
  assert.deepEqual(CASES.sort(), ['noPodReason', 'qualityOverrideReason']);
});

test('every case can fill the whole dialog', () => {
  /*
   * A missing entry does not throw — it renders an empty heading, an empty notice and an unnamed
   * button, which is a dialog that asks for a sentence without saying what about. So the shape
   * is checked per case rather than trusted.
   */
  for (const [field, answer] of Object.entries(ANSWERABLE)) {
    for (const key of ['title', 'consequence', 'ask', 'placeholder', 'decline']) {
      assert.equal(typeof answer[key], 'string', `${field} has no ${key}`);
      assert.ok(answer[key].length > 0, `${field}.${key} is empty`);
    }
    assert.equal(typeof answer.confirm, 'function', `${field} has no confirm label`);
    assert.ok(answer.confirm('Dispatch').length > 0, `${field}.confirm said nothing`);
    /* `subtitle` is the one that may be absent, and only when the refusal carries something
       better: quality quotes the concern it found. */
    assert.ok(
      answer.subtitle === null || typeof answer.subtitle === 'string',
      `${field}.subtitle is neither a sentence nor deliberately absent`
    );
  }
});

test('each case says where the answer ends up, and who reads it', () => {
  /*
   * The point of the sentence, not decoration. A dialog that asks "why?" and nothing else gets
   * "asked to" typed into it; one that says the reason appears in a monthly list under your name
   * gets an account of what happened. Both consequences here name a reader — the monthly list,
   * or accounts on the day a buyer disputes a delivery.
   */
  assert.match(ANSWERABLE.qualityOverrideReason.consequence, /monthly list/i);
  assert.match(ANSWERABLE.noPodReason.consequence, /accounts/i);
  for (const field of CASES) {
    assert.match(
      ANSWERABLE[field].consequence,
      /your name/i,
      `${field} does not tell the presser their name goes on it`
    );
  }
});

test('the way out is named for what it leaves behind', () => {
  /* "Cancel" on this dialog is ambiguous in the worst place — cancel the consignment, or cancel
     the answer? Both buttons name the outcome instead. */
  for (const field of CASES) {
    assert.doesNotMatch(ANSWERABLE[field].decline, /^cancel$/i, `${field} says only "Cancel"`);
  }
  assert.equal(ANSWERABLE.noPodReason.decline, 'Leave it waiting');
});

/* ------------------------- Which failures open a dialog ------------------------- */

const refusal = (status, needs) => ({ status, details: needs ? { needs } : undefined });

test('a 409 naming one of these fields opens its dialog', () => {
  assert.equal(answerableField(refusal(409, 'qualityOverrideReason')), 'qualityOverrideReason');
  assert.equal(answerableField(refusal(409, 'noPodReason')), 'noPodReason');
});

test('everything else is an error to read', () => {
  /*
   * `needs` is not unique to these gates — the ordinary action form sends it too, on a 400 for a
   * missing lorry number. Answering that with an override dialog would ask "why are you doing
   * this anyway?" about a field somebody simply had not filled in yet.
   */
  assert.equal(answerableField(refusal(400, 'vehicleNumber')), null);
  assert.equal(answerableField(refusal(400, 'noPodReason')), null, 'the status is half the test');
  assert.equal(answerableField(refusal(409, 'somethingNew')), null, 'unknown gates stay errors');
  assert.equal(answerableField(refusal(409)), null);
  assert.equal(answerableField(refusal(500)), null);
  assert.equal(answerableField(null), null);
  assert.equal(answerableField(undefined), null);
});

test('the button refuses a reason the server would refuse anyway', () => {
  /* Matched to the server's own floor. A dialog that accepts four characters and comes back 409
     a second time teaches people the dialog is the obstacle. */
  assert.equal(MIN_REASON, 10);
});

/* ------------------------- And the dialog reads from it ------------------------- */

test('no case is hardcoded into the component that draws the dialog', () => {
  /*
   * The regression this file exists for, checked where it would happen. Read as text because
   * `node --test` here has no JSX loader — which is also why the table lives in a `.js` module
   * it can import.
   *
   * Every phrase below belongs to exactly one case. Any of them appearing in the component means
   * that case's wording has been typed back into the JSX, and the other case is showing it.
   */
  const source = readFileSync(new URL('../src/components/DispatchStatus.jsx', import.meta.url), 'utf8');

  const owned = [
    'Quality has not cleared this',
    'quality warning',
    'Why is it going anyway?',
    'Buyer inspected at our gate',
    'Do not send it',
    'No proof of delivery on file',
    'Why is it being closed without one?',
    'Leave it waiting',
    'Close it anyway',
    'anyway`',
  ];

  for (const phrase of owned) {
    assert.ok(
      !source.includes(phrase),
      `DispatchStatus.jsx spells out "${phrase}" — it belongs to one case, and the dialog is ` +
        'shared by all of them. Put it in utils/answerable.js.'
    );
  }

  /* And the positive half: the dialog is in fact wired to the table. Asserting the absence of
     the old strings on its own would pass on a component that had lost the dialog entirely. */
  assert.match(source, /ANSWERABLE\[override\?\.field\]/, 'the dialog reads the table');
  assert.match(source, /\[override\.field\]: overrideReason/, 'and sends the field it asked for');
});

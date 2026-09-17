/**
 * What a refused request turns into [BLUEPRINT §15, §19].
 *
 * Everything the screens know about a failure passes through two functions: the sentence and the
 * error object in `api/failure.js`, and the toast in `api/feedback.js`. Both treat a refusal as
 * one thing, and the server sends two — a *refusal*, which is an error, and a *question*, which
 * is a 409 naming the one field it wants so a screen can ask for it and try again.
 *
 * The question was the case neither of them had. One threw on it and swallowed the reply; the
 * other put a red "Action could not be completed" over the dialog that had just opened. Both
 * bugs were invisible in the code that draws the dialog, which is where they looked like they
 * were.
 *
 *   node --test tests/api-failures.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { failureFrom, failureMessage } from '../src/api/failure.js';
import { beginFeedback, finishFeedback, subscribeFeedback } from '../src/api/feedback.js';

/* ------------------------- The error the screens catch ------------------------- */

/** A soft gate: `ApiError.conflict(message, { needs })` — `details` is an object. */
const question = {
  success: false,
  message: 'DSP-2026-0004 has no proof of delivery on file. It can still be closed, but say why.',
  details: { needs: 'noPodReason' },
};

/** A validation failure: `details` is a list of fields. */
const invalid = {
  success: false,
  message: 'Validation failed',
  details: [
    { field: 'lines.0.quantity', message: 'must be at least 1' },
    { field: 'vehicleNumber', message: 'is required' },
  ],
};

test('a 409 that asks for a field survives the trip to the screen', () => {
  /*
   * The whole bug in one assertion. `details` here is an object, and the first version called
   * `.filter` on it — so instead of this error the caller got a TypeError, carrying neither the
   * status nor the field, and the answerable refusal became an unanswerable one.
   */
  const failure = failureFrom(question, 409);

  assert.equal(failure.status, 409, 'without the status nothing can tell a question from an error');
  assert.deepEqual(failure.details, { needs: 'noPodReason' }, 'and the field it is asking for');
  assert.match(failure.message, /no proof of delivery/, "the server's own sentence, not a TypeError");
});

test('a validation failure still names the fields', () => {
  /* The case the field-naming exists for, and the one that must not be lost to the fix: on its
     own "Validation failed" tells somebody with twenty boxes in front of them nothing. */
  const failure = failureFrom(invalid, 400);

  assert.match(failure.message, /^Validation failed — /);
  assert.match(failure.message, /Quantity on line 1: must be at least 1/);
  assert.match(failure.message, /Vehicle Number: is required/);
  /* Passed through as it came, because a form reads the array and `answerableField` reads the
     object. Normalising to either shape disables the other. */
  assert.ok(Array.isArray(failure.details));
});

test('a reply with nothing in it still says something', () => {
  assert.equal(failureMessage(undefined, undefined), 'Something went wrong. Please try again.');
  assert.equal(failureMessage(undefined, 'Network Error'), 'Network Error');
  assert.equal(failureMessage({ message: 'Order not found' }, 'Request failed'), 'Order not found');
});

test('details in a shape nobody planned for does not take the message down with it', () => {
  /* A string, a number, a null — each has come back from something at some point, and none of
     them may cost the reader the sentence that was actually sent. */
  for (const details of ['nope', 42, null, {}, { needs: 'x' }]) {
    const failure = failureFrom({ message: 'Refused', details }, 409);
    assert.equal(failure.message, 'Refused');
    assert.deepEqual(failure.details, details);
  }
});

test('at most three fields are named', () => {
  /* A toast is a sentence, not a report. Twenty of them is a wall nobody reads. */
  const many = { message: 'Validation failed', details:
    Array.from({ length: 9 }, (_, i) => ({ field: `f${i}`, message: 'is required' })) };
  assert.equal(failureMessage(many).split(';').length, 3);
});

/* ---------------------------- And the toast it raises ---------------------------- */

/** Runs one request through the feedback module and returns what it announced. */
const announce = (response, failed) => {
  const heard = [];
  const stop = subscribeFeedback((event) => heard.push(event));
  const config = { method: 'post', url: 'dispatches/x/actions' };
  beginFeedback(config);
  finishFeedback(config, response, failed ? { message: response?.data?.message } : undefined);
  stop();
  /* The first event is the subscribe itself, the second the begin. The last one is the verdict. */
  return heard.at(-1);
};

test('a question is not announced as a failure', () => {
  /*
   * The dialog is the app's answer to a 409 that asks for something. A red "Action could not be
   * completed" over the top of it tells somebody their action failed at the moment they are
   * being asked a question about it — and contradicts the dialog's own "it can still be closed".
   */
  const said = announce({ status: 409, data: question }, true);

  assert.equal(said.message, undefined, 'nothing is said, because nothing failed');
  assert.equal(said.pending, 0, 'but the request is still finished, or the spinner never stops');
});

test('a real refusal is announced', () => {
  const said = announce(
    { status: 409, data: { message: 'Someone else saved this first. Reload and try again.' } },
    true
  );
  assert.equal(said.message, 'Action could not be completed');
  assert.equal(said.tone, 'danger');
});

test('a 409 on a status that is not asking for anything is still an error', () => {
  /* The version test — a stale `expectedUpdatedAt` is also a 409, and it is a genuine failure
     with nothing to answer. Recognised by the absence of `needs`, not by the status. */
  const said = announce({ status: 409, data: { message: 'This record changed', details: [] } }, true);
  assert.equal(said.message, 'Action could not be completed');
});

test('a success still says what it did', () => {
  const said = announce({ status: 200, data: { data: { number: 'DSP-2026-0004', status: 'closed' } } });
  assert.equal(said.message, 'Dispatch updated');
  assert.equal(said.tone, 'success');
  assert.match(said.detail, /DSP-2026-0004 · closed/);
});

/**
 * What the stage picker offers, and why every entry has to be one the server will take.
 *
 * A dropdown that offers a move ending in an error message is worse than one that does not
 * offer it: the person learns the software is unreliable rather than learning the rule. So this
 * file is the client's half of three rules the server enforces, written down where the picker
 * is built — and it exists because the picker offered all three of them before anybody checked.
 *
 *   node --test tests/sample-stages.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLOSED_SAMPLE_STAGES,
  FEEDBACK_OUTCOMES,
  ON_THE_BENCH_STAGES,
  SAMPLE_STAGES,
  WITH_CUSTOMER_STAGES,
  nextSampleStagesFrom,
} from '../src/utils/pipeline.js';

const offered = (from) => nextSampleStagesFrom(from).map((stage) => stage.value);

/** The three sets have to partition the stage list, or a stage is governed by no rule at all. */
test('every sample stage is on the bench, with the customer, or closed', () => {
  const accounted = new Set([
    ...ON_THE_BENCH_STAGES,
    ...WITH_CUSTOMER_STAGES,
    ...CLOSED_SAMPLE_STAGES,
    'modification_required',
  ]);

  for (const stage of SAMPLE_STAGES) {
    assert.ok(accounted.has(stage.value), `${stage.value} belongs to none of the three sets`);
  }
});

/**
 * Dispatching is the only door into the customer's hands, and it is the door §6's paperwork
 * gate stands in.
 *
 * Naming only `delivered` was the first version of this rule, and it left the one beside it
 * open: a request could go straight from the bench to `customer_feedback_pending` — never made,
 * never sent, no courier, no AWB — and the feedback action accepts any with-customer stage, so
 * the next click marked it approved. An approved sample is what §13 checks an order against.
 */
test('a sample still on the bench is only ever offered Dispatched', () => {
  for (const from of ON_THE_BENCH_STAGES) {
    const reachable = offered(from);
    const premature = reachable.filter(
      (stage) => WITH_CUSTOMER_STAGES.includes(stage) && stage !== 'dispatched'
    );
    assert.deepEqual(premature, [], `${from} offers ${premature.join(', ')} on something never sent`);
    assert.ok(reachable.includes('dispatched'), `${from} cannot reach the customer at all`);
  }
});

/**
 * And once it has gone, the bench's stages are behind it.
 *
 * The status said the bench was still checking stock for a piece on a buyer's desk — and the
 * bench stages are the ones §25 escalates, so the request re-entered the overdue queue and
 * chased somebody for work already done.
 */
test('a sample with the customer is never offered its way back to the bench', () => {
  for (const from of WITH_CUSTOMER_STAGES) {
    const back = offered(from).filter((stage) => ON_THE_BENCH_STAGES.includes(stage));
    assert.deepEqual(back, [], `${from} offers ${back.join(', ')} on something already sent`);
  }
});

/** Cancelling is the legitimate escape from anywhere open — a rule with no way out is one
    people work around by not recording the truth. */
test('cancelling stays available from every open stage', () => {
  for (const from of [...ON_THE_BENCH_STAGES, ...WITH_CUSTOMER_STAGES]) {
    assert.ok(offered(from).includes('cancelled'), `${from} cannot be cancelled`);
  }
});

/** The customer's verdict is never the maker's to set, from anywhere. */
test('the three feedback outcomes are on offer from nowhere', () => {
  for (const from of SAMPLE_STAGES.map((stage) => stage.value)) {
    const verdicts = offered(from).filter((stage) => FEEDBACK_OUTCOMES.includes(stage));
    assert.deepEqual(verdicts, [], `${from} offers ${verdicts.join(', ')} to whoever made it`);
  }
});

/** A closed request offers nothing: the server refuses every move, so the picker draws none. */
test('a closed request offers nothing at all', () => {
  for (const from of CLOSED_SAMPLE_STAGES) {
    assert.deepEqual(offered(from), [], `${from} still offers moves`);
  }
});

/**
 * Going backwards *within* the bench stays on offer, and that is deliberate rather than an
 * oversight. A piece that breaks genuinely returns to production; one that fails a check
 * returns to checking stock. The enquiry module forbids falling back and the sample module
 * must not — forbidding it here would forbid the plant's ordinary day.
 */
test('the bench can still send its own work backwards', () => {
  assert.ok(offered('sample_ready').includes('production_required'), 'a broken piece cannot be remade');
  assert.ok(offered('sample_available').includes('checking_stock'), 'a failed check cannot be redone');
});

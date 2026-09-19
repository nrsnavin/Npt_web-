/**
 * Who a new lead or customer belongs to — asked on the form [BLUEPRINT §29].
 *
 * The owner was filled in without anybody choosing: a new customer went to whoever created it,
 * a new lead went round-robin across marketing. Both were defensible and neither was a decision
 * anybody took, which made the most consequential field on the form the one nobody looked at —
 * under §29 the owner decides whose list the buyer appears on, who gets the follow-up reminder,
 * and who can see the record at all.
 *
 * Read as text because `node --test` here has no JSX loader.
 *
 *   node --test tests/owner-picker.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isOwnershipScoped, selfId } from '../src/utils/pipeline.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const PICKER = read('components/OwnerPicker.jsx');
const LEAD_FORM = read('components/LeadForm.jsx');
const CUSTOMER_FORM = read('pages/Customers.jsx');
const ENDPOINTS = read('api/endpoints.js');

test('it starts empty, so the question is actually asked', () => {
  /*
   * A pre-selected name is a default, and a default is the thing being replaced. An empty select
   * that will not submit is the only version of this that asks anybody anything.
   */
  assert.match(PICKER, /<option value="">/, 'the first option carries no value');
  assert.match(PICKER, /Choose somebody in marketing…/);
  assert.match(
    PICKER,
    /register\('assignedTo', \{ required: 'Choose who will own this' \}\)/,
    'and it will not submit without an answer'
  );
});

test('the list is the marketing team, from its own endpoint', () => {
  /*
   * Not `owners`, which answers "who currently holds records" for the filter and is scoped down
   * to one name for a marketing person. A picker that offered somebody only themselves would be
   * a label, not a choice.
   */
  assert.match(ENDPOINTS, /team: \(\) => api\.get\('\/customers\/team'\)/);
  assert.match(ENDPOINTS, /team: \(\) => api\.get\('\/leads\/team'\)/);
  assert.match(LEAD_FORM, /load=\{leadsApi\.team\}/);
  assert.match(CUSTOMER_FORM, /load=\{customersApi\.team\}/);
});

test('it marks the reader\'s own name, through the helper that knows both spellings', () => {
  /*
   * The bug this pins. The comparison was against `user._id`, and the API's own user payload
   * calls the field `id` — so it never matched: the reader's name went unmarked and the
   * hand-over warning below never fired. A check that is always false looks exactly like a check
   * that is always passing, which is why it survived a browser drive.
   */
  assert.match(PICKER, /import \{ isOwnershipScoped, selfId \}/);
  assert.match(PICKER, /const me = selfId\(user\);/);
  assert.match(PICKER, /=== me \? ' \(you\)' : ''/);
  assert.ok(!/user\?\._id/.test(PICKER), 'nothing compares against the spelling that is not there');

  /* And the helper really does answer to both, which is the property being relied on. */
  assert.equal(selfId({ id: 'abc' }), 'abc');
  assert.equal(selfId({ _id: 'abc' }), 'abc');
});

test('it says what handing a record over costs, to the people it costs it to', () => {
  /*
   * Under §29 a marketing person who picks a colleague stops being able to see the record: the
   * save succeeds and the row is simply not on their list afterwards. Correct, and a horrible
   * surprise, so the form says it in advance.
   *
   * Only to them, though. An admin or a manager hands a record over and still sees it on every
   * list, so the same warning would be about something that does not happen — and a form that
   * cries wolf once gets read past.
   */
  assert.match(PICKER, /isOwnershipScoped\(user\) && chosen && me && String\(chosen\) !== me/);
  assert.match(PICKER, /You will not see it on your own list afterwards/);

  assert.equal(isOwnershipScoped({ role: 'member', department: 'marketing' }), true);
  assert.equal(isOwnershipScoped({ role: 'admin', department: 'marketing' }), false);
  assert.equal(isOwnershipScoped({ role: 'member', department: 'management' }), false);
});

test('a roster that cannot be filled says so instead of offering nothing', () => {
  /*
   * Two ways to end up with an empty dropdown, and both need a sentence: the request failed, or
   * nobody in marketing can hold a buyer yet. Silence leaves a required field that can never be
   * filled, which reads as a broken form.
   */
  assert.match(PICKER, /Could not load the marketing team/);
  assert.match(PICKER, /Nobody in marketing can hold a buyer yet/);
  assert.match(PICKER, /disabled=\{!team\}/, 'and it cannot be used while the list is still coming');
});

test('the owner is asked on create and never on edit', () => {
  /*
   * Moving a record afterwards is a reassignment, which the server holds to be a management
   * decision. A picker on the edit form would be a control that mostly refuses.
   */
  for (const [name, source] of [['the lead form', LEAD_FORM], ['the customer form', CUSTOMER_FORM]]) {
    const mounted = source.match(/\{!editing && \(\s*<OwnerPicker/);
    assert.ok(mounted, `${name} only offers it on create`);
  }
});


/* ------------------- Keeping a buyer yourself ------------------- */

test('the reader\'s own name is drawn apart, not slipped in among marketing', () => {
  /*
   * An administrator or a manager may hold a buyer — `assertCanOwnBuyer` has always accepted
   * them — but they are not on the marketing roster, so the list had no entry for them and the
   * field is required. The one person allowed to keep a buyer themselves was the one who could
   * not say so: a screen contradicting its own server.
   *
   * The server sends them back flagged, and the flag is why they are drawn apart. Assigning a
   * buyer to a colleague and keeping one yourself are two decisions, and a list that mixes them
   * makes the second look like the first.
   */
  assert.match(PICKER, /const marketing = roster\.filter\(\(person\) => !person\.self\)/);
  assert.match(PICKER, /const yourself = roster\.find\(\(person\) => person\.self\)/);
  assert.match(PICKER, /<optgroup label="Marketing">/);
  assert.match(PICKER, /<optgroup label="Keep it yourself">/);
});

test('the grouping only appears when there are two kinds of answer', () => {
  /* A lone `<optgroup>` over the only list there is, is a heading for nothing — so a marketing
     person, who is offered marketing and nothing else, still sees a plain list. */
  assert.match(PICKER, /\{yourself \? \(/, 'the groups are conditional on a self entry existing');
  assert.match(PICKER, /Boolean\(marketing\.length\) && \(/, 'and an empty team draws no heading');
});

test('keeping it yourself says what that costs, as plainly as handing it over', () => {
  /*
   * §3 and §29 assume a marketing person is chasing the relationship: the follow-up reminders,
   * the scoreboard and the untouched-leads count all read from the owner. Keeping a buyer is a
   * legitimate thing to do and it takes them off all of that — worth knowing before pressing
   * save rather than after wondering why nobody rang them.
   */
  assert.match(PICKER, /const keepingIt = yourself && chosen && String\(chosen\) === String\(yourself\._id\)/);
  assert.match(PICKER, /Yours to chase, not marketing/);
  assert.match(PICKER, /be reminded to follow it up/);

  /* And the hand-over warning is still its own, separate case. */
  assert.match(PICKER, /This will be theirs to chase/);
});

test('the placeholder stops saying "somebody in marketing" when that is not the only option', () => {
  /* A required field whose prompt names a group the reader is not in, offering an entry that is
     not in that group, is the small lie that makes people distrust the rest of the form. */
  assert.match(PICKER, /yourself \? 'Choose an owner…' : 'Choose somebody in marketing…'/);
});

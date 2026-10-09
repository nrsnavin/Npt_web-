/**
 * Each department's desk: the enquiries it holds, each with its buttons
 * [pages/DepartmentDashboard.jsx, config/deskActions.js].
 *
 *   node --test tests/department-desk.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESK_ACTIONS, deskActionsFor } from '../src/config/deskActions.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const DEPARTMENTS = ['management', 'marketing', 'order_confirmation', 'quotation', 'sampling', 'production', 'assembling', 'quality', 'despatch', 'accounts'];

const row = (records = {}) => ({
  enquiry: { _id: 'e1' },
  task: { _id: 't1' },
  records: { sample: null, quotation: null, order: null, ...records },
});

test('every department has its buttons, with one it presses most', () => {
  for (const department of DEPARTMENTS) {
    const actions = DESK_ACTIONS[department];
    assert.ok(actions?.length, `${department} has no desk buttons`);
    assert.ok(actions.some((action) => action.primary), `${department} has no primary button`);
  }
});

test('a button with nowhere to go is left off the card', () => {
  assert.deepEqual(deskActionsFor('sampling', row()).map((action) => action.label), []);
  assert.deepEqual(
    deskActionsFor('sampling', row({ sample: { _id: 's1' } })).map((action) => action.href),
    ['/samples/s1'],
  );
  assert.equal(deskActionsFor('quotation', row({ quotation: { _id: 'q1' } }))[0].href, '/quotations/q1');
  assert.deepEqual(deskActionsFor('quotation', row({ quotation: { _id: 'q1' } })).map((a) => a.label), ['Cost the quotation']);
  /* No quotation yet: the button raises one instead. */
  assert.deepEqual(deskActionsFor('quotation', row()).map((a) => a.label), ['Raise the quotation']);
  /* Sales books the order from the quotation until there is one. */
  assert.deepEqual(deskActionsFor('order_confirmation', row({ quotation: { _id: 'q1' } })).map((a) => a.label), ['Book from the quotation']);
  assert.deepEqual(deskActionsFor('order_confirmation', row({ quotation: { _id: 'q1' }, order: { _id: 'o1' } })).map((a) => a.label), ['Open order']);
});

test('the desk lists the enquiries as cards with their own buttons and the hand-over actions', () => {
  const page = read('pages/DepartmentDashboard.jsx');
  assert.match(page, /deskActionsFor\(department, row\)/);
  assert.match(page, /<HandoffTaskActions todo=\{task\}/);
  assert.match(page, /data\?\.enquiries/);
  for (const tab of ['With us', 'Requests', 'Waiting on others', 'Came back', 'Done this week']) {
    assert.ok(page.includes(`'${tab}'`), `no ${tab} tab`);
  }
});

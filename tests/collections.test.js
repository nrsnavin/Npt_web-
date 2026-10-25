/**
 * Payment Collection and the Payment Recovery Team on the web [docs: server
 * PAYMENT-COLLECTION-WORKFLOW.md]: the new department everywhere a department is listed, the
 * receipt that waits for Accounts, the rule's proposal on a case, the cases beside the money,
 * and the buyer's credit status that warns and never blocks.
 *
 *   node --test tests/collections.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CREDIT_STATUSES, DEPARTMENTS, creditLabel, creditStatusOf, departmentLabel } from '../src/utils/pipeline.js';
import { workspaceFor } from '../src/config/departments.js';
import { simpleNavFor } from '../src/config/simpleNav.js';
import { deskActionsFor } from '../src/config/deskActions.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Payment Recovery (PRT) is a department of its own, after Payment Collection, with a desk, a menu and a workspace', () => {
  const keys = DEPARTMENTS.map((entry) => entry.key);
  assert.equal(keys[keys.indexOf('payment_collection') + 1], 'payment_recovery');
  assert.equal(departmentLabel('payment_recovery'), 'Payment Recovery (PRT)');
  assert.deepEqual(simpleNavFor(['payment_recovery']), ['dashboard', 'payments', 'customers', 'queries']);
  assert.ok(workspaceFor('payment_recovery').pages.some((page) => page.to === '/today'), 'the day screen, where the cases are');
  assert.ok(workspaceFor('payment_collection').pages.some((page) => page.to === '/today'));
  assert.ok(workspaceFor('payment_recovery').jobs.some((job) => /Accounts confirms/.test(job)));
  assert.deepEqual(deskActionsFor('payment_recovery', { enquiry: { _id: 'e1' }, task: { _id: 't1' }, records: {} }).map((action) => action.label), ['Payments to recover']);
  assert.match(read('pages/Home.jsx'), /payment_recovery: \(\) => <PaymentsHome \/>/);
  assert.match(read('components/RaiseEscalation.jsx'), /'payment_recovery',/);
});

test('a receipt says whether Accounts has seen it, and only Accounts or Admin may confirm it', () => {
  const page = read('pages/PaymentDetail.jsx');
  assert.match(page, /const seesTheBank = isManagement \|\| departments\.includes\('accounts'\);/);
  assert.match(page, /Awaiting Accounts’ confirmation/);
  assert.match(page, /\{!receipt\.confirmed\?\.at && seesTheBank && \(/);
  assert.match(page, /Confirm — seen in the bank/);
  assert.match(page, /receivable\.awaitingConfirmation > 0 && \(/, 'the money the gate is still waiting on is said on the screen');
  assert.match(read('api/endpoints.js'), /confirmReceipt: \(\{ id, receiptId, \.\.\.bankLine \}\) => api\.post\(`\/payments\/\$\{id\}\/receipts\/\$\{receiptId\}\/confirm`, bankLine\)/, 'with the bank line [payments-to-confirm.test.js]');
});

test('the rule’s proposal shows on the task and on the board; the day screen lists the cases beside the money', () => {
  assert.match(read('components/TaskPanel.jsx'), /task\.suggestion\?\.kind === 'escalate_prt' && \(/);
  assert.match(read('components/TaskPanel.jsx'), /Choose “Escalated to PRT” below/);
  assert.match(read('components/DepartmentTasksBoard.jsx'), /task\.suggestion\?\.kind === 'escalate_prt' && !task\.completed && <> · <span className="font-semibold text-warn-400">Escalate to PRT\?<\/span><\/>/);
  const home = read('pages/PaymentsHome.jsx');
  assert.match(home, /<Cases day=\{day\} meta=\{meta\} \/>/);
  for (const title of ['Proposed for the field', 'With the Payment Recovery Team', 'By collector', 'Credit watch and hold']) {
    assert.ok(home.includes(`"${title}"`) || home.includes(`>${title}<`), `${title} on the day screen`);
  }
  assert.match(home, /A hold warns — it does not stop a dispatch/);
});

test('every buyer carries a credit status; Admin sets or clears it from the buyer, and it never blocks', () => {
  assert.deepEqual(CREDIT_STATUSES.map((entry) => entry.key), ['good', 'watch', 'hold']);
  assert.equal(creditStatusOf({ credit: { status: 'hold' } }), 'hold');
  assert.equal(creditStatusOf({ credit: { override: { status: 'good' }, derived: { status: 'hold' } } }), 'good', 'Admin’s word wins');
  assert.equal(creditStatusOf({}), 'good');
  assert.equal(creditLabel('watch'), 'Credit watch');
  const page = read('pages/CustomerDetail.jsx');
  assert.match(page, /function CreditDialog\(/);
  assert.match(page, /customersApi\.setCredit\(clear \? \{ id: customer\._id \} : \{ id: customer\._id, status, reason: reason\.trim\(\) \}\)/);
  assert.match(page, /Clear — back to the rule/);
  assert.match(page, /It does not stop them — the order’s payment terms do that\./);
  assert.match(page, /\(creditStatusOf\(customer\) !== 'good' \|\| isManagement\) && \(/, 'shown to everyone when it is not Good, to Admin always');
  assert.match(read('api/endpoints.js'), /setCredit: \(\{ id, \.\.\.payload \}\) => api\.post\(`\/customers\/\$\{id\}\/credit`, payload\)/);
});

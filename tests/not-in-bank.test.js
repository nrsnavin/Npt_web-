/**
 * A payment Accounts does not find in the bank [server: payment.controller `rejectReceipt`,
 * paymentGates `afterNotInBank`]: one of three reasons, the sender's task reopens, red lines on the
 * enquiry, the sales order, the RCV page and the dispatch hold, a late confirmation on the same
 * entry, and the receipts on the payment task and on A/C Clarify for Accounts to confirm.
 *
 *   node --test tests/not-in-bank.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Accounts picks one of three reasons, the note optional', () => {
  const dialog = read('components/ConfirmPaymentDialog.jsx');
  for (const [key, label] of [['not_received', 'Not received yet'], ['mismatch', 'UTR / amount mismatch'], ['bounced', 'Cheque bounced']]) {
    assert.ok(dialog.includes(`key: '${key}', label: '${label}'`), label);
  }
  assert.match(dialog, /disabled=\{busy \|\| !reasonKey\}/, 'a reason must be picked');
  assert.match(dialog, /paymentsApi\.rejectReceipt\(\{ id: payment\.receivableId, receiptId: payment\.receiptId, reasonKey, reason: reason\.trim\(\) \|\| undefined \}\)/);
  /* Came after all: the same dialog confirms on the Not-in-bank entry. */
  assert.match(dialog, /await \(payment\.late \? paymentsApi\.confirmLate : paymentsApi\.confirmReceipt\)\(/);
});

test('red lines: the enquiry, the sales order, the RCV page and the dispatch hold', () => {
  assert.match(read('components/DepartmentDesk.jsx'), /<NotInBankBanner rows=\{history\?\.notInBank\} \/>/);
  assert.match(read('components/OrderPayment.jsx'), /\{notInBank\.length > 0 && <div className="mb-3"><NotInBankBanner rows=\{notInBank\} \/><\/div>\}/);
  assert.match(read('components/DispatchPaymentHold.jsx'), /<NotInBankBanner rows=\{hold\.notInBank\} compact \/>/);
  const rcv = read('pages/PaymentDetail.jsx');
  assert.match(rcv, /not in the bank<\/p>/);
  assert.match(rcv, /Came after all — confirm/);
  assert.match(rcv, /onClick=\{\(\) => setRejecting\(paymentOf\(receipt\)\)\}/, 'Not in bank from the RCV page');
  const banner = read('components/NotInBank.jsx');
  assert.match(banner, /role="alert" aria-label="Payment not in bank"/);
  assert.match(banner, /<span className="font-semibold">\{row\.reason\}<\/span>/);
});

test('the receipts on Payment Collection, PRT and A/C Clarify tasks, by RCV number, for Accounts to confirm', () => {
  assert.match(read('api/endpoints.js'), /receipts: \(id\) => api\.get\(`\/workspace\/todos\/\$\{id\}\/receipts`\)\.then\(unwrap\)/);
  const receipts = read('components/NotInBank.jsx');
  assert.match(receipts, /export const RECEIPT_TASK_KINDS = \['team_payment_followup', 'prt_recovery', 'ac_clarify'\];/);
  assert.match(receipts, /\{row\.receivable\.number\}<\/Link>/);
  for (const label of ['Waiting for Accounts', 'Not in bank', 'Came after all — confirmed', 'Logged again']) assert.ok(receipts.includes(`label: '${label}'`), label);
  assert.match(receipts, /seesTheBank && row\.state === 'awaiting'/);
  assert.match(read('components/TaskWorkflow.jsx'), /\{RECEIPT_TASK_KINDS\.includes\(todo\.kind\) && <TaskReceipts todo=\{todo\}/);
});

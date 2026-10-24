/**
 * Accounts confirms logged payments from a list of its own, with the bank line [components/
 * PaymentsToConfirm.jsx, components/ConfirmPaymentDialog.jsx, pages/DepartmentDashboard.jsx,
 * pages/PaymentDetail.jsx; server: paymentGates `paymentsToConfirm`, payment.controller `confirmReceipt`].
 *
 *   node --test tests/payments-to-confirm.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the confirmation sends the bank line: UTR, amount, day credited, account, remark', () => {
  assert.match(read('api/endpoints.js'), /confirmReceipt: \(\{ id, receiptId, \.\.\.bankLine \}\) => api\.post\(`\/payments\/\$\{id\}\/receipts\/\$\{receiptId\}\/confirm`, bankLine\)/);
  assert.match(read('api/endpoints.js'), /rejectReceipt: \(\{ id, receiptId, reason \}\) => api\.post\(`\/payments\/\$\{id\}\/receipts\/\$\{receiptId\}\/reject`, \{ reason \}\)/);
  const dialog = read('components/ConfirmPaymentDialog.jsx');
  for (const label of ['UTR number', 'Amount credited (₹)', 'Date credited', 'Bank account', 'Remarks']) assert.ok(dialog.includes(label), label);
  assert.match(dialog, /const utrNeeded = !cash && !values\.reference\.trim\(\);/, 'the UTR, except for cash');
  assert.match(dialog, /disabled=\{busy \|\| !amount \|\| !values\.creditedOn \|\| utrNeeded\}/);
  assert.match(dialog, /Logged as \$\{formatCurrency\(payment\.amount\)\} — the bank amount is kept/);
});

test('Accounts’ desk: Payments to confirm, its own section above To do, counted on the Tasks tab', () => {
  const page = read('pages/DepartmentDashboard.jsx');
  assert.match(page, /<TaskSection title="Payments to confirm" count=\{toConfirm\.length\}/);
  assert.ok(page.indexOf('title="Payments to confirm"') < page.indexOf('<TaskSection title="To do"'), 'above To do');
  assert.match(page, /\{ key: 'tasks', label: 'Tasks', count: toDoCount \+ \(toConfirm\?\.length \|\| 0\) \}/);
  const list = read('components/PaymentsToConfirm.jsx');
  assert.match(list, /className="card hidden overflow-hidden md:block"/, 'a table on a wide screen');
  assert.match(list, /className="space-y-3 md:hidden"/, 'cards on a phone');
  assert.match(list, />Confirm<\/button>/);
  assert.match(list, />Not in the bank<\/button>/);
});

test('the payment page confirms with the same form and shows what the bank line said', () => {
  const page = read('pages/PaymentDetail.jsx');
  assert.match(page, /<ConfirmPaymentDialog payment=\{confirming\}/);
  assert.match(page, /onClick=\{\(\) => confirm\(receipt\)\}/);
  assert.match(page, /receipt\.confirmed\.reference \? ` · UTR \$\{receipt\.confirmed\.reference\}` : ''/);
});

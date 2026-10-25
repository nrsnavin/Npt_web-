/**
 * The money on the enquiry: each RCV linked to it, and every payment logged on it
 * [components/EnquiryPayments.jsx; server: handoff.controller `paymentsOnEnquiry`].
 *
 *   node --test tests/enquiry-payments.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the enquiry shows its RCVs with each payment, who logged it and whether it is confirmed', () => {
  const panel = read('components/EnquiryPayments.jsx');
  assert.match(panel, /<Link to=\{`\/payments\/\$\{row\._id\}`\}/);
  assert.match(panel, /logged by \$\{receipt\.by\}/);
  assert.match(panel, /' · confirmed' : ' · awaiting confirmation'/);
  assert.match(read('components/DepartmentDesk.jsx'), /<EnquiryPayments payments=\{history\?\.payments\} \/>/);
});

test('an RCV links back to its enquiry', () => {
  assert.match(read('pages/PaymentDetail.jsx'), /<Link to=\{`\/enquiries\/\$\{receivable\.enquiry\._id\}`\}/);
});

test('goods ready and held for the payment: the enquiry says so, with the receipt and Enter payment for its marketing person', () => {
  const hold = read('components/DispatchPaymentHold.jsx');
  assert.match(hold, /Goods ready — payment awaited to send/);
  assert.match(hold, /logged, waiting for Accounts to confirm/);
  assert.match(hold, /Goods ready — payment entered, waiting for Accounts to confirm/, 'all of it logged: only the confirmation to wait for');
  assert.match(hold, /<Link to=\{`\/payments\/\$\{hold\.receivable\._id\}`\}[^>]*>Payment receipt \{hold\.receivable\.number\}<\/Link>/);
  assert.match(hold, /\{hold\.receivable && mayEnter && !logged && <button[\s\S]*?>Enter payment received<\/button>\}/);
  assert.match(hold, /paymentsApi\.ownerReceipt\(\{/);
  assert.match(read('api/endpoints.js'), /ownerReceipt: \(\{ id, \.\.\.payload \}\) => api\.post\(`\/payments\/\$\{id\}\/owner-receipts`/);
  assert.match(read('components/DepartmentDesk.jsx'), /<DispatchPaymentHold holds=\{history\?\.dispatchHolds\} mayEnter=\{isManagement \|\| owner === me\} onChanged=\{refresh\} \/>/);
});

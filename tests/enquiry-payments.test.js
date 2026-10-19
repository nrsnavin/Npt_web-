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

/**
 * Edit sales order [components/EditSalesOrder.jsx; server: orderEdits.service]: payment terms with
 * the hold-or-keep choice when the order is already in production, and pieces after release — from
 * the order page, and linked from the enquiry.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the terms say what they do first; in production the person chooses hold or keep', () => {
  const dialog = read('components/EditSalesOrder.jsx');
  assert.match(dialog, /ordersApi\.termsPreview\(\{ id: order\._id, terms \}\)/);
  assert.match(dialog, /⚠ Already in production/);
  assert.match(dialog, /Hold production until it is paid/);
  assert.match(dialog, /Keep it running/);
  assert.match(dialog, /disabled=\{busy \|\| !preview \|\| \(preview\.needsDecision && !decision\)\}/, 'no save without a choice');
  assert.match(dialog, /failure\.details\?\.code === 'TERMS_IN_PRODUCTION'/);
  assert.match(dialog, /'Change terms & hold production'/);
});

test('pieces per line, after release too, sent only for the lines changed', () => {
  const dialog = read('components/EditSalesOrder.jsx');
  assert.match(dialog, /ordersApi\.changeQuantities\(\{ id: order\._id, lines: changed\.map/);
  assert.match(dialog, /Production’s, Printing’s, Assembly’s and Dispatch’s tasks, take the new pieces/);
  const api = read('api/endpoints.js');
  assert.match(api, /changeTerms: \(\{ id, \.\.\.payload \}\) => api\.post\(`\/orders\/\$\{id\}\/payment-terms`/);
  assert.match(api, /changeQuantities: \(\{ id, \.\.\.payload \}\) => api\.post\(`\/orders\/\$\{id\}\/quantities`/);
});

test('the order page offers Edit sales order to Admin and the owner, and opens it from ?edit=1', () => {
  const page = read('pages/OrderDetail.jsx');
  assert.match(page, /\{mayRaise && !closed && \(\s*<button[^>]*onClick=\{\(\) => setCorrecting\(true\)\}>\s*Edit sales order/);
  assert.match(page, /useState\(params\.get\('edit'\) === '1'\)/);
  assert.match(page, /Production stopped — a new SO request revises this order/);
  assert.match(page, /Production held — the payment terms changed/);
});

test('the enquiry page links each sales order and offers Edit sales order', () => {
  const records = read('components/EnquiryRecords.jsx');
  assert.match(records, /<Link to=\{`\/orders\/\$\{order\._id\}`\}/);
  assert.match(records, /<Link to=\{`\/orders\/\$\{order\._id\}\?edit=1`\}[^>]*>Edit sales order<\/Link>/);
  assert.match(records, /order\.paymentTerms \? ` · \$\{order\.paymentTerms\}`/);
});

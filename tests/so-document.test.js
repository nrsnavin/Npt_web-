/**
 * The sales order PDF on the order [pages/OrderDetail.jsx, pages/Orders.jsx; server:
 * order.controller `withSoDocument`]: the PDF the SO team uploaded on the enquiry's SO request,
 * opened from the order screen and the orders list.
 *
 *   node --test tests/so-document.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the order screen has a section for the sales order PDF, opened by its key, with where it came from', () => {
  const page = read('pages/OrderDetail.jsx');
  assert.match(page, /<Section title="The sales order PDF">/);
  assert.match(page, /<TaskPdfLink file=\{file\} className="text-sm" \/>/);
  assert.match(page, /on the SO request of \{order\.enquiry\.number \|\| 'the enquiry'\}/);
  assert.match(page, /Not uploaded yet — the SO team uploads it to finish/);
  assert.match(page, /<SoDocument order=\{order\} \/>\s*<PurchaseOrder/, 'beside the customer’s PO');
});

test('the orders list shows the PDF under the order number', () => {
  const list = read('pages/Orders.jsx');
  assert.match(list, /import TaskPdfLink from '\.\.\/components\/TaskPdfLink\.jsx';/);
  assert.match(list, /<TaskPdfLink file=\{order\.soDocument\} className="block" \/>/);
});

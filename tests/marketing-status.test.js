/**
 * The enquiry's "Current Marketing Status" — the fourteen options, on the enquiry and on each
 * row of the list [utils/pipeline.js MARKETING_STATUSES, components/MarketingStatusSelect.jsx].
 *
 *   node --test tests/marketing-status.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MARKETING_STATUSES, marketingStatusLabel } from '../src/utils/pipeline.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the fourteen options, in the order marketing works them', () => {
  assert.deepEqual(MARKETING_STATUSES.map((entry) => entry.label), [
    'Enquiry received', 'Photos to send', 'Photos sent', 'Model selection requested',
    'Sample requested', 'Sample sent', 'Quotation preparing', 'Quotation sent',
    'Pricing discussion', 'Price approved', 'PO awaiting', 'PO received', 'Sales order sent',
    'Task Closed',
  ]);
  assert.equal(marketingStatusLabel('po_awaiting'), 'PO awaiting');
});

test('the two that start work say so', () => {
  const starting = MARKETING_STATUSES.filter((entry) => entry.starts).map((entry) => entry.value);
  assert.deepEqual(starting, ['sample_requested', 'quotation_preparing']);
});

test('the enquiry panel and every list row use the same dropdown', () => {
  assert.match(read('components/EnquiryContactPanel.jsx'), /<MarketingStatusSelect enquiry=\{enquiry\} canWrite=\{canWrite\}/);
  const list = read('pages/Enquiries.jsx');
  assert.match(list, /<MarketingStatusSelect enquiry=\{enquiry\} canWrite=\{mayWrite\} onChanged=\{reload\} compact \/>/);
  assert.match(list, /marketingStatus: marketing \|\| undefined/, 'and the list filters by it');
  const select = read('components/MarketingStatusSelect.jsx');
  assert.match(select, /enquiriesApi\.setMarketingStatus\(\{ id: enquiry\._id, status: next \}\)/);
  assert.match(select, /setValue\(previous\)/, 'a refusal puts the old value back');
});

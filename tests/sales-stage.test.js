/**
 * The sales stage in step with the task stage [utils/salesStage.js, components/SalesStageBadge.jsx;
 * server: services/salesStage.service.js]: the sales status in the sales stages, the plant's stage past PO & SO.
 *
 *   node --test tests/sales-stage.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { salesStageOf } from '../src/utils/salesStage.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const stages = [{ key: 'production_edd', label: 'Production / EDD' }, { key: 'invoice_dispatch', label: 'Invoice & Dispatch' }];

test('in the sales stages it is the sales status; past PO & SO it is the plant stage', () => {
  assert.deepEqual(salesStageOf({ stage: 'sample', status: 'sample_feedback_pending' }, stages), { status: 'sample_feedback_pending', label: 'Sample feedback' });
  assert.deepEqual(salesStageOf({ stage: 'invoice_dispatch', status: 'sample_feedback_pending' }, stages), { status: 'won', label: 'Invoice & Dispatch' });
  assert.deepEqual(salesStageOf({ stage: 'production_edd', status: 'won' }, stages), { status: 'won', label: 'Production / EDD' });
  assert.equal(salesStageOf({ stage: 'production_edd', status: 'hold' }, stages).label, 'On hold', 'on hold says so wherever it is');
  assert.equal(salesStageOf({ stage: 'closed', status: 'lost' }, stages).label, 'Lost');
});

test('the enquiry list, the enquiry page and the customer page show it the same way', () => {
  for (const page of ['pages/Enquiries.jsx', 'pages/EnquiryDetail.jsx', 'pages/CustomerDetail.jsx']) {
    assert.match(read(page), /<SalesStageBadge enquiry=\{enquiry\} \/>/, page);
  }
  assert.match(read('components/SalesStageBadge.jsx'), /salesStageOf\(enquiry, catalogue\?\.stages \|\| \[\]\)/);
});

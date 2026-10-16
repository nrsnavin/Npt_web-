/**
 * The costing and the quotation are one record [server: models/Quotation.js].
 *
 * Read as text because `node --test` here has no JSX loader.
 *
 *   node --test tests/quotation-merge.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const path = (file) => new URL(`../src/${file}`, import.meta.url);
const read = (file) => readFileSync(path(file), 'utf8');

test('there is no separate costing sheet any more, and old links land on the quotations', () => {
  for (const gone of ['pages/Pricings.jsx', 'pages/PricingDetail.jsx', 'components/QuoteFromCosting.jsx']) {
    assert.equal(existsSync(path(gone)), false, `${gone} is still there`);
  }
  assert.match(read('App.jsx'), /path="pricings\/\*" element=\{<Navigate to="\/quotations" replace \/>\}/);
  assert.doesNotMatch(read('api/endpoints.js'), /export const pricings/);
});

test('the quotation page is where a line is costed, signed off and sent', () => {
  const page = read('pages/QuotationDetail.jsx');
  assert.match(page, /<CostingSheetForm quotation=\{quotation\} line=\{costing\}/);
  assert.match(page, /seesCost && !closed &&/, 'Cost appears only for whoever the server sent the cost to');
  assert.match(page, /maySign && line\.status === 'approval_pending'/, 'only Admin approves');
  assert.match(page, /mayQuote && sendable &&/, 'marketing or the Quotation department sends');
  assert.match(read('components/CostingSheetForm.jsx'), /quotationsApi\.cost\(\{\s*id: pricing\._id, lineId: row\._id/);
});

test('a price may be left for the Quotation department, and the list opens on its queue', () => {
  const list = read('pages/Quotations.jsx');
  assert.match(list, /Blank — the Quotation department prices it/);
  assert.match(list, /useState\(params\.get\('status'\) \|\| ''\)/);
  assert.match(read('config/departments.js'), /label: 'To cost', to: '\/quotations\?status=costing'/);
});

test('the enquiry page has no "What happens next" panel', () => {
  assert.doesNotMatch(read('pages/EnquiryDetail.jsx'), /EnquiryActions/);
});

test('a withdrawn quotation is closed everywhere the web decides what is closed', () => {
  /* The plant pulled it — the enquiry closed or lost before the buyer answered [docs/QUOTATION-AUDIT.md #4]. */
  const register = read('pages/Quotations.jsx');
  assert.match(register, /export const CLOSED_QUOTATION_STATUSES = \['accepted', 'rejected', 'withdrawn'\]/);
  assert.match(register, /value: 'withdrawn', label: 'Withdrawn'/, 'the register can filter to them');
  for (const page of ['pages/QuotationDetail.jsx', 'pages/SentQuotations.jsx']) {
    const source = read(page);
    assert.match(source, /CLOSED_QUOTATION_STATUSES\.includes/, `${page} reads the one list`);
    assert.doesNotMatch(source, /\['accepted', 'rejected'\]\.includes/, `${page} keeps no list of its own`);
  }
  assert.match(read('utils/statusStyles.js'), /withdrawn: 'neutral'/);
  const detail = read('pages/QuotationDetail.jsx');
  assert.match(detail, /Withdrawn — the enquiry behind it was closed/);
  assert.match(detail, /answered after the validity/, 'and a late answer is said on the screen');
});

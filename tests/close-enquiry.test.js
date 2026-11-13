/**
 * Admin closes an enquiry and records how it ended [components/CloseEnquiry.jsx; server:
 * services/enquiryClosure.service.js].
 *
 *   node --test tests/close-enquiry.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { salesStageOf } from '../src/utils/salesStage.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the endpoints: the outcomes to pick from, and the close with its outcome', () => {
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /closeOutcomes: \(\) => api\.get\('\/enquiry-close-outcomes'\)/);
  assert.match(endpoints, /closeOut: \(\{ id, \.\.\.payload \}\) => api\.post\(`\/enquiries\/\$\{id\}\/close-out`, payload\)/);
});

test('the enquiry page: Admin closes with how it ended, records it on one already closed, and it shows at the top', () => {
  const page = read('pages/EnquiryDetail.jsx');
  assert.match(page, /\{isAdmin && <CloseEnquiry enquiry=\{enquiry\} onClosed=\{reload\} \/>\}/);
  assert.match(page, /enquiry\.stage === 'closed' && enquiry\.closure\?\.outcome && \(/);
  assert.match(page, /<ClosureLine enquiry=\{enquiry\} \/>/);
  const dialog = read('components/CloseEnquiry.jsx');
  assert.match(dialog, /How did it end\?/);
  assert.match(dialog, /'Change how it ended' : 'Record how it ended'\) : 'Close enquiry'/);
  assert.match(dialog, /enquiriesApi\.closeOut\(\{/);
  assert.match(dialog, /max=\{todayInIndia\(\)\}/, 'what has already happened — no day to come');
  assert.match(dialog, /Why was it cancelled\?/);
});

test('a closed enquiry reads its outcome in the Sales stage column', () => {
  assert.deepEqual(salesStageOf({ stage: 'closed', status: 'won', closure: { outcome: 'dispatched', label: 'Dispatched' } }), { status: 'won', label: 'Dispatched' });
  assert.deepEqual(salesStageOf({ stage: 'closed', status: 'lost', closure: { outcome: 'cancelled_after_quote', label: 'Cancelled after quotation' } }), { status: 'lost', label: 'Cancelled after quotation' });
  assert.equal(salesStageOf({ stage: 'closed', status: 'won' }).label, 'Won', 'no outcome recorded: as before');
});

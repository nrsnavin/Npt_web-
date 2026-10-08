/**
 * Marketing's call log on screen [server: controllers/pipeline.controller.js
 * `logEnquiryActivity`, `listEnquiryActivities`].
 *
 * Read as text because `node --test` here has no JSX loader.
 *
 *   node --test tests/enquiry-activities.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the enquiry page carries the call log, for whoever may read enquiries', () => {
  const page = read('pages/EnquiryDetail.jsx');
  assert.match(page, /mayReadEnquiries && <EnquiryActivities enquiry=\{enquiry\} canWrite=\{mayWrite\}/);
});

test('logging sends the kind, the note and the next step, and only offers a next step while open', () => {
  const log = read('components/EnquiryActivities.jsx');
  assert.match(log, /enquiriesApi\.logActivity\(\{/);
  assert.match(log, /nextAction: \(open && values\.nextAction\.trim\(\)\) \|\| undefined/);
  assert.match(log, /\{open && \(/);
  assert.match(log, /enquiriesApi\.activityTypes\(\)/, 'the kinds come from the server list');
});

test('the Activities page is routed behind the enquiries module and linked for marketing', () => {
  assert.match(read('pages/Activities.jsx'), /enquiriesApi\.activities\(/);
  assert.match(read('App.jsx'), /path="activities"\s*element=\{\s*<RequireModule moduleKey="enquiries">\s*<Activities \/>/);
  assert.match(read('config/departments.js'), /label: 'Activities', to: '\/activities', module: 'enquiries'/);
  assert.match(read('api/endpoints.js'), /activities: \(params\) => api\.get\('\/enquiries\/activities'/);
});

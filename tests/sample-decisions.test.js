/**
 * Two sampling decisions on the screens [the sampling audit, items 7 and 8]: marketing's answer
 * to Not available (wait, change the spec, cancel) on the sample page, and the exact-colour
 * condition stepped past out loud at dispatch — ticked, with a reason, marketing told — on the
 * sample page and the work queue's handover form.
 *
 *   node --test tests/sample-decisions.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Not available asks marketing on the sample page: three choices, a note, the edit form for a spec change', () => {
  const detail = read('pages/SampleDetail.jsx');
  assert.match(detail, /function NotAvailableDecision\(\{ sample, onSaved, onEdit \}\)/);
  assert.match(detail, /\['wait', 'Wait for a run'/);
  assert.match(detail, /\['change', 'Change the spec'/);
  assert.match(detail, /\['cancel', 'Cancel the request'/);
  assert.match(detail, /samplesApi\.decideNotAvailable\(\{ id: sample\._id, choice, note: text\(note\) \}\)/);
  assert.match(detail, /const short = needsNote && note\.trim\(\)\.length < 5;/, 'cancel and change need a note');
  assert.match(detail, /sample\.status === 'not_available' && \(canWrite\('enquiries'\) \|\| \(!sample\.customer && maySample\)\)/, 'marketing’s, or the bench’s on a trial with no buyer');
  assert.match(read('api/endpoints.js'), /api\.post\(`\/samples\/\$\{id\}\/not-available`, payload\)/);
});

test('the exact colour is stepped past only out loud: a tick and a reason, on both dispatch forms', () => {
  const detail = read('pages/SampleDetail.jsx');
  assert.match(detail, /Send it anyway — marketing is told/);
  assert.match(detail, /colourOverride: true, colourOverrideReason: anywayReason\.trim\(\)/);
  assert.match(detail, /sample\.colourMandatory && !\(anyway && anywayReason\.trim\(\)\.length >= 5\)/, 'the button stays shut until the reason is there');

  const queue = read('components/SamplingWorkQueue.jsx');
  assert.match(queue, /const exactBroken = substituting && row\.models\?\.some\(\(item\) => item\.colourMandatory\);/);
  assert.match(queue, /const stepOk = !exactBroken \|\| \(anyway && anywayReason\.trim\(\)\.length >= 5\);/);
  assert.match(queue, /Send it anyway — marketing is told/);
  assert.match(queue, /colourOverride: true, colourOverrideReason: anywayReason\.trim\(\)/);
});

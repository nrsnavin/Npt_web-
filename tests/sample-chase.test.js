/**
 * Chase and summarise, the approval analytics, problem flags and the rack on the screens [the
 * sampling audit, items 5, 10, 11 and 12].
 *
 *   node --test tests/sample-chase.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the sampling home carries the bench summary, and each job its nudge and its flagged problem', () => {
  const home = read('pages/SampleHome.jsx');
  assert.match(home, /aria-label="This morning on the bench"/);
  assert.match(home, /\{meta\.summary\.text\}/);
  assert.match(home, /Read by the assistant from the queue — the rows below are the record/);
  assert.match(home, /Problem flagged: \{sample\.problem\.words\}/);
  assert.match(home, /\{sample\.nudge\}/);
  assert.match(home, /<SampleRack \/>/);

  const queue = read('components/SamplingWorkQueue.jsx');
  assert.match(queue, /Problem flagged: \{row\.problem\.words\}/);
  assert.match(queue, /\{row\.nudge && <p/);
  assert.match(queue, /A chase to the buyer is drafted on the sample/);
});

test('the chase is sent by a person from the sample, drafted or not; the problem shows on the sample', () => {
  const detail = read('pages/SampleDetail.jsx');
  assert.match(detail, /\{sample\.chaseDraft\?\.body \? 'Chase the buyer — draft ready' : 'Chase the buyer'\}/);
  assert.match(detail, /event="sample_feedback_chase"/);
  assert.match(detail, /mayMessage && withCustomer && sample\.customer && \(/, 'only once the buyer has it');
  assert.match(detail, /The bench flagged a problem — <span className="font-bold">\{sample\.problem\.words\}<\/span>/);
  assert.match(read('utils/pipeline.js'), /\{ value: 'sample_feedback_chase', label: 'Feedback chase' \}/);
});

test('the rack is a stock list: counted by the bench, read before a visit, shown on the hand-over form', () => {
  const rack = read('components/SampleRack.jsx');
  assert.match(rack, /samplesApi\.setRack\(lines\)/);
  assert.match(rack, /samplesApi\.removeRackLine\(row\._id\)/);
  assert.match(rack, /Empty — top up/);
  assert.match(rack, /const mayCount = canWrite\('samples'\);/);
  const api = read('api/endpoints.js');
  assert.match(api, /rack: \(\) => api\.get\('\/samples\/rack'\)/);
  assert.match(api, /setRack: \(rows\) => api\.put\('\/samples\/rack', \{ rows \}\)/);
  const detail = read('components/SampleHandOverForm.jsx');
  assert.match(detail, /On the rack: \{rack\.map/);
  assert.match(detail, /the rack is empty for one of these/);
});

test('the analytics say what the buyer said by model, purpose and bench member, and count the compulsory colours missed', () => {
  const page = read('pages/SampleAnalytics.jsx');
  assert.match(page, /function ApprovalTable\(\{ rows, labelOf = \(row\) => row\.label, empty \}\)/);
  assert.match(page, /<ApprovalTable rows=\{approval\?\.byModel\}/);
  assert.match(page, /<ApprovalTable rows=\{approval\?\.byPurpose\} labelOf=\{\(row\) => optionLabel\(SAMPLE_PURPOSES, row\.label\)\}/);
  assert.match(page, /<ApprovalTable rows=\{approval\?\.byBench\}/);
  assert.match(page, /Section title="Compulsory colours missed"/);
  assert.match(page, /label="Stepped past" value=\{colourMisses\.steppedPast\}/);
  assert.match(page, /asked \{row\.asked\}, sent \{row\.sent\}/);
});

/**
 * Each model's own journey on the Production, Printing and Assembly screens [components/
 * ModelJourney.jsx; server: handoff.service `modelJourneys`]: one line a model, its route's
 * steps with where it stands on each — marked as well as coloured.
 *
 *   node --test tests/model-journey.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('a line a model: its steps in order, each with its status, marked ✓ ● ! ○ beside the colour', () => {
  const journey = read('components/ModelJourney.jsx');
  for (const mark of ["mark: '✓'", "mark: '●'", "mark: '!'", "mark: '○'"]) assert.ok(journey.includes(mark), mark);
  assert.match(journey, /\{index > 0 && <span className="text-steel-600" aria-hidden="true">→<\/span>\}/);
  assert.match(journey, /title=\{`\$\{step\.label\}: \$\{step\.status\}\$\{step\.date \? ` · \$\{step\.dateLabel\} \$\{formatDate\(step\.date\)\}` : ''\}`\}/);
  assert.match(journey, /aria-label=\{`\$\{row\.model\}: \$\{row\.steps\.map/, 'read out as a sentence too');
});

test('on the Production and Printing / Assembly queues, and the workflow page', () => {
  for (const list of ['components/ProductionQueueList.jsx', 'components/FinishingQueueList.jsx']) {
    assert.match(read(list), /<ModelJourney journeys=\{row\.journeys\} compact \/>/, list);
  }
  assert.match(read('pages/ProductionWorkflow.jsx'), /<Section title="Each model’s journey">\s*<ModelJourney journeys=\{data\.journeys\} \/>/);
});

test('model by model dates: hand-over to the next team or completion on each step, the EDD beside the estimated completion', () => {
  const journey = read('components/ModelJourney.jsx');
  assert.match(journey, /\{step\.dateKind === 'handover' \? 'hand-over' : 'completion'\} `\}\{day\(step\.date\)\}/);
  assert.match(journey, /EDD \{row\.edd \? formatDate\(row\.edd\) : 'not set'\}/);
  assert.match(journey, /Completion \{row\.completion \? formatDate\(row\.completion\) : 'not given yet'\}\{row\.late \? ' — after the EDD' : ''\}/);
});

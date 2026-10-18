/**
 * The two ways a sample reaches the buyer without a courier: collected at reception, and
 * handed over by the marketing person from the sample rack [server: tests/sample-handover.test.js].
 *
 *   node --test tests/sample-handover.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAMPLE_HANDOVERS } from '../src/utils/pipeline.js';
import { briefEntries } from '../src/utils/taskForm.js';
import { workspaceFor } from '../src/config/departments.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the three hand-over modes match the server, each with a short name for the list', () => {
  assert.deepEqual(SAMPLE_HANDOVERS.map((option) => option.value), ['dispatch', 'collect', 'in_person']);
  for (const option of SAMPLE_HANDOVERS) assert.ok(option.short, `${option.value} has no short label`);
  assert.ok(SAMPLE_HANDOVERS.find((option) => option.value === 'collect').hint.includes('Reception'));
});

test('the request form asks how it reaches the buyer, only when raising', () => {
  const form = read('components/SampleRequestForm.jsx');
  assert.match(form, /label="How it reaches the buyer"/);
  assert.match(form, /\.\.\.\(editing \? \{\} : \{ handover: values\.handover \|\| 'dispatch' \}\)/);
});

test('the sample page offers the hand-over to marketing, not on a collection', () => {
  const page = read('pages/SampleDetail.jsx');
  assert.match(page, /sample\.handover !== 'collect'/);
  assert.match(page, /samplesApi\.handOver\(/);
  assert.match(page, /<HandoverCard sample=\{sample\} \/>/);
  const api = read('api/endpoints.js');
  assert.match(api, /handOver: \(\{ id, photo, \.\.\.fields \}\)/);
  assert.match(api, /`\/samples\/\$\{id\}\/hand-over`/);
});

test('a move that records something opens the form and sends the fields', () => {
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /const asks = step\.fields \|\| \[\]/);
  assert.match(workflow, /\.\.\.\(asks\.length \? \{ fields \} : \{\}\)/);
});

test('the record id stays off the Reception task card', () => {
  const button = { asks: [{ key: 'sample', label: 'Sample record', hidden: true }, { key: 'sampleNumber', label: 'Sample' }] };
  const shown = briefEntries(button, { sample: '665f1c2a9b1e8a0012345678', sampleNumber: 'SMP-0001' });
  assert.equal(shown.some((entry) => String(entry.value || entry[1] || '').includes('665f')), false);
});

test('Reception’s desk links the samples a buyer comes in for', () => {
  assert.ok(workspaceFor('reception').pages.some((page) => page.to === '/samples?handover=collect'));
  const list = read('pages/Samples.jsx');
  assert.match(list, /searchParams\.get\('handover'\)/);
});

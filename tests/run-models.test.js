/**
 * Start a run from a Production task [pages/MouldRuns.jsx `StartRun`; server: records.service
 * `runModelsOf`]: the model list holds only the enquiry's models, and pieces planned stop at 10%
 * over what was ordered of the model.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('only the enquiry’s models, with the full mould list kept for a stock run or an enquiry naming none', () => {
  const page = read('pages/MouldRuns.jsx');
  assert.match(page, /mouldRunsApi\.models\(\{ enquiry: values\.enquiry/);
  assert.match(page, /<Field label="Model" required hint="Only this enquiry’s models">/);
  assert.match(page, /models\.length \? \(/);
  assert.match(page, /: <Field label="Mould" required><MouldSelect/);
  assert.match(read('api/endpoints.js'), /models: \(params\) => api\.get\('\/mould-runs\/models'/);
});

test('pieces planned: at most 10% over the pieces ordered, said and enforced', () => {
  const page = read('pages/MouldRuns.jsx');
  assert.match(page, /Number\(values\.plannedQuantity\) > chosenModel\.most/);
  assert.match(page, /At most \$\{formatNumber\(chosenModel\.most\)\} — 10% over the/);
  assert.match(page, /disabled=\{busy \|\| tooMany \|\|/);
});

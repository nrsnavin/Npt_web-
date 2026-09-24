/**
 * What a costing sheet was built from — the resin, the hook, the clips, the print job.
 *
 * The pickers on the sheet filled the rates onto the cost lines and the choice itself was never
 * sent, so every page after the sheet had no resin or part to name and re-opening it showed the
 * pickers empty. These pin the two halves: only a changed choice is sent (an unchanged one would
 * make the server refill lines somebody typed), and the pages name what was chosen.
 *
 *   node --test tests/costing-choices.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changedParts, costedWith } from '../src/utils/pricing.js';

const saved = {
  mould: { _id: 'm1' },
  materialRef: { _id: 'r1', name: 'HIPS Natural' },
  hookRef: 'h1',
  clipRef: null,
  printRef: undefined,
};

test('a choice nobody changed is not sent again', () => {
  assert.deepEqual(changedParts({ mould: 'm1', materialRef: 'r1', hookRef: 'h1', clipRef: '', printRef: '' }, saved), {});
});

test('a new choice is sent, and a cleared one is sent as null', () => {
  assert.deepEqual(
    changedParts({ mould: 'm1', materialRef: 'r2', hookRef: '', clipRef: 'c1', printRef: 'p1' }, saved),
    { materialRef: 'r2', hookRef: null, clipRef: 'c1', printRef: 'p1' }
  );
});

test('a first costing sends every part that was picked', () => {
  assert.deepEqual(
    changedParts({ mould: '', materialRef: 'r1', hookRef: 'h1', clipRef: 'c1', printRef: 'p1' }, {}),
    { materialRef: 'r1', hookRef: 'h1', clipRef: 'c1', printRef: 'p1' }
  );
});

test('the sheet actually sends them', () => {
  const form = readFileSync(new URL('../src/components/CostingSheetForm.jsx', import.meta.url), 'utf8');
  const submit = form.slice(form.indexOf('await pricingsApi.cost('), form.indexOf('onClose();', form.indexOf('await pricingsApi.cost(')));
  assert.match(submit, /\.\.\.chosenParts\(\)/, 'the save leaves the chosen parts behind');
  assert.match(form, /changedParts\(\{ mould, materialRef, hookRef, clipRef, printRef \}, row\)/);
});

test('what a model was costed with reads as one line, naming only what was chosen', () => {
  assert.equal(
    costedWith({
      materialRef: { name: 'HIPS Natural' },
      hookRef: { name: 'Fixed PP hook' },
      clipRef: { name: 'Metal clip pair' },
      printRef: { name: '1 colour screen' },
    }),
    'HIPS Natural · Fixed PP hook · Metal clip pair · 1 colour screen'
  );
  assert.equal(costedWith({ material: 'pp', hookRef: { name: 'Swivel' } }), 'PP · Swivel');
  assert.equal(costedWith({}), '');
});

test('the review step, the quote and the detail page all name the parts', () => {
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  assert.match(read('components/CostingSteps.jsx'), /costedWith\(line\)/);
  assert.match(read('components/QuoteFromCosting.jsx'), /costedWith\(row\)/);
  const detail = read('pages/PricingDetail.jsx');
  for (const part of ['hookRef', 'clipRef', 'printRef']) {
    assert.match(detail, new RegExp(`partLabel\\('[^']+', line\\.${part}\\)`), `the breakdown does not name the ${part}`);
  }
});

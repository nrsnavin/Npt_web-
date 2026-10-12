/**
 * The costing sheet shows what this mould in this material was quoted at before, once both are
 * picked [components/PreviousQuotes.jsx; server: quotation.controller `previousQuotes`].
 *
 *   node --test tests/previous-quotes.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the costing sheet asks for earlier quotes on the picked mould and material, leaving itself out', () => {
  const form = read('components/CostingSheetForm.jsx');
  assert.match(form, /<PreviousQuotes mould=\{mould\} material=\{materialRef\} hook=\{hookRef\} clip=\{clipRef\} exclude=\{pricing\._id\} \/>/);
  assert.match(read('api/endpoints.js'), /previous: \(params\) => api\.get\('\/quotations\/previous', \{ params, feedback: false \}\)/);
});

test('each earlier quote names its hook, clips, print and packing; the same parts come first', () => {
  const panel = read('components/PreviousQuotes.jsx');
  assert.match(panel, /if \(!mould \|\| !material\) return null;/, 'nothing until both are picked');
  for (const label of ['Hook', 'Clips', 'Print', 'Packing']) assert.ok(panel.includes(`<dt>${label}</dt>`), `${label} on each row`);
  assert.match(panel, /title="Same hook and clips"/);
  assert.match(panel, /Same mould and material, other parts/);
  assert.match(panel, /row\.cost != null &&/, 'the cost only when the server sent it');
});

/**
 * The trading master on screen [pages/TradingMaster.jsx, components/TradingUpload.jsx,
 * components/TradedItemForm.jsx, components/CostingSheetForm.jsx].
 *
 *   node --test tests/trading-master.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('it is a register under Masters, with its own pages', () => {
  assert.match(read('components/Layout.jsx'), /\{ to: '\/trading', label: 'Trading master', module: 'materials' \}/);
  const app = read('App.jsx');
  assert.match(app, /path="trading"/);
  assert.match(app, /path="trading\/:id"/);
  assert.match(read('config/departments.js'), /label: 'Trading master', to: '\/trading'/, 'on the Quotation desk');
});

test('keeping it, and seeing the price, is the costing grant', () => {
  const page = read('pages/TradingMaster.jsx');
  assert.match(page, /const mayKeep = canWrite\('pricing'\);/);
  assert.match(page, /\{mayKeep && \(\s*<>\s*<button[^>]*onClick=\{\(\) => setUploading\(true\)\}/);
  assert.match(page, /\{seesPrice && <SortHeader field="inwardPrice"/);
});

test('an upload is previewed before anything is written', () => {
  const upload = read('components/TradingUpload.jsx');
  assert.match(upload, /importSheet\(\{ file: chosen, commit: false \}\)/, 'choosing the file only previews');
  assert.match(upload, /importSheet\(\{ file, commit: true \}\)/, 'the import button writes');
  assert.match(upload, /disabled=\{busy \|\| !preview \|\| writes === 0\}/);
  assert.match(upload, /Download the template/);
  assert.match(read('api/endpoints.js'), /api\.post\('\/traded-items\/import', form, \{ feedback: commit \}\)/);
});

test('a traded line is costed at the inward price, picked from the master', () => {
  const form = read('components/CostingSheetForm.jsx');
  assert.match(form, /\{procurement === 'trade' && \(\s*<Field label="Trading master item"/);
  assert.match(form, /costField\('inwardPrice', 'Inward price'/);
  assert.match(form, /'packingCost', 'otherCost', 'inwardPrice'\]\.reduce\(/, 'the net total counts it');
  assert.match(form, /\.\.\.\(tradedItem !== openedItem \? \{ tradedItem: tradedItem \|\| null \} : \{\}\)/,
    'sent only when the pick changed, so a typed price is not refilled');
});

test('a price change asks why, and the form refuses a row without model or price', () => {
  const form = read('components/TradedItemForm.jsx');
  assert.match(form, /\{priceMoved && \(\s*<Field label="Why the price moved"/);
  assert.match(form, /disabled=\{busy \|\| !values\.modelNumber\.trim\(\) \|\| values\.inwardPrice === ''\}/);
});

/**
 * Floor planning's checkpoint on the web [pages/TradedSupply.jsx, components/TaskPressPlan.jsx]:
 * traded models are bought in, never on a press — the Production team moves them on the Traded
 * items page, and the task shows where their supply stands.
 *
 *   node --test tests/traded-supply.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('each status says itself, and offers the next step first', async () => {
  const { TRADE_STATUS, tradeActions } = await import('../src/utils/trading.js');
  assert.deepEqual(Object.keys(TRADE_STATUS), ['to_order', 'ordered', 'part_received', 'received', 'cancelled']);
  assert.deepEqual(tradeActions('to_order').map((action) => action.move), ['cancelled', 'received', 'ordered']);
  assert.equal(tradeActions('to_order').find((action) => action.primary).label, 'Mark ordered');
  assert.equal(tradeActions('ordered').find((action) => action.primary).label, 'Received');
  assert.equal(tradeActions('part_received').find((action) => action.primary).label, 'Received more');
  assert.deepEqual(tradeActions('received'), []);
  assert.deepEqual(tradeActions('cancelled'), []);
});

test('a traded model on the task is its own quiet row, never a press', async () => {
  const { modelPress, pressAttention } = await import('../src/utils/floorPlanning.js');
  const traded = { model: 'PH-17', workOrder: null, traded: { status: 'ordered', late: false } };
  const late = { model: 'PH-18', workOrder: null, traded: { status: 'to_order', late: true } };
  assert.deepEqual([modelPress(traded).key, modelPress(traded).words, modelPress(traded).tone], ['traded', 'Traded · ordered', 'neutral']);
  assert.equal(modelPress(late).tone, 'danger');
  const counts = pressAttention([traded]);
  assert.deepEqual([counts.traded, counts.waiting, counts.planned, counts.proposed], [1, 0, 0, 0], 'nothing for the in charge to plan');
  const plan = read('components/TaskPressPlan.jsx');
  assert.match(plan, /if \(state\.key === 'traded'\) return <TradedRow row=\{row\} state=\{state\} \/>;/);
  assert.match(plan, /<Link to="\/production\/trading" className="row-action px-2 py-1 text-xs">Traded items<\/Link>/);
});

test('the Traded items page: Production moves each line, others only read it', () => {
  const page = read('pages/TradedSupply.jsx');
  assert.match(page, /const mayMove = canWrite\('production'\);/);
  assert.match(page, /\{mayMove && \(/);
  assert.match(page, /productionApi\.updateTrade\(\{ id: moving\.line\._id, \.\.\.body \}\)/);
  assert.match(page, /onSave\(\{ status: 'ordered', expectedOn, supplier, supplierRef \}\)/);
  assert.match(page, /status: Number\(receivedQty\) >= \(line\.quantity \|\| 0\) \? 'received' : 'part_received'/);
  assert.match(page, /After the day it is needed/);
  assert.doesNotMatch(page, /inwardPrice|price/i, 'the cost of a traded item never shows here');
  assert.match(read('App.jsx'), /path="production\/trading"/);
  assert.match(read('config/departments.js'), /\{ label: 'Traded items', to: '\/production\/trading', module: 'production'/);
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /trading: \(params\) => api\.get\('\/production\/trading', \{ params \}\)/);
  assert.match(endpoints, /updateTrade: \(\{ id, \.\.\.body \}\) => api\.patch\(`\/production\/trading\/\$\{id\}`, body/);
});

test('a traded model printed or assembled says its route and its hand-over, and is handed on when all is in', async () => {
  const { tradeRoute, tradeDueLabel, receivedWords } = await import('../src/utils/trading.js');
  const both = { route: { printing: true, assembly: true }, handsTo: 'Printing' };
  const assembled = { route: { printing: false, assembly: true }, handsTo: 'Assembly' };
  const plain = { route: { printing: false, assembly: false }, handsTo: null };
  assert.deepEqual([both, assembled, plain].map(tradeRoute), ['Printing → Assembly', 'Assembly', 'Dispatch']);
  assert.deepEqual([both, assembled, plain].map(tradeDueLabel), ['to Printing by', 'to Assembly by', 'needed by']);
  assert.equal(receivedWords(both), 'All in — handed to Printing; their task has it now.');
  assert.equal(receivedWords(plain), 'All in — ready for dispatch.');
  const page = read('pages/TradedSupply.jsx');
  assert.match(page, /\{` → \$\{tradeRoute\(line\)\}`\}/);
  assert.match(page, /line\.status === 'received' \? receivedWords\(line\) : undefined/);
  assert.match(read('components/TaskPressPlan.jsx'), /\{tradeDueLabel\(line\)\}/);
});

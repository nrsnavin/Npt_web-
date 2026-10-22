/**
 * Against the EDD on the production queue [components/ProductionQueueList.jsx; server:
 * productionRisk.service]: red past the EDD, orange when the quantity cannot be moulded in the
 * days left, yellow close to the EDD, green on track — on the row's edge, as a chip, as a filter,
 * and in the CSV.
 *
 *   node --test tests/production-risk.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { queueCsv } from '../src/utils/productionQueue.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const list = read('components/ProductionQueueList.jsx');

test('four colours: red, orange, yellow, green — on the edge, the chip and the filter', () => {
  assert.match(list, /late: \{ edge: 'border-l-danger-500'/);
  assert.match(list, /at_risk: \{ edge: 'border-l-orange-500'/);
  assert.match(list, /close: \{ edge: 'border-l-warn-500'/);
  assert.match(list, /on_track: \{ edge: 'border-l-success-500'/);
  assert.match(list, /export const RISK_ORDER = \['late', 'at_risk', 'close', 'on_track'\];/);
  assert.match(list, /const riskTone = RISK_TONE\[row\.risk\?\.level\] \|\| null;/);
  assert.match(list, /\$\{riskTone \? riskTone\.edge : tone\.edge\}/, 'the reading colours the edge; the band does where there is none');
  assert.match(list, /\{riskTone\.label\}<\/span>\s*<span className="text-steel-300">\{row\.risk\.why\}<\/span>/, 'the chip says why');
  assert.match(list, /aria-label="Against the EDD"/);
  assert.match(list, /\{meta\?\.risk\?\.\[level\] \|\| 0\}/, 'counted from the server');
  assert.match(list, /if \(risk !== 'all' && row\.risk\?\.level !== risk\) return false;/);
});

test('the CSV carries the reading beside the EDD', () => {
  const csv = queueCsv([{ enquiry: { number: 'ENQ-1', customer: { name: 'Aruna Knits' }, edd: { date: '2026-10-24' } }, risk: { level: 'at_risk', why: 'May miss the EDD — 5 days on the press for 30,000 pcs, 2 days left' }, models: [{ model: 'NPT-410V' }], summary: 'Started' }], new Date('2026-10-22T06:00:00Z'));
  const [header, line] = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(header, 'EDD,Due,Against the EDD,Enquiry,Buyer,Models,SO,Status,Work orders');
  assert.match(line, /^2026-10-24,in 2 days,"May miss the EDD — 5 days on the press for 30,000 pcs, 2 days left",ENQ-1,Aruna Knits/);
});

/**
 * The supplier check: a bought-in piece's making cost from the trading master's build-up, set
 * against the supplier's inward price [utils/quoteBuilder.js `makeCostOf`, `supplierCheck`;
 * components/SupplierCheck.jsx; shown on the costing sheet, the quote builder and the item].
 *
 *   node --test tests/supplier-check.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeCostOf, supplierCheck } from '../src/utils/quoteBuilder.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const traded = {
  modelNumber: 'PH-17',
  inwardPrice: 4.6,
  buildUp: {
    material: { _id: 'm1', name: 'HIPS Black', ratePerKg: 100, grammageFactorPercent: 18.8 },
    partWeightGrams: 20, runnerWeightGrams: 5, jobWorkCost: 0.5, hookCost: 0.6, clipsCost: 0, packingCost: 0.2,
  },
};

test('the making cost is the grams in the named resin at its rate, plus job work, hook, clips and packing — no margin', () => {
  const make = makeCostOf(traded);
  assert.equal(make.resin, 'HIPS Black');
  assert.equal(make.grams, 29.7, '25 g as PP, 18.8% heavier in HIPS');
  assert.equal(make.ratePerKg, 100);
  assert.equal(make.material, 2.97);
  assert.equal(make.total, 4.27);
  assert.equal(make.known, true);
});

test('a rate typed on the item wins over the resin’s; without grams or a rate the parts alone are known', () => {
  assert.equal(makeCostOf({ buildUp: { ...traded.buildUp, ratePerKg: 90 } }).material, 2.67);
  const parts = makeCostOf({ buildUp: { hookCost: 0.6, clipsCost: 0.4 } });
  assert.equal(parts.known, false);
  assert.equal(parts.hasParts, true);
  assert.equal(parts.total, 1);
  assert.equal(makeCostOf(null).total, 0);
});

test('the check says what the supplier keeps over the making cost, and the making cost at 10% and 20%', () => {
  const check = supplierCheck(traded, 4.6);
  assert.equal(check.inward, 4.6);
  assert.equal(check.margin, 0.33);
  assert.equal(check.percent, 7.7, 'markup on the making cost, as the plant’s tiers are');
  assert.deepEqual(check.at, [[10, 4.7], [20, 5.15]], 'rounded up to five paise, as a quote is');
  assert.equal(supplierCheck({ buildUp: {} }, 4), null, 'nothing to check without a build-up');
  assert.equal(supplierCheck(traded, 0).percent, null, 'no inward price yet: the making cost alone');
});

test('the panel is on the costing sheet, the quote builder and the item page; the form names the resin', () => {
  const sheet = read('components/CostingSheetForm.jsx');
  assert.match(sheet, /\{procurement === 'trade' && tradedRecord && <SupplierCheck traded=\{tradedRecord\} inwardPrice=\{cost\.inwardPrice\} \/>\}/);
  assert.match(sheet, /\{onTradingMaster && <SupplierCheck traded=\{onTradingMaster\}/, 'a made-here line whose model is on the trading master');
  assert.match(read('components/QuoteBuilder.jsx'), /\{seesCost && trade && traded && <SupplierCheck compact/);
  assert.match(read('pages/TradedItemDetail.jsx'), /<SupplierCheck traded=\{item\} inwardPrice=\{item\.inwardPrice\}/);
  const form = read('components/TradedItemForm.jsx');
  assert.match(form, /<Field label="Resin" hint="Its rate, and its grammage over PP">/);
  assert.match(form, /buildUp\.material = costs\.material \|\| null;/);
  const panel = read('components/SupplierCheck.jsx');
  for (const label of ['Making cost', 'Inward price', 'Supplier keeps', 'Making + 10%', 'Making + 20%']) assert.match(panel, new RegExp(`label="${label.replace('+', '\\+')}"`), label);
});

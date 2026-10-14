/**
 * The one-window quote form's arithmetic and payload [src/utils/quoteBuilder.js]. The cost tiles
 * have to add up the way the server's `costingFrom` does, or the suggested price on screen is
 * not the one that gets saved.
 *
 *   node --test tests/quote-builder.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AS_MOULD, MAX_ITEMS, NONE, blankItem, costOf, isBlank, isNamed, itemsFromEnquiry, lineFor, nudge,
  problemWith, samePrice, suggestedPrice,
} from '../src/utils/quoteBuilder.js';

const tool = {
  consumptionPerPieceGrams: 20, jobWorkCost: 1.1, packingCost: 0.4, hookCost: 0.6, clipsCost: 0, printingCost: 0.2, moq: 5000,
};
const hips = { ratePerKg: 118, grammageFactorPercent: 18 };
const hook = { ratePerPiece: 1.4 };

test('the grammage is the tool’s weight in the chosen resin, and the base adds every cost', () => {
  const cost = costOf({ ...blankItem(), hookRef: AS_MOULD, clipRef: AS_MOULD, printRef: NONE }, { tool, resin: hips });
  assert.equal(cost.gramWeight, 23.6);
  assert.equal(cost.materialCost, 2.78, '23.6 g × ₹118/kg');
  assert.equal(cost.hookCost, 0.6, 'the mould’s own hook');
  assert.equal(cost.printingCost, 0, 'no printing');
  assert.equal(cost.base, 4.88, '2.7848 + 1.10 + 0.40 + 0.60');
  assert.equal(suggestedPrice(cost.exactBase, 10), 5.4, 'priced from the unrounded cost, as the server does');
});

test('the suggestion is worked from the exact cost, not the rounded tile', () => {
  /* 9.0909 g × ₹100/kg = ₹0.90909: rounded to ₹0.91 first, 10% would read ₹1.05 instead of ₹1.00. */
  const cost = costOf({ ...blankItem(), hookRef: NONE, clipRef: NONE }, { tool: { consumptionPerPieceGrams: 9.0909 }, resin: { ratePerKg: 100 } });
  assert.equal(cost.base, 0.91);
  assert.equal(suggestedPrice(cost.exactBase, 10), 1);
});

test('a hook from the register replaces the mould’s; "not required" costs nothing', () => {
  const picked = costOf({ ...blankItem(), hookRef: 'h1' }, { tool, resin: hips, hook });
  assert.equal(picked.hookCost, 1.4);
  const none = costOf({ ...blankItem(), hookRef: NONE }, { tool, resin: hips, hook });
  assert.equal(none.hookCost, 0);
});

test('nothing picked costs nothing, rather than NaN', () => {
  const cost = costOf(blankItem());
  assert.equal(cost.base, 0);
  assert.equal(suggestedPrice(cost.base, 10), undefined);
});

test('the suggested price is cost plus mark-up, rounded up to five paise', () => {
  assert.equal(suggestedPrice(4.88, 10), 5.4, '5.368 rounds up to 5.40');
  assert.equal(suggestedPrice(4.88, 15), 5.65);
});

test('the paise buttons move the rate on the grid and never below zero', () => {
  assert.equal(nudge('5.40', 5), '5.45');
  assert.equal(nudge('5.40', -10), '5.30');
  assert.equal(nudge('0.05', -10), '0.00');
  assert.equal(nudge('', 10), '0.10');
  assert.ok(samePrice('5.40', 5.4));
  assert.ok(!samePrice('', 5.4));
});

test('an enquiry’s models arrive as items, ten at most', () => {
  const enquiry = {
    items: [
      { mould: { _id: 'm1' }, materialRef: 'mat1', colour: 'White', hookRef: 'h1' },
      { modelNumber: 'Velvet 450' },
      { category: 'shirt' },
    ],
  };
  const items = itemsFromEnquiry(enquiry);
  assert.equal(items.length, 2, 'a row naming neither a mould nor a model is left out');
  assert.equal(items[0].mould, 'm1');
  assert.equal(items[0].hookRef, 'h1');
  assert.equal(items[0].printRef, NONE);
  assert.equal(items[1].modelNumber, 'Velvet 450');
  assert.equal(itemsFromEnquiry({ items: Array.from({ length: 14 }, (_, n) => ({ modelNumber: `M${n}` })) }).length, MAX_ITEMS);
});

test('a line sends the registers, the rate and the mark-up; "not required" sends a zero cost only for costing users', () => {
  const item = { ...blankItem(), mould: 'm1', materialRef: 'mat1', colour: ' White ', hookRef: NONE, printRef: 'p1', unitPrice: '5.40', moq: '' };
  const costed = lineFor(item, { markup: 15, seesCost: true, printName: '1 colour' });
  assert.deepEqual(costed, {
    mould: 'm1', modelNumber: undefined, materialRef: 'mat1', hookRef: undefined, clipRef: undefined, printRef: 'p1',
    printing: '1 colour', colour: 'White', moq: undefined, unitPrice: 5.4, markupPercent: 15, cost: { hookCost: 0 },
  });
  const marketing = lineFor(item, { markup: 15, seesCost: false });
  assert.equal(marketing.cost, undefined, 'marketing never sends a cost');
});

test('the form names what is missing before it is sent', () => {
  assert.match(problemWith({ enquiry: '', items: [blankItem()] }), /enquiry/);
  assert.equal(problemWith({ enquiry: 'e1', items: [blankItem()] }), null, 'all blank takes the enquiry’s models');
  const half = [{ ...blankItem(), mould: 'm1' }, { ...blankItem(), colour: 'Red' }];
  assert.match(problemWith({ enquiry: 'e1', items: half }), /Name the model/);
  assert.ok(isBlank(blankItem()));
  assert.ok(isNamed({ ...blankItem(), modelNumber: 'X' }));
  assert.ok(blankItem().key !== blankItem().key, 'every row its own key');
});

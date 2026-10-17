/**
 * The one-window quote form's arithmetic and payload [src/utils/quoteBuilder.js]. The cost tiles
 * have to add up the way the server's `costingFrom` does, or the suggested price on screen is
 * not the one that gets saved.
 *
 *   node --test tests/quote-builder.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AS_MOULD, MAX_ITEMS, NONE, TRADE, blankItem, costOf, costPayload, costSent, isBlank, isNamed, itemFromLine,
  itemsFromEnquiry, lineFor, nudge, pick, problemWith, returnsOf, samePrice, suggestedPrice, tick, tiersOf,
} from '../src/utils/quoteBuilder.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const typed = (figures) => ({ ...blankItem().figures, ...figures });

const tool = {
  consumptionPerPieceGrams: 20, jobWorkCost: 1.1, packingCost: 0.4, hookCost: 0.6, clipsCost: 0, printingCost: 0.2, moq: 5000,
};
const hips = { ratePerKg: 118, grammageFactorPercent: 18 };
const hook = { ratePerPiece: 1.4 };

test('the grammage is the tool’s weight in the chosen resin, and the base adds every cost', () => {
  const cost = costOf({ ...blankItem(), withHook: true, withPacking: true, hookRef: AS_MOULD, clipRef: AS_MOULD, printRef: NONE }, { tool, resin: hips });
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

test('a ticked hook from the register replaces the mould’s; unticked, it costs nothing', () => {
  const picked = costOf({ ...blankItem(), withHook: true, hookRef: 'h1' }, { tool, resin: hips, hook });
  assert.equal(picked.hookCost, 1.4);
  const unticked = costOf({ ...blankItem(), withHook: false, hookRef: 'h1' }, { tool, resin: hips, hook });
  assert.equal(unticked.hookCost, 0, 'not ticked, not in the price');
});

test('hook, clips, packing and misc count only when ticked', () => {
  const none = costOf(blankItem(), { tool, resin: hips });
  assert.deepEqual([none.hookCost, none.clipCost, none.packingCost, none.miscCost], [0, 0, 0, 0]);
  assert.equal(none.base, 3.88, 'material 2.78 + job 1.10 only');
  const all = costOf({ ...blankItem(), withHook: true, withClip: true, clipRef: 'c1', withPacking: true, withMisc: true, figures: typed({ packingCost: '0.55', otherCost: '0.25' }) }, { tool, resin: hips, clip: { ratePerPiece: 0.9 } });
  assert.deepEqual([all.hookCost, all.clipCost, all.packingCost, all.miscCost], [0.6, 0.9, 0.55, 0.25]);
  const mouldPacking = costOf({ ...blankItem(), withPacking: true }, { tool, resin: hips });
  assert.equal(mouldPacking.packingCost, 0.4, 'ticked with no amount takes the mould’s packing');
});

test('a trade hanger is its inward price — no material cost, no job work', () => {
  const cost = costOf({ ...blankItem(), procurement: TRADE, tradedItem: 't1', materialRef: 'mat1', withPacking: true, figures: typed({ packingCost: '0.3' }) }, { resin: hips, traded: { inwardPrice: 6.5 } });
  assert.equal(cost.trade, true);
  assert.equal(cost.materialCost, 0);
  assert.equal(cost.gramWeight, 0);
  assert.equal(cost.jobCost, 0);
  assert.equal(cost.inwardPrice, 6.5);
  assert.equal(cost.base, 6.8);
  const typedInward = costOf({ ...blankItem(), procurement: TRADE, tradedItem: 't1', figures: typed({ inwardPrice: '4.7' }) }, { traded: { inwardPrice: 6.5 } });
  assert.equal(typedInward.base, 4.7, 'a typed inward price wins over the trading master');
  assert.equal(typedInward.register.inwardPrice, 6.5, 'the master’s figure stays on hand for the tile');
});

test('a typed figure wins over the register; blank takes the register', () => {
  const item = { ...blankItem(), withPacking: true, figures: typed({ gramWeight: '25', rawMaterialRate: '120', jobWorkCost: '1.2' }) };
  const cost = costOf(item, { tool, resin: hips });
  assert.equal(cost.gramWeight, 25);
  assert.equal(cost.materialCost, 3, '25 g × ₹120/kg');
  assert.equal(cost.jobCost, 1.2);
  assert.equal(cost.packingCost, 0.4, 'packing left blank takes the mould’s');
  assert.equal(cost.register.gramWeight, 23.6, 'the register’s grammage, for the tile’s placeholder');
  assert.equal(cost.register.rawMaterialRate, 118);
  assert.equal(cost.base, 4.6);
  assert.equal(costOf({ ...item, figures: typed({ printingCost: '0.5' }) }, { tool, resin: hips }).printingCost, 0, 'no printing picked, a typed figure is not counted');
});

test('picking a register hands its figures back; ticking a part in clears a stale nothing', () => {
  const item = { ...blankItem(), mould: 'm1', figures: typed({ gramWeight: '25', rawMaterialRate: '120', jobWorkCost: '1.2', hookCost: '0.7' }) };
  const resin = pick(item, 'materialRef', 'mat2');
  assert.equal(resin.materialRef, 'mat2');
  assert.deepEqual([resin.figures.gramWeight, resin.figures.rawMaterialRate, resin.figures.jobWorkCost], ['', '', '1.2']);
  const mould = pick(item, 'mould', 'm2');
  assert.deepEqual([mould.figures.gramWeight, mould.figures.jobWorkCost, mould.figures.hookCost, mould.figures.rawMaterialRate], ['', '', '', '120']);

  const zero = { ...blankItem(), withHook: false, figures: typed({ hookCost: '0' }) };
  assert.equal(tick(zero, 'withHook', true).figures.hookCost, '', 'back to the register, not priced at nothing');
  assert.equal(tick({ ...zero, figures: typed({ hookCost: '0.8' }) }, 'withHook', true).figures.hookCost, '0.8', 'a real figure stays');
  assert.equal(tick(zero, 'withHook', false).withHook, false);
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

test('a line sends the registers, the rate and the mark-up; the cost on screen only for costing users', () => {
  const item = { ...blankItem(), mould: 'm1', materialRef: 'mat1', colour: ' White ', withHook: false, hookRef: 'h1', withClip: true, clipRef: 'c1', withPacking: true, withMisc: true, figures: typed({ otherCost: '0.2' }), printRef: 'p1', unitPrice: '5.40', moq: '' };
  const costed = costOf(item, { tool, resin: hips, clip: { ratePerPiece: 0.9 }, print: { ratePerPiece: 0.3 } });
  const line = lineFor(item, { markup: 15, seesCost: true, printName: '1 colour', costed });
  assert.deepEqual(line, {
    mould: 'm1', modelNumber: undefined, materialRef: 'mat1', hookRef: undefined, clipRef: 'c1', printRef: 'p1',
    printing: '1 colour', colour: 'White', moq: undefined, unitPrice: 5.4, markupPercent: 15,
    cost: {
      gramWeight: 23.6, rawMaterialRate: 118, jobWorkCost: 1.1, packingCost: 0.4, hookCost: 0,
      metalClipsCost: 0.9, printingCost: 0.3, otherCost: 0.2,
    },
  });
  const marketing = lineFor(item, { markup: 15, seesCost: false, costed });
  assert.equal(marketing.cost, undefined, 'marketing never sends a cost');
  assert.equal(marketing.hookRef, undefined, 'an unticked hook is not part of the piece');
  assert.equal(lineFor(item, { markup: 15, seesCost: true }).cost, undefined, 'nothing costed, nothing sent');

  const tradeItem = { ...blankItem(), procurement: TRADE, tradedItem: 't1' };
  const trade = lineFor(tradeItem, { markup: 10, seesCost: true, costed: costOf(tradeItem, { traded: { inwardPrice: 6.5 } }) });
  assert.equal(trade.procurement, 'trade');
  assert.equal(trade.tradedItem, 't1');
  assert.equal(trade.mould, undefined);
  assert.equal(trade.cost.inwardPrice, 6.5);
  assert.equal(trade.cost.gramWeight, 0, 'no material on a trade hanger');
  assert.ok(isNamed(tradeItem), 'a trade item names the row');
  assert.equal(costSent(costOf(blankItem())).inwardPrice, undefined, 'made here sends no inward price');
});

const savedLine = {
  _id: 'L1',
  mould: { _id: 'm1', name: 'M-141' },
  materialRef: { _id: 'mat1' },
  hookRef: { _id: 'h1' },
  modelNumber: 'M-141',
  colour: 'Black',
  moq: 5000,
  unitPrice: 9.9,
  markupPercent: 10,
  packing: '',
  cost: { gramWeight: 23.6, rawMaterialRate: 118, jobWorkCost: 1.1, hookCost: 1.4, metalClipsCost: 0, packingCost: 0.4, otherCost: 0, printingCost: 0 },
};

test('a saved line reopens as it was left', () => {
  const item = itemFromLine(savedLine);
  assert.equal(item.lineId, 'L1');
  assert.equal(item.mould, 'm1');
  assert.equal(item.materialRef, 'mat1');
  assert.ok(item.withHook, 'a hook on the line is ticked');
  assert.equal(item.hookRef, 'h1');
  assert.ok(!item.withClip, 'no clip, no cost: unticked');
  assert.ok(item.withPacking);
  assert.ok(!item.withMisc);
  assert.equal(item.printRef, NONE);
  assert.equal(item.figures.gramWeight, '23.6');
  assert.equal(item.figures.inwardPrice, '', 'nothing saved, blank tile');
  assert.equal(item.unitPrice, '9.9');
  assert.equal(item.moq, '5000');
  assert.deepEqual(item.missingAtOpen, ['Clip', 'Packing']);
  assert.equal(item.saved.hookRef, 'h1');
  const trade = itemFromLine({ _id: 'L2', procurement: 'trade', tradedItem: { _id: 't1' }, cost: { inwardPrice: 4.7 } });
  assert.equal(trade.procurement, TRADE);
  assert.equal(trade.tradedItem, 't1');
  assert.equal(trade.figures.inwardPrice, '4.7');
  assert.deepEqual(trade.missingAtOpen, [], 'a bought-in hanger is not asked about its hook or packing');
});

test('the product details a line arrived without are named, and never bar the quote', () => {
  const item = itemFromLine(savedLine);
  assert.deepEqual(item.missingAtOpen, ['Clip', 'Packing'], 'said on the item, for whoever fills them in');
  assert.equal(problemWith({ items: [item], editing: true }), null, 'blanks are no problem — the order form asks for them');
  assert.equal(problemWith({ items: [{ ...item, detailPacking: '100 pcs a bag' }], editing: true }), null);
  /* No tick to pass on the quote: the order form is where the buyer's word is taken. */
  assert.doesNotMatch(read('components/QuoteBuilder.jsx'), /Confirmed with the buyer|needsConfirm/);
});

test('costing a saved line sends every figure and only the choices that changed', () => {
  const item = itemFromLine(savedLine);
  const costed = costOf(item, { tool, resin: hips, hook });
  const same = costPayload(item, { markup: 15, costed, sent: false });
  assert.equal(same.lineId, 'L1');
  assert.equal(same.markupPercent, 15);
  assert.equal(same.unitPrice, 9.9);
  assert.equal(same.procurement, 'manufacture');
  assert.deepEqual(same.cost, costSent(costed));
  for (const key of ['mould', 'materialRef', 'hookRef', 'clipRef', 'printRef', 'tradedItem', 'packing']) {
    assert.ok(!(key in same), `${key} unchanged, not sent — it would refill the line from the registers`);
  }
  assert.ok(!('minimumOverride' in same), 'no floor typed');

  const changed = costPayload({ ...item, materialRef: 'mat2', withHook: false, minimumOverride: '9.5', detailPacking: 'Box of 200' }, { markup: 10, costed, sent: true });
  assert.equal(changed.materialRef, 'mat2');
  assert.equal(changed.hookRef, null, 'the hook ticked out goes as null, so the server detaches it');
  assert.equal(changed.minimumOverride, 9.5);
  assert.equal(changed.packing, 'Box of 200');
  assert.ok(!('unitPrice' in changed), 'the rate of a sent quotation changes through a revision');

  const toTrade = costPayload({ ...item, procurement: TRADE, tradedItem: 't1' }, { markup: 10, costed });
  assert.equal(toTrade.procurement, 'trade');
  assert.equal(toTrade.tradedItem, 't1');
  assert.equal(toTrade.mould, null, 'a trade line leaves the mould');
});

test('the 10/15/20 tiers and the return on a rate', () => {
  assert.deepEqual(tiersOf(4.88), [[10, 5.4], [15, 5.65], [20, 5.9]]);
  assert.deepEqual(returnsOf(5.4, 4.88), { markup: 10.7, margin: 9.6, perPiece: 0.52 });
  assert.equal(returnsOf('', 4.88), null);
  assert.equal(returnsOf(5.4, 0), null);
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

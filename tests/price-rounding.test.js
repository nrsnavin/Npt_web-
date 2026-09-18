/**
 * The costing sheet's prices land on five paise, and land where the server puts them [§9].
 *
 * The sheet recalculates as somebody types, so the rule is duplicated across the wire — a round
 * trip per keystroke would be worse. What is not allowed is the two copies *disagreeing*, and
 * they did: the sheet had one expression of its own that rounded to the nearest paisa while the
 * server rounds up to the nearest five.
 *
 * A ₹11.05 cost — a real one, off the plant's own sheet — showed on screen as:
 *
 *     10% · floor   15%      20%
 *     ₹12.16        ₹12.71   ₹13.26      ← the sheet
 *     ₹12.20        ₹12.75   ₹13.30      ← what the server stores
 *
 * Three consequences, in rising order of cost. Every tier read a few paise light. The floor hint
 * said "the standing floor, ₹12.16" when the standing floor was ₹12.20. And pressing a tier
 * fills the approved price with the number shown — which the server deliberately does *not*
 * re-round, because a price somebody typed is one they agreed with a buyer. So the sheet talked
 * people into approving five paise under the tier they had just pressed, and under the §9 floor,
 * with neither side ever disagreeing out loud.
 *
 * Two things are tested, and the second is the one that matters:
 *
 * - the arithmetic, against figures worked by hand;
 * - that the component has no arithmetic of its own left. A correct shared module is no use
 *   while the sheet still carries the expression that went wrong.
 *
 * Read as text for the second part because `node --test` here has no JSX loader.
 *
 *   node --test tests/price-rounding.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MINIMUM_TIER, PRICE_STEP, STANDARD_TIERS, priceAt, tiersFor } from '../src/utils/pricing.js';

const FORM = readFileSync(new URL('../src/components/CostingSheetForm.jsx', import.meta.url), 'utf8');

test('the sheet from the screenshot now reads what the server stores', () => {
  /* The case reported, figure for figure. */
  assert.deepEqual(tiersFor(11.05), { 10: 12.2, 15: 12.75, 20: 13.3 });

  /* And what it used to say, named so a regression is recognisable rather than just wrong. */
  for (const wrong of [12.16, 12.71, 13.26]) {
    assert.ok(
      !Object.values(tiersFor(11.05)).includes(wrong),
      `₹${wrong} is the nearest-paisa answer — the sheet is rounding to the wrong step again`
    );
  }
});

test('every price lands on a five-paise step', () => {
  assert.equal(PRICE_STEP, 0.05);

  for (const cost of [3.59, 6, 7.05, 7.65, 11.05, 12.4, 99.99, 0.07]) {
    for (const percent of [...STANDARD_TIERS, 0, 12, 33.5]) {
      const price = priceAt(cost, percent);
      /* In whole paise, because 12.2 % 0.05 is not 0 in binary floating point — which is the
         same trap the implementation itself has to step around. */
      assert.equal(
        Math.round(price * 100) % 5,
        0,
        `₹${cost} at ${percent}% gave ₹${price}, which is not on a five-paise step`
      );
    }
  }
});

test('it rounds up, never to nearest — the floor depends on it', () => {
  /*
   * §9's floor is the 10% tier run through this same function. Rounding down would produce a
   * "minimum" a few paise under the true cost-plus-ten, quietly shaving the limit the
   * below-minimum approval exists to defend. So the price is never under cost-plus-markup.
   */
  for (const cost of [3.59, 7.01, 11.05, 12.44]) {
    for (const percent of STANDARD_TIERS) {
      const exact = cost * (1 + percent / 100);
      const price = priceAt(cost, percent);
      assert.ok(price >= exact - 1e-9, `₹${cost} at ${percent}%: ₹${price} is under ₹${exact}`);
      assert.ok(price < exact + PRICE_STEP, `₹${cost} at ${percent}%: ₹${price} overshot a step`);
    }
  }
});

test('a price already on the step is left exactly where it is', () => {
  /*
   * The binary-floating-point trap, which is why the implementation works in whole paise:
   * `Math.ceil(7.65 / 0.05) * 0.05` is ₹7.70, because 7.65 / 0.05 is 152.99999999999997. A
   * version that looks right and is wrong only for prices that were already correct is the
   * worst shape this bug can take.
   */
  assert.equal(priceAt(7.65, 0), 7.65);
  assert.equal(priceAt(12.2, 0), 12.2);
  assert.equal(priceAt(6, 0), 6);
  assert.equal(priceAt(3.95, 0), 3.95);
});

test('no cost has a price', () => {
  /* A sheet with nothing filled in shows blanks, not ₹0.00 — which reads as a decision. */
  for (const empty of [0, null, undefined, '', NaN]) {
    assert.equal(priceAt(empty, 10), undefined);
  }
});

/* --------------------- And the sheet has none of its own left --------------------- */

test('the costing sheet does its rounding through the shared module', () => {
  assert.match(
    FORM,
    /import \{ MINIMUM_TIER, STANDARD_TIERS, priceAt as priceFor \} from '\.\.\/utils\/pricing\.js'/,
    'the form imports the one rule'
  );
  assert.match(FORM, /const priceAt = \(percent\) => priceFor\(total, percent\)/);

  /* The expression that was wrong, asserted absent. This is the regression. */
  assert.doesNotMatch(
    FORM,
    /Math\.round\(total \* \(1 \+/,
    'the form is rounding prices itself again — that is how the two sides came apart'
  );
  assert.doesNotMatch(FORM, /const tiers = \[10, 15, 20\]/, 'the tiers come from policy, not a literal');
});

test('the sheet and the server agree on what the tiers are', () => {
  /* Cheap to keep true and expensive to get wrong: a sheet drawing a 25% column the server does
     not compute would show a blank price in it, which reads as a costing that failed. */
  assert.deepEqual(STANDARD_TIERS, [10, 15, 20]);
  assert.equal(MINIMUM_TIER, 10);
  assert.equal(Math.min(...STANDARD_TIERS), MINIMUM_TIER, 'the floor is the lowest tier');
});

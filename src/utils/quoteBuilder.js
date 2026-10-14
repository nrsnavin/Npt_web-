import { cutGrams } from './grams.js';
import { PRICE_STEP, priceAt } from './pricing.js';

/**
 * The arithmetic and the payload behind the one-window quote form [components/QuoteBuilder.jsx].
 *
 * Kept here, out of the component, because it is the part that has to agree with the server:
 * the cost tiles are `costingFrom` in quotation.controller.js worked in the browser, so the
 * suggested price on screen is the price the server will calculate when the quote is saved.
 */

/** As many models as one quotation carries in the plant's own book. */
export const MAX_ITEMS = 10;

/** The mark-ups the plant quotes at; 10% is §9's floor. */
export const MARKUPS = [10, 12, 15, 18, 20, 25, 30];

/** Suggestions for the free-text terms — what the plant writes most, still editable. */
export const PAYMENT_TERMS = [
  '100% Advance',
  '50% Advance, balance before dispatch',
  'Against delivery',
  '7 days from invoice',
  '15 days from invoice',
  '30 days from invoice',
  '45 days from invoice',
  '60 days from invoice',
];
export const DELIVERY_TERMS = ['Ex-factory', 'Door delivery', '2 weeks from PO', '3 weeks from PO', '4 weeks from PO'];

/**
 * A part picker's three kinds of answer: `''` takes what the mould is set up with, `'none'` is
 * "not required" (a cost of nothing), and an id is that register entry at its rate.
 */
export const AS_MOULD = '';
export const NONE = 'none';

let keys = 0;
/** A blank item. `key` keeps React's rows stable when one in the middle is removed. */
export const blankItem = () => ({
  key: `item-${(keys += 1)}`,
  mould: '',
  modelNumber: '',
  materialRef: '',
  colour: '',
  hookRef: AS_MOULD,
  clipRef: AS_MOULD,
  printRef: NONE,
  moq: '',
  unitPrice: '',
});

/** True when nothing has been chosen on the item yet. */
export const isBlank = (item) =>
  !item.mould && !item.modelNumber.trim() && !item.materialRef && !item.colour && item.unitPrice === '';

/** Rows named by a mould or a model number; the rest are left out. */
export const isNamed = (item) => Boolean(item.mould || item.modelNumber.trim());

const id = (value) => (value && typeof value === 'object' ? value._id : value) || '';

/** The enquiry's models as items, the way the server would raise them [`linesForEnquiry`]. */
export function itemsFromEnquiry(enquiry) {
  const rows = (enquiry?.items || []).filter((item) => item.mould || item.modelNumber);
  const source = rows.length ? rows : enquiry?.mould ? [{ mould: enquiry.mould }] : [];
  return source.slice(0, MAX_ITEMS).map((item) => ({
    ...blankItem(),
    mould: id(item.mould),
    modelNumber: item.mould ? '' : item.modelNumber || '',
    materialRef: id(item.materialRef),
    colour: item.colour || '',
    hookRef: id(item.hookRef) || AS_MOULD,
    clipRef: id(item.clipRef) || AS_MOULD,
    printRef: id(item.printRef) || NONE,
  }));
}

const part = (choice, register, fromMould) => {
  if (choice === NONE) return 0;
  if (choice && register) return Number(register.ratePerPiece) || 0;
  return Number(fromMould) || 0;
};

const paise = (value) => Math.round(value * 100) / 100;

/**
 * The cost build-up for one item, from what its pickers resolved to:
 * `{ tool, resin, hook, clip, print }` are the register records, any of them missing.
 *
 * The grammage is the tool's consumption in the chosen resin — a denser resin throws a heavier
 * part from the same cavity — exactly as the server's `grammageFrom` works it.
 */
export function costOf(item, { tool, resin, hook, clip, print } = {}) {
  const gramWeight = tool ? cutGrams((Number(tool.consumptionPerPieceGrams) || 0) * (1 + (Number(resin?.grammageFactorPercent) || 0) / 100)) : 0;
  const ratePerKg = Number(resin?.ratePerKg) || 0;
  const materialCost = (gramWeight * ratePerKg) / 1000;
  const jobCost = Number(tool?.jobWorkCost) || 0;
  const packingCost = Number(tool?.packingCost) || 0;
  const hookCost = part(item.hookRef, hook, tool?.hookCost);
  const clipCost = part(item.clipRef, clip, tool?.clipsCost);
  const printingCost = part(item.printRef, print, tool?.printingCost);
  const base = materialCost + jobCost + packingCost + hookCost + clipCost + printingCost;
  return {
    gramWeight,
    ratePerKg,
    materialCost: paise(materialCost),
    jobCost,
    packingCost,
    hookCost,
    clipCost,
    printingCost,
    base: paise(base),
    /* Unrounded, as the server's `totalCost` is — the suggested price is worked from this. */
    exactBase: base,
  };
}

/** Cost plus the mark-up, rounded up to five paise — the server's `priceFrom`. */
export const suggestedPrice = (base, markup) => priceAt(base, markup);

/** The final rate moved by `paiseStep` (±5, ±10), never below zero, on the five-paise grid. */
export function nudge(price, paiseStep) {
  const now = Math.round((Number(price) || 0) * 100);
  const next = Math.max(0, now + paiseStep);
  return (next / 100).toFixed(2);
}

/** Within half a step of each other — "this is the suggested price". */
export const samePrice = (a, b) => a !== '' && a != null && b != null && Math.abs(Number(a) - Number(b)) < PRICE_STEP / 2;

/**
 * The line as the server takes it.
 *
 * A part left "as the mould" sends nothing and the server fills it from the tool; "not required"
 * sends a cost of nothing for that part, which the server keeps only from the Quotation
 * department and Admin. A chosen print job also names what is printed, for the document.
 */
export function lineFor(item, { markup, seesCost, printName } = {}) {
  const cost = {};
  if (seesCost) {
    if (item.hookRef === NONE) cost.hookCost = 0;
    if (item.clipRef === NONE) cost.metalClipsCost = 0;
    if (item.printRef === NONE) cost.printingCost = 0;
  }
  const ref = (value) => (value && value !== NONE ? value : undefined);
  return {
    ...(item.mould ? { mould: item.mould } : {}),
    modelNumber: item.modelNumber.trim() || undefined,
    materialRef: item.materialRef || undefined,
    hookRef: ref(item.hookRef),
    clipRef: ref(item.clipRef),
    printRef: ref(item.printRef),
    printing: ref(item.printRef) ? printName || undefined : undefined,
    colour: item.colour.trim() || undefined,
    moq: item.moq === '' ? undefined : Number(item.moq),
    unitPrice: item.unitPrice === '' ? undefined : Number(item.unitPrice),
    markupPercent: Number(markup) || undefined,
    ...(Object.keys(cost).length ? { cost } : {}),
  };
}

/** What is wrong with the form, in the words to show, or null. */
export function problemWith({ enquiry, items }) {
  if (!enquiry) return 'Pick the enquiry this quote is for. No enquiry yet? Raise it first.';
  if (items.length > MAX_ITEMS) return `A quotation carries at most ${MAX_ITEMS} models.`;
  const named = items.filter(isNamed);
  if (named.length && named.length !== items.filter((item) => !isBlank(item)).length) {
    return 'Name the model on every item, or remove the empty ones.';
  }
  const bad = items.find((item) => item.unitPrice !== '' && !(Number(item.unitPrice) >= 0));
  if (bad) return 'A rate must be a number.';
  return null;
}

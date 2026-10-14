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

/** Made here off a mould, or bought in and resold (a trade hanger, off the trading master). */
export const MANUFACTURE = 'manufacture';
export const TRADE = 'trade';

let keys = 0;
/**
 * A blank item. `key` keeps React's rows stable when one in the middle is removed.
 *
 * Hook, clips, packing and misc are counted only when ticked [`withHook` …]: a tick says "this
 * piece has it, and it is in the price". Unticked, the cost is left out whatever the mould says.
 * `packing` and `misc` are the typed amounts; a blank packing takes the mould's figure.
 */
export const blankItem = () => ({
  key: `item-${(keys += 1)}`,
  procurement: MANUFACTURE,
  mould: '',
  tradedItem: '',
  modelNumber: '',
  materialRef: '',
  colour: '',
  withHook: false,
  hookRef: AS_MOULD,
  withClip: false,
  clipRef: AS_MOULD,
  withPacking: false,
  packing: '',
  withMisc: false,
  misc: '',
  printRef: NONE,
  moq: '',
  unitPrice: '',
});

/** True when nothing has been chosen on the item yet. */
export const isBlank = (item) =>
  !item.mould && !item.tradedItem && !item.modelNumber.trim() && !item.materialRef && !item.colour && item.unitPrice === '';

/** Rows named by a mould, a trading master item or a model number; the rest are left out. */
export const isNamed = (item) => Boolean(item.mould || item.tradedItem || item.modelNumber.trim());

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
    /* A hook or clip the buyer named is part of the piece, so it starts ticked. */
    withHook: Boolean(id(item.hookRef)),
    hookRef: id(item.hookRef) || AS_MOULD,
    withClip: Boolean(id(item.clipRef)),
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

const amount = (value) => (value === '' || value == null ? null : Number(value) || 0);

/**
 * The cost build-up for one item, from what its pickers resolved to:
 * `{ tool, resin, hook, clip, print, traded }` are the register records, any of them missing.
 *
 * Made here: the grammage is the tool's consumption in the chosen resin — a denser resin throws
 * a heavier part from the same cavity — exactly as the server's `grammageFrom` works it.
 * A trade hanger is the supplier's inward price instead, and no material cost is added: the resin
 * is in what the supplier charges [server: models/Quotation.js `materialCost`].
 * Hook, clips, packing and misc count only when ticked.
 */
export function costOf(item, { tool, resin, hook, clip, print, traded } = {}) {
  const trade = item.procurement === TRADE;
  const gramWeight = !trade && tool ? cutGrams((Number(tool.consumptionPerPieceGrams) || 0) * (1 + (Number(resin?.grammageFactorPercent) || 0) / 100)) : 0;
  const ratePerKg = trade ? 0 : Number(resin?.ratePerKg) || 0;
  const materialCost = trade ? 0 : (gramWeight * ratePerKg) / 1000;
  const inwardPrice = trade ? Number(traded?.inwardPrice) || 0 : 0;
  const jobCost = trade ? 0 : Number(tool?.jobWorkCost) || 0;
  const packingCost = item.withPacking ? amount(item.packing) ?? (Number(tool?.packingCost) || 0) : 0;
  const hookCost = item.withHook ? part(item.hookRef, hook, tool?.hookCost) : 0;
  const clipCost = item.withClip ? part(item.clipRef, clip, tool?.clipsCost) : 0;
  const miscCost = item.withMisc ? amount(item.misc) ?? 0 : 0;
  const printingCost = part(item.printRef, print, tool?.printingCost);
  const base = materialCost + inwardPrice + jobCost + packingCost + hookCost + clipCost + miscCost + printingCost;
  return {
    trade,
    gramWeight,
    ratePerKg,
    materialCost: paise(materialCost),
    inwardPrice,
    jobCost,
    packingCost,
    hookCost,
    clipCost,
    miscCost,
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
 * A ticked part left "as the mould" sends nothing and the server fills it from the tool; an
 * unticked one sends a cost of nothing, which the server keeps only from the Quotation department
 * and Admin. A trade hanger names its trading master item, whose inward price is its cost. A
 * chosen print job also names what is printed, for the document.
 */
export function lineFor(item, { markup, seesCost, printName } = {}) {
  const trade = item.procurement === TRADE;
  const cost = {};
  if (seesCost) {
    if (!item.withHook) cost.hookCost = 0;
    if (!item.withClip) cost.metalClipsCost = 0;
    if (!item.withPacking) cost.packingCost = 0;
    else if (amount(item.packing) != null) cost.packingCost = amount(item.packing);
    cost.otherCost = item.withMisc ? amount(item.misc) ?? 0 : 0;
    if (item.printRef === NONE) cost.printingCost = 0;
  }
  const ref = (value) => (value && value !== NONE ? value : undefined);
  return {
    ...(!trade && item.mould ? { mould: item.mould } : {}),
    /* Made here sends nothing: a typed model that is on the trading master is still recognised. */
    ...(trade ? { procurement: TRADE, ...(item.tradedItem ? { tradedItem: item.tradedItem } : {}) } : {}),
    modelNumber: item.modelNumber.trim() || undefined,
    materialRef: item.materialRef || undefined,
    hookRef: item.withHook ? ref(item.hookRef) : undefined,
    clipRef: item.withClip ? ref(item.clipRef) : undefined,
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

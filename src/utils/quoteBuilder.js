import { cutGrams } from './grams.js';
import { PRICE_STEP, STANDARD_TIERS, changedParts, priceAt } from './pricing.js';
import { missingDetails } from './productDetails.js';

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
/**
 * The figures a person may type over the registers, one per cost tile. Blank takes the register's
 * own figure; a value typed wins, and is what is saved.
 */
export const FIGURES = ['gramWeight', 'rawMaterialRate', 'jobWorkCost', 'packingCost', 'hookCost', 'metalClipsCost', 'printingCost', 'otherCost', 'inwardPrice'];
const blankFigures = () => Object.fromEntries(FIGURES.map((key) => [key, '']));

export const blankItem = () => ({
  key: `item-${(keys += 1)}`,
  /* An existing line's id, when the form is costing or editing a saved quotation. */
  lineId: null,
  procurement: MANUFACTURE,
  mould: '',
  tradedItem: '',
  modelNumber: '',
  materialRef: '',
  colour: '',
  /* Every hanger has a hook unless somebody says otherwise: ticked from the start, at the
     register's price — nothing, where the register gives none — and changeable on the tile. */
  withHook: true,
  hookRef: AS_MOULD,
  withClip: false,
  clipRef: AS_MOULD,
  withPacking: false,
  withMisc: false,
  printRef: NONE,
  figures: blankFigures(),
  minimumOverride: '',
  moq: '',
  unitPrice: '',
  /* The product details a saved line arrived without, and the answers [productDetails.js]. */
  missingAtOpen: [],
  detailPacking: '',
  saved: {},
});

/**
 * Picking a register entry hands that entry's figures back to the register: a new mould refills
 * the grammage and its own cost lines, a new resin the grammage and the rate, a part its line.
 * What was typed for the old choice no longer applies to the new one.
 */
const OWNS = {
  mould: ['gramWeight', 'jobWorkCost', 'packingCost', 'hookCost', 'metalClipsCost', 'printingCost'],
  materialRef: ['gramWeight', 'rawMaterialRate'],
  hookRef: ['hookCost'],
  clipRef: ['metalClipsCost'],
  printRef: ['printingCost'],
  tradedItem: ['inwardPrice'],
};
/**
 * Ticking a part in or out. Ticked back in, a figure of nothing saved while it was out gives way
 * to the register's, rather than pricing the part at nothing.
 */
const TICKS = { withHook: 'hookCost', withClip: 'metalClipsCost', withPacking: 'packingCost', withMisc: 'otherCost' };
export function tick(item, flag, on) {
  const field = TICKS[flag];
  const stale = on && field && Number(item.figures?.[field]) === 0;
  return { ...item, [flag]: on, ...(stale ? { figures: { ...item.figures, [field]: '' } } : {}) };
}

export function pick(item, key, value) {
  const cleared = Object.fromEntries((OWNS[key] || []).map((field) => [field, '']));
  return { ...item, [key]: value, figures: { ...item.figures, ...cleared } };
}

/**
 * A model picked off the one list of both masters [components/pickers.jsx `MasterModelSelect`]:
 * `m<id>` is a mould, made here; `t<id>` a trading item, bought in. The type follows the pick,
 * and the other master's choice is cleared with the figures it owned.
 */
export function modelPicked(item, ref) {
  const kind = String(ref || '').charAt(0);
  const id = String(ref || '').slice(1);
  if (kind === 't' && id) return pick(pick({ ...item, procurement: TRADE }, 'mould', ''), 'tradedItem', id);
  if (kind === 'm' && id) return pick(pick({ ...item, procurement: MANUFACTURE }, 'tradedItem', ''), 'mould', id);
  return pick(pick(item, 'mould', ''), 'tradedItem', '');
}

/**
 * The master's row for a model named by its code — an enquiry's model, or one typed in the
 * buyer's model box — so the type follows the master wherever the name came from: a code on
 * the trading master is a trade line, one on the mould register is made here. Exact code only,
 * whatever the case or spacing; a near match is for the person to pick from the list.
 */
export function masterMatch(rows, code) {
  const key = String(code || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  return (rows || []).find((row) => String(row.code || '').trim().toLowerCase().replace(/\s+/g, ' ') === key) || null;
}

/** The item on the master's row, keeping the name as it was typed; unchanged when there is no row. */
export function withMaster(item, row) {
  if (!row?.ref) return item;
  return { ...modelPicked(item, row.ref), modelNumber: item.modelNumber };
}

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
    /* The hook is on every hanger; a clip the buyer named is part of the piece, so it starts ticked. */
    withHook: true,
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
/** A typed figure, or the register's when the tile is blank. */
const fig = (item, key, fallback) => amount(item.figures?.[key]) ?? (Number(fallback) || 0);

/**
 * The cost build-up for one item, from what its pickers resolved to:
 * `{ tool, resin, hook, clip, print, traded }` are the register records, any of them missing.
 *
 * Made here: the grammage is the tool's consumption in the chosen resin — a denser resin throws
 * a heavier part from the same cavity — exactly as the server's `grammageFrom` works it.
 * A trade hanger with a supplier's inward price is that price, and no material or job work is
 * added: the resin is in what the supplier charges [server: models/Quotation.js `materialCost`].
 * One the supplier has not priced is costed from the plant's own build-up on the trading master
 * — grams, job work, hook, clips, packing — as a made piece is, with the inward price tile left
 * to be typed when the supplier gives one. Hook, clips, packing and misc count only when ticked.
 */
export function costOf(item, { tool, resin, hook, clip, print, traded } = {}) {
  const trade = item.procurement === TRADE;
  const inwardRegister = Number(traded?.inwardPrice) || 0;
  const inwardPrice = trade ? fig(item, 'inwardPrice', inwardRegister) : 0;
  /* The supplier's price stands for the piece: the build-up is off while there is one. */
  const supplied = trade && inwardPrice > 0;
  const up = (trade && traded?.buildUp) || {};
  const own = trade
    ? { jobWorkCost: up.jobWorkCost, packingCost: up.packingCost, hookCost: up.hookCost, clipsCost: up.clipsCost, printingCost: 0 }
    : tool || {};
  const registerGrams = trade
    ? cutGrams((Number(up.partWeightGrams) || 0) + (Number(up.runnerWeightGrams) || 0))
    : tool ? cutGrams((Number(tool.consumptionPerPieceGrams) || 0) * (1 + (Number(resin?.grammageFactorPercent) || 0) / 100)) : 0;
  const gramWeight = supplied ? 0 : cutGrams(fig(item, 'gramWeight', registerGrams));
  const ratePerKg = supplied ? 0 : fig(item, 'rawMaterialRate', resin?.ratePerKg);
  const materialCost = supplied ? 0 : (gramWeight * ratePerKg) / 1000;
  const jobCost = fig(item, 'jobWorkCost', supplied ? 0 : own.jobWorkCost);
  const packingCost = item.withPacking ? fig(item, 'packingCost', supplied ? 0 : own.packingCost) : 0;
  const hookCost = item.withHook ? fig(item, 'hookCost', part(item.hookRef, hook, supplied ? 0 : own.hookCost)) : 0;
  const clipCost = item.withClip ? fig(item, 'metalClipsCost', part(item.clipRef, clip, supplied ? 0 : own.clipsCost)) : 0;
  const miscCost = item.withMisc ? fig(item, 'otherCost', 0) : 0;
  const printingCost = item.printRef === NONE ? 0 : fig(item, 'printingCost', part(item.printRef, print, own.printingCost));
  const base = materialCost + inwardPrice + jobCost + packingCost + hookCost + clipCost + miscCost + printingCost;
  return {
    trade,
    supplied,
    /* What the registers alone give, shown in a blank tile so the typed figure can be judged. */
    register: {
      gramWeight: supplied ? 0 : registerGrams,
      rawMaterialRate: supplied ? 0 : Number(resin?.ratePerKg) || 0,
      jobWorkCost: supplied ? 0 : Number(own.jobWorkCost) || 0,
      packingCost: supplied ? 0 : Number(own.packingCost) || 0,
      hookCost: part(item.hookRef, hook, supplied ? 0 : own.hookCost),
      metalClipsCost: part(item.clipRef, clip, supplied ? 0 : own.clipsCost),
      printingCost: item.printRef === NONE ? 0 : part(item.printRef, print, own.printingCost),
      otherCost: 0,
      inwardPrice: inwardRegister,
    },
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
export function lineFor(item, { markup, seesCost, printName, costed } = {}) {
  const trade = item.procurement === TRADE;
  const cost = seesCost && costed ? costSent(costed) : {};
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

/**
 * The cost as the server stores it, from the figures on screen — every line, so what is saved
 * is exactly what was shown, unticked parts at nothing.
 */
export function costSent(costed) {
  return {
    gramWeight: costed.gramWeight,
    rawMaterialRate: costed.ratePerKg,
    jobWorkCost: costed.jobCost,
    packingCost: costed.packingCost,
    hookCost: costed.hookCost,
    metalClipsCost: costed.clipCost,
    printingCost: costed.printingCost,
    otherCost: costed.miscCost,
    ...(costed.trade ? { inwardPrice: costed.inwardPrice } : {}),
  };
}

const idOf = (value) => value?._id ?? value ?? '';
const text = (value) => (value === undefined || value === null ? '' : String(value));

/**
 * A saved quotation line as an item, for costing or editing the whole quotation in one window.
 * The figures saved on the line fill its tiles, so the sheet reopens as it was left; a part with
 * a cost on it is ticked.
 */
export function itemFromLine(line) {
  const cost = line.cost || {};
  const has = (key) => Number(cost[key]) > 0;
  const saved = {
    mould: idOf(line.mould), materialRef: idOf(line.materialRef), hookRef: idOf(line.hookRef),
    clipRef: idOf(line.clipRef), printRef: idOf(line.printRef), tradedItem: idOf(line.tradedItem),
    category: line.category || '', packing: line.packing || '',
  };
  return {
    ...blankItem(),
    lineId: line._id,
    procurement: line.procurement === TRADE ? TRADE : MANUFACTURE,
    mould: saved.mould,
    tradedItem: saved.tradedItem,
    modelNumber: line.modelNumber || '',
    materialRef: saved.materialRef,
    colour: line.colour || '',
    withHook: Boolean(saved.hookRef) || has('hookCost'),
    hookRef: saved.hookRef || AS_MOULD,
    withClip: Boolean(saved.clipRef) || has('metalClipsCost'),
    clipRef: saved.clipRef || AS_MOULD,
    withPacking: has('packingCost'),
    withMisc: has('otherCost'),
    printRef: saved.printRef || (has('printingCost') ? AS_MOULD : NONE),
    figures: Object.fromEntries(FIGURES.map((key) => [key, text(cost[key])])),
    minimumOverride: text(line.minimumOverride),
    moq: text(line.moq || ''),
    unitPrice: text(line.unitPrice),
    missingAtOpen: line.procurement === TRADE ? [] : missingDetails(line),
    detailPacking: line.packing || '',
    saved,
  };
}

/**
 * What the costing of one saved line sends [server: PATCH /quotations/:id/lines/:lineId/cost]:
 * every figure, the mark-up, the floor, the price (until it has gone to the buyer), and only the
 * register choices that changed — an unchanged one would refill the line from the registers.
 */
export function costPayload(item, { markup, costed, sent, printName }) {
  const trade = item.procurement === TRADE;
  const ref = (value) => (value && value !== NONE ? value : '');
  const picked = {
    mould: trade ? '' : item.mould,
    materialRef: item.materialRef,
    hookRef: item.withHook ? ref(item.hookRef) : '',
    clipRef: item.withClip ? ref(item.clipRef) : '',
    printRef: ref(item.printRef),
  };
  return {
    lineId: item.lineId,
    cost: costSent(costed),
    markupPercent: Number(markup) || undefined,
    ...(amount(item.minimumOverride) != null ? { minimumOverride: amount(item.minimumOverride) } : {}),
    ...(sent ? {} : { unitPrice: amount(item.unitPrice) ?? undefined }),
    procurement: trade ? TRADE : MANUFACTURE,
    printing: ref(item.printRef) ? printName || undefined : undefined,
    ...changedParts(picked, item.saved),
    ...(trade && (item.tradedItem || '') !== (item.saved.tradedItem || '') ? { tradedItem: item.tradedItem || null } : {}),
    ...(!trade && item.saved.tradedItem ? { tradedItem: null } : {}),
    ...(item.detailPacking !== (item.saved.packing || '') ? { packing: item.detailPacking } : {}),
  };
}

/** The standing prices for a cost, side by side: `[[10, 7.65], [15, 8], [20, 8.35]]`. */
export const tiersOf = (base) => STANDARD_TIERS.map((percent) => [percent, priceAt(base, percent)]);

/** Markup on cost and margin on price, for a rate against a cost; null where there is none. */
export function returnsOf(price, base) {
  const rate = Number(price);
  if (!(rate > 0) || !(base > 0)) return null;
  return {
    markup: Math.round(((rate - base) / base) * 1000) / 10,
    margin: Math.round(((rate - base) / rate) * 1000) / 10,
    perPiece: Math.round((rate - base) * 100) / 100,
  };
}

/** What is wrong with the form, in the words to show, or null. */
export function problemWith({ enquiry, customer, items, editing = false }) {
  /* An enquiry, or the buyer alone: without an enquiry the models are named here. */
  if (!editing && !enquiry && !customer) return 'Pick the customer this quote is for, or the enquiry it answers.';
  if (items.length > MAX_ITEMS) return `A quotation carries at most ${MAX_ITEMS} models.`;
  const named = items.filter(isNamed);
  if (!editing && !enquiry && !named.length) return 'Name at least one model — there is no enquiry to take them from.';
  if (named.length && named.length !== items.filter((item) => !isBlank(item)).length) {
    return 'Name the model on every item, or remove the empty ones.';
  }
  const bad = items.find((item) => item.unitPrice !== '' && !(Number(item.unitPrice) >= 0));
  if (bad) return 'A rate must be a number.';
  /* A product detail the enquiry did not give is no bar to the quote: the order form asks for it. */
  return null;
}

/**
 * What a bought-in piece would cost the plant to make, from the trading master's own build-up:
 * the grams in the named resin (over PP, as the register's grammage factor says) at that resin's
 * rate — or a rate typed on the item — plus job work, hook, clips and packing. No margin.
 *
 * Nothing is costed without a rate and grams: a build-up with the parts alone gives the parts,
 * and `known` says whether the material side is in. The percent is the supplier's keep over the
 * making cost — markup on cost, as the plant's own tiers are, so "the supplier is on 28%" reads
 * against "we quote at 20%".
 */
export function makeCostOf(traded) {
  const up = traded?.buildUp || {};
  const resin = up.material && typeof up.material === 'object' ? up.material : null;
  const ratePerKg = Number(up.ratePerKg) || Number(resin?.ratePerKg) || 0;
  const ppGrams = (Number(up.partWeightGrams) || 0) + (Number(up.runnerWeightGrams) || 0);
  const grams = cutGrams(ppGrams * (1 + (Number(resin?.grammageFactorPercent) || 0) / 100));
  const material = (grams * ratePerKg) / 1000;
  const jobWork = Number(up.jobWorkCost) || 0;
  const hook = Number(up.hookCost) || 0;
  const clips = Number(up.clipsCost) || 0;
  const packing = Number(up.packingCost) || 0;
  const total = material + jobWork + hook + clips + packing;
  return {
    resin: resin ? resin.name : null,
    grams,
    ratePerKg,
    material: paise(material),
    jobWork,
    hook,
    clips,
    packing,
    total: paise(total),
    exactTotal: total,
    known: grams > 0 && ratePerKg > 0,
    hasParts: jobWork + hook + clips + packing > 0,
  };
}

/** The making cost set against the supplier's price: the margin they keep, and ours at the tiers. */
export function supplierCheck(traded, inwardPrice, tiers = [10, 20]) {
  const make = makeCostOf(traded);
  const inward = Number(inwardPrice) || 0;
  if (!(make.total > 0)) return null;
  const margin = paise(inward - make.exactTotal);
  const percent = inward > 0 ? Math.round(((inward - make.exactTotal) / make.exactTotal) * 1000) / 10 : null;
  return {
    ...make,
    inward,
    margin,
    percent,
    at: tiers.map((tier) => [tier, priceAt(make.exactTotal, tier)]),
  };
}

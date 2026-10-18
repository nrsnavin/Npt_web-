import { useCallback, useEffect, useRef, useState } from 'react';
import {
  components as componentsApi, materials as materialsApi, moulds as mouldsApi, quotations as quotationsApi,
  tradedItems as tradedItemsApi,
} from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import Combobox from './Combobox.jsx';
import PreviousQuotes from './PreviousQuotes.jsx';
import TradingBadge from './TradingBadge.jsx';
import SupplierCheck from './SupplierCheck.jsx';
import { missingDetails, sayList } from '../utils/productDetails.js';
import { MINIMUM_TIER, STANDARD_TIERS, priceAt as priceFor } from '../utils/pricing.js';
import { changedParts } from '../utils/pricing.js';
import { GRAM_STEP, cutGrams } from '../utils/grams.js';

/**
 * The costing sheet, shared by the list and the costing's own page.
 *
 * One copy because it is one form: a second would drift, and the half that drifted would be the
 * one enforcing that the calculated price is never typed.
 */
const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

/**
 * A part, as it reads in a picker.
 *
 * The rate is in the label because the choice is usually between two hooks that differ only in
 * price, and a list of names alone makes somebody open another screen to tell them apart. `/pc`
 * is spelled out for the same reason it is on the register: the material picker beside this one
 * quotes per kilo.
 */
/** A bought-in piece comes as it is; only what is made here has a hook, a clip and packing to confirm. */
const procurementNeedsDetails = (procurement) => procurement !== 'trade';

/** The cost lines counted only when ticked, as the sheet names them. */
const OPTIONAL_COSTS = [
  ['hookCost', 'Hook'],
  ['metalClipsCost', 'Metal clips'],
  ['packingCost', 'Packing'],
  ['otherCost', 'Misc'],
];
const OPTIONAL_KEYS = OPTIONAL_COSTS.map(([key]) => key);

const partOption = (row) => ({
  value: row._id,
  label: `${row.name}${row.colour ? ` · ${row.colour}` : ''} — ₹${row.ratePerPiece}/pc`,
});

/**
 * The sheet, built — one model of it.
 *
 * The calculated price is shown but never typed: it is arithmetic over the lines above it, and
 * an input that can disagree with its own inputs is worse than no input.
 *
 * **One model, not one sheet.** A costing prices several now, each with its own cost, its own
 * price and its own floor [§7, §9], so this form is opened against a line and says which line it
 * is saving. Left out, the server builds the first — which is the whole of a one-model sheet and
 * what every caller written before the lines existed meant.
 */
export default function CostingSheetForm({ quotation: pricing, line, onClose, onSaved }) {
  /* The model being costed. The sheet itself is the fallback for a record with no lines yet. */
  const row = line || pricing.lines?.[0] || pricing;

  const [cost, setCost] = useState({
    gramWeight: row.cost?.gramWeight ?? '',
    rawMaterialRate: row.cost?.rawMaterialRate ?? '',
    jobWorkCost: row.cost?.jobWorkCost ?? '',
    hookCost: row.cost?.hookCost ?? '',
    metalClipsCost: row.cost?.metalClipsCost ?? '',
    printingCost: row.cost?.printingCost ?? '',
    packingCost: row.cost?.packingCost ?? '',
    otherCost: row.cost?.otherCost ?? '',
    inwardPrice: row.cost?.inwardPrice ?? '',
  });
  /* The trading master's item, for a bought-in piece: picking one brings its inward price. */
  const openedItem = row.tradedItem?._id ?? row.tradedItem ?? '';
  const [tradedItem, setTradedItem] = useState(openedItem);
  /* The item itself — its build-up is the making cost set against the inward price [SupplierCheck]. */
  const [tradedRecord, setTradedRecord] = useState(null);
  useEffect(() => {
    if (!tradedItem) {
      setTradedRecord(null);
      return undefined;
    }
    let live = true;
    tradedItemsApi.get(tradedItem).then((item) => live && setTradedRecord(item)).catch(() => live && setTradedRecord(null));
    return () => { live = false; };
  }, [tradedItem]);
  const [mould, setMould] = useState(row.mould?._id ?? row.mould ?? '');
  const [materialRef, setMaterialRef] = useState(row.materialRef?._id ?? row.materialRef ?? '');
  const [hookRef, setHookRef] = useState(row.hookRef?._id ?? row.hookRef ?? '');
  const [clipRef, setClipRef] = useState(row.clipRef?._id ?? row.clipRef ?? '');
  const [printRef, setPrintRef] = useState(row.printRef?._id ?? row.printRef ?? '');
  /*
   * The product details the enquiry asks for only on a new development [components/ItemCards.jsx]:
   * what the line arrived without is the reason the confirmation panel is there, and stays its
   * reason; what is still blank after the sheet is filled in is what the tick vouches for.
   */
  const [category, setCategory] = useState(row.category ?? '');
  const [packing, setPacking] = useState(row.packing ?? '');
  /* What the line arrived without — said on the sheet, never a gate: a quote goes out with blanks. */
  const missingAtOpen = useRef(missingDetails(row)).current;
  /* The register's own answer for a mould it knows, offered where the enquiry gave none. */
  useEffect(() => {
    const tool = row.mould?._id ?? row.mould;
    if (!tool || (row.category && row.packing)) return undefined;
    let live = true;
    mouldsApi.get(tool)
      .then((known) => {
        if (!live) return;
        if (!row.category && known.category) setCategory((current) => current || known.category);
        if (!row.packing && known.packingQty) setPacking((current) => current || `${known.packingQty} pcs per carton`);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [row.mould, row.category, row.packing]);
  /*
   * Hook, clips, packing and anything else are in the price only when ticked — a tick says this
   * piece has it. Opened on a saved sheet, a line already carrying a cost is ticked.
   */
  const [included, setIncluded] = useState(() => Object.fromEntries(
    /* Every hanger has a hook unless somebody says otherwise: ticked on a line not yet priced,
       at the register's price or nothing, and changeable here. */
    OPTIONAL_COSTS.map(([key]) => [key, Number(row.cost?.[key]) > 0 || (key === 'hookCost' && row.unitPrice == null)])
  ));
  const [markupPercent, setMarkup] = useState(row.markupPercent ?? 10);
  const [printing, setPrinting] = useState(row.printing ?? '');
  const [procurement, setProcurement] = useState(row.procurement ?? 'manufacture');
  /* Blank means "the standing floor" — the 10% tier. Only a job with its own floor fills it. */
  const [minimumOverride, setMinimumOverride] = useState(row.minimumOverride ?? '');
  const [approved, setApproved] = useState(row.unitPrice ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /*
   * The model on the trading master, when it is priced as made here: a bought-in piece costed off
   * a mould and a resin is costed wrong, so the sheet says so and offers the item's inward price.
   */
  const [onTradingMaster, setOnTradingMaster] = useState(null);
  useEffect(() => {
    const model = String(row.modelNumber || '').trim();
    if (procurement === 'trade' || !model) {
      setOnTradingMaster(null);
      return undefined;
    }
    let live = true;
    const key = model.replace(/\s+/g, ' ').toLowerCase();
    tradedItemsApi.list({ search: model, isActive: true, limit: 10 })
      .then((found) => {
        const rows = Array.isArray(found) ? found : found?.data || [];
        const item = rows.find((entry) => String(entry.modelNumber || '').replace(/\s+/g, ' ').trim().toLowerCase() === key);
        if (live) setOnTradingMaster(item || null);
      })
      .catch(() => live && setOnTradingMaster(null));
    return () => { live = false; };
  }, [row.modelNumber, procurement]);

  const priceAsTrade = () => {
    setProcurement('trade');
    setTradedItem(onTradingMaster._id);
    if (onTradingMaster.inwardPrice != null) setCost((current) => ({ ...current, inwardPrice: onTradingMaster.inwardPrice }));
  };

  const number = (value) => (value === '' || value === null ? undefined : Number(value));

  /*
   * Refilling from the two registers, on the same rule the server applies.
   *
   * The grammage is the part worth doing here rather than only on save: a cavity is a fixed
   * volume, so the same tool throws a heavier part in a denser resin, and somebody who picks
   * HIPS and watches the weight stay at its PP figure will reasonably assume it has been
   * handled. It has, on save — but the sheet would be showing them a total that is 18% light in
   * the meantime, which is exactly the number they are about to make a decision on.
   *
   * **Only a genuine change of selection refills, and only the lines that selection owns.**
   *
   * This used to skip the first effect run and treat every run after it as a change. That is
   * counting invocations, and the count is not something a component gets to rely on: React runs
   * effects twice on mount under StrictMode precisely to catch code that does. Measured on a
   * saved sheet, simply pressing "Re-cost" fired six register fetches and rewrote every derived
   * figure from the registers — so a grammage somebody had typed for this particular job was
   * replaced by the tool's own, and the sheet opened showing the weight for the resin the *mould*
   * is set up for rather than the one the sheet was saved with. The guard was doing nothing.
   *
   * So the question is not "has this effect run before" but "is this selection different from
   * the one already applied". `applied` starts as whatever the sheet was opened with, which makes
   * the whole thing idempotent: any number of runs with an unchanged selection does nothing, and
   * opening a sheet cannot disturb it.
   *
   * Scoped per source for the same reason. Changing the hook used to re-derive the grammage and
   * the job-work lines from the mould, which is the same overwrite arriving by a different door.
   * The grammage depends on the tool *and* the resin, so it refills when either moves; everything
   * else refills only from its own register.
   */
  const applied = useRef({ mould, materialRef, hookRef, clipRef, printRef });
  useEffect(() => {
    const selection = { mould, materialRef, hookRef, clipRef, printRef };
    const moved = new Set(
      Object.keys(selection).filter((key) => selection[key] !== applied.current[key])
    );
    if (!moved.size) return;
    /* Marked before the fetch, so a second run for the same selection is already a no-op. */
    applied.current = selection;

    const partMoved = moved.has('mould') || moved.has('materialRef');

    let live = true;
    Promise.all([
      /* Both, whenever either moved: the grammage is the tool's figure in the chosen resin. */
      mould && partMoved ? mouldsApi.get(mould) : null,
      materialRef && partMoved ? materialsApi.get(materialRef) : null,
      hookRef && moved.has('hookRef') ? componentsApi.get(hookRef) : null,
      clipRef && moved.has('clipRef') ? componentsApi.get(clipRef) : null,
      printRef && moved.has('printRef') ? componentsApi.get(printRef) : null,
    ])
      .then(([tool, resin, hook, clip, print]) => {
        if (!live) return;
        setCost((current) => ({
          ...current,
          ...(tool
            ? {
                gramWeight: cutGrams(
                  tool.consumptionPerPieceGrams * (1 + (resin?.grammageFactorPercent || 0) / 100)
                ),
                /* The tool's own cost lines, only when the tool itself changed. A different
                   resin does not change what the job work on this mould costs. */
                ...(moved.has('mould')
                  ? {
                      jobWorkCost: tool.jobWorkCost ?? current.jobWorkCost,
                      hookCost: tool.hookCost ?? current.hookCost,
                      metalClipsCost: tool.clipsCost ?? current.metalClipsCost,
                      printingCost: tool.printingCost ?? current.printingCost,
                      packingCost: tool.packingCost ?? current.packingCost,
                    }
                  : {}),
              }
            : {}),
          ...(resin && moved.has('materialRef') ? { rawMaterialRate: resin.ratePerKg } : {}),
          /*
           * After the mould, deliberately. The tool says the piece takes a hook — a fact about
           * the part — and the register says what a hook costs this week. When both have an
           * opinion the priced one is newer and has a name attached.
           */
          ...(hook ? { hookCost: hook.ratePerPiece } : {}),
          ...(clip ? { metalClipsCost: clip.ratePerPiece } : {}),
          ...(print ? { printingCost: print.ratePerPiece } : {}),
        }));
      })
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [mould, materialRef, hookRef, clipRef, printRef]);

  const loadMoulds = useCallback(
    (term) => mouldsApi.list({ search: term || undefined, isActive: true, limit: 20 }),
    []
  );
  const loadMaterials = useCallback(
    (term) => materialsApi.list({ search: term || undefined, isActive: true, limit: 20 }),
    []
  );
  const loadTradedItems = useCallback(
    (term) => tradedItemsApi.list({ search: term || undefined, isActive: true, limit: 20 }),
    []
  );
  /* One loader per register, because `kind` is which register rather than a filter on one. */
  const loadParts = (kind) => (term) =>
    componentsApi.list({ kind, search: term || undefined, isActive: true, limit: 20 });

  // The same arithmetic the server does, so the sheet adds up as it is typed rather than after
  // it is saved. The server's answer is still the one that is stored.
  /* A trade hanger with a supplier's price is priced on it — the resin, job work and parts are in
     what the supplier charges, so only printing and misc add; the build-up is the making cost beside
     it. One the supplier has not priced is costed from the build-up, as a made piece is [server: Quotation.js `totalCost`]. */
  const trade = procurement === 'trade';
  const supplied = trade && Number(cost.inwardPrice) > 0;
  const material = (Number(cost.gramWeight) * Number(cost.rawMaterialRate)) / 1000 || 0;
  const counts = (key) => !OPTIONAL_KEYS.includes(key) || included[key];
  const sumOf = (keys) => keys.reduce((sum, key) => sum + (counts(key) ? Number(cost[key]) || 0 : 0), 0);
  const total = supplied
    ? Number(cost.inwardPrice) + sumOf(['printingCost', 'otherCost'])
    : material + sumOf(['jobWorkCost', 'hookCost', 'metalClipsCost', 'printingCost', 'packingCost', 'otherCost']);

  /*
   * Cost plus a markup, rounded up to five paise — from `utils/pricing.js`, which mirrors the
   * server's `priceAt` line for line.
   *
   * This used to be one expression here that rounded to the nearest *paisa*, so a ₹11.05 cost
   * at 10% read ₹12.16 on the sheet and saved as ₹12.20. Worse than a display difference:
   * pressing a tier fills the approved price with the number shown, and a price somebody has
   * typed is deliberately not re-rounded by the server — so the sheet quietly talked people
   * into approving five paise under the tier they had just pressed, and under the §9 floor.
   */
  const priceAt = (percent) => priceFor(total, percent);
  const calculated = priceAt(markupPercent);
  /* The standing tiers, side by side, because choosing between them is the pricing decision. */
  const tiers = STANDARD_TIERS;
  const floor = minimumOverride === '' ? priceAt(MINIMUM_TIER) : Number(minimumOverride);

  /*
   * A floor under the cost base is not a lower floor, it is no floor.
   *
   * §9's approval fires when the price is under the minimum; a minimum typed under what the
   * piece costs means every price clears it, so the gate never fires again for this model. The
   * server refuses it — this says so while the number is still being typed, and names the field
   * that does what the person is actually reaching for.
   */
  const belowCost = minimumOverride !== '' && total > 0 && Number(minimumOverride) < total;

  /*
   * The register entries picked on this sheet — the tool, the resin, the hook, the clips, the
   * print job.
   *
   * These were never sent. The pickers filled the rates onto the lines, the rates were saved, and
   * the choice itself was dropped — so the detail page, the review step and the quote had no
   * resin, hook, clip or print to name, and re-opening the sheet showed the pickers empty again.
   *
   * Only what changed goes, and a cleared picker goes as `null`. Sending an unchanged choice
   * would make the server refill every line from the registers, and a figure somebody typed for
   * this particular job would be overwritten by a picker nobody touched.
   */
  const chosenParts = () => changedParts({ mould, materialRef, hookRef, clipRef, printRef }, row);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await quotationsApi.cost({
          id: pricing._id, lineId: row._id, expectedUpdatedAt: pricing.updatedAt,
          /* An unticked part goes as nothing, so the saved sheet prices exactly what was ticked. */
          cost: Object.fromEntries(
            Object.entries(cost).map(([key, value]) => [key, counts(key) ? number(value) : 0])
          ),
          markupPercent: number(markupPercent),
          minimumOverride: number(minimumOverride),
          /* Only before it goes out: after that the price moves through a revision. */
          ...(pricing.sentAt ? {} : { unitPrice: number(approved) }),
          printing: printing || undefined,
          procurement,
          /* The product details confirmed on the sheet, only where they moved. */
          ...(category !== (row.category ?? '') ? { category: category || null } : {}),
          ...(packing !== (row.packing ?? '') ? { packing } : {}),
          ...chosenParts(),
          /* Only when the pick changed: an unchanged item would re-fill a price typed by hand. */
          ...(tradedItem !== openedItem ? { tradedItem: tradedItem || null } : {}),
        })
      );
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  /* One cost line's input. Named `costField` rather than `line`, which is now the model. */
  const costField = (key, label, hint, step = '0.01') => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        step={step}
        min="0"
        className="input"
        value={cost[key]}
        onChange={(event) => setCost({ ...cost, [key]: event.target.value })}
      />
    </Field>
  );

  /* A cost line counted only when ticked; unticked, its box is greyed and it is left out. */
  const tickField = (key, label) => (
    <div key={key} className={`rounded-lg border px-3 py-2 ${included[key] ? 'border-accent/40 bg-accent/[0.04]' : 'border-line/[0.1]'}`}>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-steel-200">
        <input
          type="checkbox"
          checked={Boolean(included[key])}
          onChange={(event) => setIncluded({ ...included, [key]: event.target.checked })}
          aria-label={`Include ${label.toLowerCase()} in the price`}
        />
        {label}
        <span className="ml-auto text-xs font-normal text-steel-400">{included[key] ? 'In the price' : 'Not in the price'}</span>
      </label>
      <input
        type="number"
        step="0.01"
        min="0"
        className="input mt-1.5"
        disabled={!included[key]}
        value={cost[key]}
        onChange={(event) => setCost({ ...cost, [key]: event.target.value })}
        placeholder="₹ per piece"
        aria-label={`${label} per piece`}
      />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-5">
      {/*
        Which model is being priced, where there is more than one. Without it the sheet opens on
        a set of numbers with nothing saying whose they are, and the first person to re-cost a
        five-model sheet would reasonably believe they were editing all of it.
      */}
      {procurement === 'trade' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-aqua-500/25 bg-aqua-500/[0.06] px-3.5 py-2.5">
          <TradingBadge />
          <p className="text-xs text-steel-300">
            {row.modelNumber || 'This model'} is bought in and resold — costed at the supplier&rsquo;s inward price, not off a mould.
          </p>
        </div>
      )}
      {onTradingMaster && (
        <Notice tone="info">
          <span className="font-semibold">{onTradingMaster.modelNumber}</span> is a trading model — on the trading master
          {onTradingMaster.inwardPrice != null ? ` at ₹${onTradingMaster.inwardPrice} inward` : ''}.{' '}
          <button type="button" className="font-semibold underline" onClick={priceAsTrade}>Price it as Trade</button>
        </Notice>
      )}
      {onTradingMaster && <SupplierCheck traded={onTradingMaster} inwardPrice={onTradingMaster.inwardPrice} />}
      {pricing.lines?.length > 1 && (
        <div className="rounded-lg border border-flame-500/20 bg-flame-500/[0.06] px-3.5 py-2.5">
          <p className="text-xs text-steel-300">
            Pricing{' '}
            <span className="font-semibold text-steel-100">{row.modelNumber || 'this model'}</span>
            {' '}— one of {pricing.lines.length} on {pricing.number}. Each has its own cost and its
            own floor, so the rest are untouched by what is saved here.
          </p>
        </div>
      )}

      {/*
        * The product details the enquiry did not ask for — the packing here, the hook and clip
        * from the parts registers below. Filled in where known; a quote goes out without them,
        * so nothing here is a tick to pass. The order form asks again before the goods are booked
        * [components/OrderForm.jsx].
        */}
      {procurementNeedsDetails(procurement) && (
        <section className="space-y-3 rounded-xl border border-line/[0.1] p-4" aria-labelledby="product-details-heading">
          <div>
            <p id="product-details-heading" className="text-sm font-bold text-steel-50">Product details</p>
            {missingAtOpen.length > 0 && (
              <p className="mt-0.5 text-xs text-steel-400">Not given on the enquiry: {sayList(missingAtOpen)}. Fill in what is known; the rest is asked for on the order.</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Packing" hint="Pieces per carton, polybag — as the buyer wants it">
              <input className="input" placeholder="200 pcs per carton" value={packing} onChange={(event) => setPacking(event.target.value)} aria-label="Packing" />
            </Field>
          </div>
          <p className="text-xs text-steel-400">The hook and clip are picked from the parts registers below.</p>
        </section>
      )}

      {/*
        Made here or bought in. A bought-in piece is costed at what the supplier is paid — the
        inward price on the trading master — so picking the item fills it, and it stays editable
        for a one-off price.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Trade or manufacture" hint="Bought in and resold, or made here">
          <select
            className="input"
            value={procurement}
            onChange={(event) => setProcurement(event.target.value)}
          >
            <option value="manufacture">Manufacture</option>
            <option value="trade">Trade</option>
          </select>
        </Field>
        {procurement === 'trade' && (
          <Field label="Trading master item" hint="Brings its inward price">
            <Combobox
              value={tradedItem}
              onChange={(value) => {
                setTradedItem(value);
                if (!value) return;
                tradedItemsApi.get(value)
                  .then((item) => setCost((current) => ({ ...current, inwardPrice: item.inwardPrice ?? current.inwardPrice })))
                  .catch(() => {});
              }}
              loadOptions={loadTradedItems}
              loadOne={tradedItemsApi.get}
              toOption={(item) => ({
                value: item._id,
                label: `${item.modelNumber}${item.inwardPrice != null ? ` — ₹${item.inwardPrice}` : ''}${item.supplier ? ` · ${item.supplier}` : ''}`,
              })}
              placeholder="Search the trading master…"
              emptyLabel="No item — type the inward price below"
              noMatchLabel="Not on the trading master"
            />
          </Field>
        )}
      </div>
      {procurement === 'trade' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {costField('inwardPrice', 'Inward price', '₹ per piece paid to the supplier')}
        </div>
      )}
      {/* What the piece would cost to make, beside what the supplier charges — the number to negotiate from. */}
      {procurement === 'trade' && tradedRecord && <SupplierCheck traded={tradedRecord} inwardPrice={cost.inwardPrice} />}

      {/*
        The two registers first, because they fill most of the sheet below. Picking a tool sets
        the grammage to what a piece actually consumes — part plus its share of the runner —
        and picking a resin converts that onto its own basis and brings its rate. Everything
        they fill stays editable underneath.
      */}
      {trade && (
        <Notice tone="info">
          {supplied
            ? 'A bought-in piece: costed at the inward price, so no material cost is added.'
            : 'A bought-in piece the supplier has not priced: costed from the build-up below, as a made piece is. Type the inward price to cost at it instead.'}
        </Notice>
      )}
      {!supplied && (<>
      <div className="grid gap-4 sm:grid-cols-2">
        {!trade && (
        <Field label="Mould" hint="Fills the grammage and this tool's cost lines">
          <Combobox
            value={mould}
            onChange={setMould}
            loadOptions={loadMoulds}
            loadOne={mouldsApi.get}
            toOption={(row) => ({ value: row._id, label: `${row.mouldCode} — ${row.name}` })}
            placeholder="Search the register…"
            emptyLabel="No mould — type the weight below"
            noMatchLabel="No tool matches"
          />
        </Field>
        )}
        <Field label="Material" hint="Brings its rate, and its grammage over PP">
          <Combobox
            value={materialRef}
            onChange={setMaterialRef}
            loadOptions={loadMaterials}
            loadOne={materialsApi.get}
            toOption={(row) => ({
              value: row._id,
              label: `${row.name}${row.colour ? ` · ${row.colour}` : ''} — ₹${row.ratePerKg}/kg${
                row.grammageFactorPercent ? ` · +${row.grammageFactorPercent}%` : ''
              }`,
            })}
            placeholder="Search the register…"
            emptyLabel="No material — type the rate below"
            noMatchLabel="No material matches"
          />
        </Field>
      </div>

      {/* What this mould in this material went out at before, once both are picked. */}
      <PreviousQuotes mould={mould} material={materialRef} hook={hookRef} clip={clipRef} exclude={pricing._id} />

      <div className="grid gap-4 sm:grid-cols-2">
        {costField('gramWeight', 'Gram weight', 'Grams a piece consumes, in this resin — up to five decimals', GRAM_STEP)}
        {costField('rawMaterialRate', 'Raw material rate', '₹ per kilo, as the market quotes it')}
      </div>

      {/* The derived line, in the middle of the sheet where it is checked rather than at the
          end where it is taken on trust. */}
      <div className="rounded-lg border border-line/[0.08] bg-line/[0.02] px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-steel-500">
          Material cost per piece
        </p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-steel-50">{rupees(material)}</p>
        <p className="mt-0.5 text-xs text-steel-500">
          {cost.gramWeight || 0}g × ₹{cost.rawMaterialRate || 0}/kg ÷ 1000
        </p>
      </div>
      </>)}

      {/*
        The three parts registers, each above the line it fills. Left blank the line is typed by
        hand or comes from the mould; picked, the register's rate lands on it and the sheet
        records which part it was, so the figure can be checked six months from now.
      */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Hook" hint="Fills the hook line">
          <Combobox
            value={hookRef}
            onChange={setHookRef}
            loadOptions={loadParts('hook')}
            loadOne={componentsApi.get}
            toOption={partOption}
            placeholder="Search hooks…"
            emptyLabel="No hook chosen"
            noMatchLabel="No hook matches"
          />
        </Field>
        <Field label="Clips" hint="Fills the metal clips line">
          <Combobox
            value={clipRef}
            onChange={setClipRef}
            loadOptions={loadParts('clip')}
            loadOne={componentsApi.get}
            toOption={partOption}
            placeholder="Search clips…"
            emptyLabel="No clips chosen"
            noMatchLabel="No clip matches"
          />
        </Field>
        <Field label="Printing" hint="Fills the print line">
          <Combobox
            value={printRef}
            onChange={setPrintRef}
            loadOptions={loadParts('print')}
            loadOne={componentsApi.get}
            toOption={partOption}
            placeholder="Search print jobs…"
            emptyLabel="No print chosen"
            noMatchLabel="No print job matches"
          />
        </Field>
      </div>

      {/* Named as the sheet names them, and in the sheet's order. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {costField('jobWorkCost', 'Job work', 'Per piece')}
        {costField('printingCost', 'Print price', 'Per piece')}
      </div>
      <div>
        <p className="eyebrow mb-2">In the price only when ticked</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPTIONAL_COSTS.map(([key, label]) => tickField(key, label))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Printing" hint="What is printed — the sheet says “1 COLOUR”">
          <input
            className="input"
            placeholder="1 COLOUR"
            value={printing}
            onChange={(event) => setPrinting(event.target.value)}
          />
        </Field>
      </div>

      <div className="card px-4 py-3">
        <p className="eyebrow">Net total — what one piece costs</p>
        <p className="stat-value mt-1 text-steel-50">{rupees(total)}</p>
      </div>

      {/*
        The three standing tiers, side by side and clickable, exactly as the sheet lays them
        out. Choosing between them is the pricing decision; showing one number would hide it.
        The lowest is the floor, so it is labelled rather than left to be inferred.
      */}
      <div>
        <p className="eyebrow mb-2">Cost plus</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {tiers.map((percent) => {
            const price = priceAt(percent);
            const chosen = Number(markupPercent) === percent;
            return (
              <button
                key={percent}
                type="button"
                onClick={() => {
                  setMarkup(percent);
                  setApproved(price ? String(price) : '');
                }}
                className={`card px-4 py-3 text-left transition-colors ${
                  chosen ? 'ring-1 ring-flame-500/50' : 'hover:bg-line/[0.04]'
                }`}
              >
                <p className="eyebrow">
                  {percent}%{percent === MINIMUM_TIER ? ' · floor' : ''}
                </p>
                <p className={`stat-value mt-1 ${chosen ? 'text-flame-400' : 'text-steel-50'}`}>
                  {rupees(price)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card px-4 py-3">
          <p className="eyebrow">Markup on the price</p>
          <p className="stat-value mt-1 text-steel-50">
            {approved && total ? `${(((approved - total) / total) * 100).toFixed(1)}%` : '—'}
          </p>
          <p className="mt-0.5 text-xs text-steel-500">What is being added to cost</p>
        </div>
        <div className="card px-4 py-3">
          <p className="eyebrow">Margin on the price</p>
          <p className="stat-value mt-1 text-steel-50">
            {approved && total ? `${(((approved - total) / approved) * 100).toFixed(1)}%` : '—'}
          </p>
          {/*
            The rupees beside the percentage. A margin is how a price is judged; the paise per
            piece is what the plant actually banks, and on a 20,000-piece lot the difference
            between 9% and 11% is a number somebody wants to see rather than work out.
          */}
          <p className="mt-0.5 text-xs text-steel-500">
            {approved && total
              ? `${rupees(approved - total)} a piece`
              : 'What the job earns'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/*
          Blank by design. The floor is the 10% tier — standing policy applied to this cost —
          so asking for it again would invite a number that disagrees with the arithmetic
          above it. This is only for the job that genuinely has a floor of its own.
        */}
        <Field
          label="Floor override"
          hint={`Blank means the standing floor, ${rupees(priceAt(MINIMUM_TIER))}`}
        >
          <input
            type="number"
            step="0.01"
            /* Never under cost — the server refuses it, and the field beside this one is what
               the person reaching for a small number here actually wants. */
            min={total ? total.toFixed(2) : '0'}
            className="input"
            placeholder={priceAt(MINIMUM_TIER) ? priceAt(MINIMUM_TIER).toFixed(2) : ''}
            value={minimumOverride}
            onChange={(event) => setMinimumOverride(event.target.value)}
            aria-invalid={belowCost ? 'true' : undefined}
          />
        </Field>
        <Field label="Price to the buyer" hint={pricing.sentAt ? "Already with the buyer — a new price is a revision" : "On the quotation. Blank uses the calculated price"}>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            placeholder={calculated ? calculated.toFixed(2) : ''}
            value={approved}
            disabled={Boolean(pricing.sentAt)}
            onChange={(event) => setApproved(event.target.value)}
          />
        </Field>
      </div>


      {/* Said before saving, not discovered after: the route this sheet is about to take. */}
      {/*
        Reads the derived floor now, not a typed one — so it fires on the ordinary sheet where
        nobody entered a minimum, which is every sheet. Before, a blank minimum meant this
        warning never appeared and the approval arrived as a surprise after saving.
      */}
      {belowCost && (
        <Notice tone="danger">
          A floor of {rupees(Number(minimumOverride))} is under the {rupees(total)} the piece
          costs to make, so every price would clear it and nothing would ever go for approval
          again. To let one job through cheaply, put the price in <strong>Price to the
          buyer</strong> — under the minimum it goes to Admin, which is the decision being made.
        </Notice>
      )}

      {/* The floor holds, and the price is under it: the ordinary route to a signature, said
          before saving rather than discovered after. */}
      {!belowCost && approved !== '' && floor > 0 && Number(approved) < floor && (
        <Notice tone="warn">
          {rupees(Number(approved))} is below the minimum of {rupees(floor)}, so this goes to
          Admin for approval and the quotation cannot be sent until they sign it off.
        </Notice>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save the costing'}
        </button>
      </div>
    </form>
  );
}

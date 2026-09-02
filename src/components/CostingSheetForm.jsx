import { useCallback, useEffect, useRef, useState } from 'react';
import { components as componentsApi, materials as materialsApi, moulds as mouldsApi, pricings as pricingsApi } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import Combobox from './Combobox.jsx';

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
const partOption = (row) => ({
  value: row._id,
  label: `${row.name}${row.colour ? ` · ${row.colour}` : ''} — ₹${row.ratePerPiece}/pc`,
});

/**
 * The sheet, built.
 *
 * The calculated price is shown but never typed: it is arithmetic over the lines above it, and
 * an input that can disagree with its own inputs is worse than no input.
 */
export default function CostingSheetForm({ pricing, onClose, onSaved }) {
  const [cost, setCost] = useState({
    gramWeight: pricing.cost?.gramWeight ?? '',
    rawMaterialRate: pricing.cost?.rawMaterialRate ?? '',
    jobWorkCost: pricing.cost?.jobWorkCost ?? '',
    hookCost: pricing.cost?.hookCost ?? '',
    metalClipsCost: pricing.cost?.metalClipsCost ?? '',
    printingCost: pricing.cost?.printingCost ?? '',
    packingCost: pricing.cost?.packingCost ?? '',
    otherCost: pricing.cost?.otherCost ?? '',
  });
  const [mould, setMould] = useState(pricing.mould?._id ?? pricing.mould ?? '');
  const [materialRef, setMaterialRef] = useState(pricing.materialRef?._id ?? pricing.materialRef ?? '');
  const [hookRef, setHookRef] = useState(pricing.hookRef?._id ?? pricing.hookRef ?? '');
  const [clipRef, setClipRef] = useState(pricing.clipRef?._id ?? pricing.clipRef ?? '');
  const [printRef, setPrintRef] = useState(pricing.printRef?._id ?? pricing.printRef ?? '');
  const [markupPercent, setMarkup] = useState(pricing.markupPercent ?? 10);
  const [printing, setPrinting] = useState(pricing.printing ?? '');
  const [procurement, setProcurement] = useState(pricing.procurement ?? 'manufacture');
  /* Blank means "the standing floor" — the 10% tier. Only a job with its own floor fills it. */
  const [minimumOverride, setMinimumOverride] = useState(pricing.minimumOverride ?? '');
  const [approved, setApproved] = useState(pricing.approvedSellingPrice ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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
   * Skipped on the first render, so opening an existing sheet does not quietly overwrite the
   * figures it was saved with. Only a *change* of tool or resin refills.
   */
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (!mould && !materialRef && !hookRef && !clipRef && !printRef) return;

    let live = true;
    Promise.all([
      mould ? mouldsApi.get(mould) : null,
      materialRef ? materialsApi.get(materialRef) : null,
      hookRef ? componentsApi.get(hookRef) : null,
      clipRef ? componentsApi.get(clipRef) : null,
      printRef ? componentsApi.get(printRef) : null,
    ])
      .then(([tool, resin, hook, clip, print]) => {
        if (!live) return;
        setCost((current) => ({
          ...current,
          ...(tool
            ? {
                gramWeight:
                  Math.round(
                    tool.consumptionPerPieceGrams *
                      (1 + (resin?.grammageFactorPercent || 0) / 100) *
                      1000
                  ) / 1000,
                jobWorkCost: tool.jobWorkCost ?? current.jobWorkCost,
                hookCost: tool.hookCost ?? current.hookCost,
                metalClipsCost: tool.clipsCost ?? current.metalClipsCost,
                printingCost: tool.printingCost ?? current.printingCost,
                packingCost: tool.packingCost ?? current.packingCost,
              }
            : {}),
          ...(resin ? { rawMaterialRate: resin.ratePerKg } : {}),
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
  /* One loader per register, because `kind` is which register rather than a filter on one. */
  const loadParts = (kind) => (term) =>
    componentsApi.list({ kind, search: term || undefined, isActive: true, limit: 20 });

  // The same arithmetic the server does, so the sheet adds up as it is typed rather than after
  // it is saved. The server's answer is still the one that is stored.
  const material = (Number(cost.gramWeight) * Number(cost.rawMaterialRate)) / 1000 || 0;
  const total =
    material +
    ['jobWorkCost', 'hookCost', 'metalClipsCost', 'printingCost', 'packingCost', 'otherCost'].reduce(
      (sum, key) => sum + (Number(cost[key]) || 0),
      0
    );

  /*
   * Cost *plus* a markup, which is how the sheet works — not cost divided by one minus a
   * margin. The two agree at 10% and diverge fast: at 20% they are ₹8.34 and ₹8.69 on the
   * sheet's own first row.
   */
  const priceAt = (percent) => Math.round(total * (1 + (Number(percent) || 0) / 100) * 100) / 100;
  const calculated = priceAt(markupPercent);
  /* The standing tiers, side by side, because choosing between them is the pricing decision. */
  const tiers = [10, 15, 20];
  const floor = minimumOverride === '' ? priceAt(10) : Number(minimumOverride);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await pricingsApi.cost({
          id: pricing._id,
          cost: Object.fromEntries(
            Object.entries(cost).map(([key, value]) => [key, number(value)])
          ),
          markupPercent: number(markupPercent),
          minimumOverride: number(minimumOverride),
          approvedSellingPrice: number(approved),
          printing: printing || undefined,
          procurement,
        })
      );
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const line = (key, label, hint) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        step="0.01"
        min="0"
        className="input"
        value={cost[key]}
        onChange={(event) => setCost({ ...cost, [key]: event.target.value })}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-5">
      {/*
        The two registers first, because they fill most of the sheet below. Picking a tool sets
        the grammage to what a piece actually consumes — part plus its share of the runner —
        and picking a resin converts that onto its own basis and brings its rate. Everything
        they fill stays editable underneath.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
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

      <div className="grid gap-4 sm:grid-cols-2">
        {line('gramWeight', 'Gram weight', 'Grams a piece consumes, in this resin')}
        {line('rawMaterialRate', 'Raw material rate', '₹ per kilo, as the market quotes it')}
      </div>

      {/* The derived line, in the middle of the sheet where it is checked rather than at the
          end where it is taken on trust. */}
      <div className="rounded-lg border border-line/[0.08] bg-line/[0.02] px-4 py-3">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
          Material cost per piece
        </p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-steel-50">{rupees(material)}</p>
        <p className="mt-0.5 text-[0.6875rem] text-steel-500">
          {cost.gramWeight || 0}g × ₹{cost.rawMaterialRate || 0}/kg ÷ 1000
        </p>
      </div>

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
        {line('jobWorkCost', 'Job work', 'Per piece')}
        {line('hookCost', 'Hook', 'Per piece')}
        {line('metalClipsCost', 'Metal clips', 'Per piece')}
        {line('printingCost', 'Print price', 'Per piece')}
        {line('packingCost', 'Packing', 'Per piece')}
        {line('otherCost', 'Anything else', 'Per piece')}
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
                  {percent}%{percent === 10 ? ' · floor' : ''}
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
          <p className="eyebrow">Markup on the approved price</p>
          <p className="stat-value mt-1 text-steel-50">
            {approved && total ? `${(((approved - total) / total) * 100).toFixed(1)}%` : '—'}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-steel-500">What is being added to cost</p>
        </div>
        <div className="card px-4 py-3">
          <p className="eyebrow">Margin on the approved price</p>
          <p className="stat-value mt-1 text-steel-50">
            {approved && total ? `${(((approved - total) / approved) * 100).toFixed(1)}%` : '—'}
          </p>
          {/*
            The rupees beside the percentage. A margin is how a price is judged; the paise per
            piece is what the plant actually banks, and on a 20,000-piece lot the difference
            between 9% and 11% is a number somebody wants to see rather than work out.
          */}
          <p className="mt-0.5 text-[0.6875rem] text-steel-500">
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
          hint={`Blank means the standing floor, ${rupees(priceAt(10))}`}
        >
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            placeholder={priceAt(10) ? priceAt(10).toFixed(2) : ''}
            value={minimumOverride}
            onChange={(event) => setMinimumOverride(event.target.value)}
          />
        </Field>
        <Field label="Approved selling price" hint="What marketing may quote. Blank uses the calculated price">
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            placeholder={calculated ? calculated.toFixed(2) : ''}
            value={approved}
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
      {approved !== '' && floor > 0 && Number(approved) < floor && (
        <Notice tone="warn">
          {rupees(Number(approved))} is below the floor of {rupees(floor)}, so this goes to
          management for approval and nothing can be quoted until they sign it off.
        </Notice>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save the costing'}
        </button>
      </div>
    </form>
  );
}

import { useCallback, useState } from 'react';
import { materials as materialsApi, tradedItems as tradedItemsApi } from '../api/endpoints.js';
import { Field, FormError } from './ui.jsx';
import Combobox from './Combobox.jsx';
import { MouldPhotoField } from './MouldPhoto.jsx';
import { HANGER_CATEGORIES } from '../utils/pipeline.js';

/**
 * One bought-in item on the trading master [server: models/TradedItem.js]. A change of inward
 * price is dated and kept by the server, with the note written here beside it.
 */
const blank = (item) => ({
  modelNumber: item?.modelNumber ?? '',
  code: item?.code ?? '',
  description: item?.description ?? '',
  category: item?.category ?? '',
  sizeMm: item?.sizeMm ?? '',
  colour: item?.colour ?? '',
  material: item?.material ?? '',
  supplier: item?.supplier ?? '',
  supplierItemCode: item?.supplierItemCode ?? '',
  inwardPrice: item?.inwardPrice ?? '',
  moq: item?.moq ?? '',
  piecesPerCarton: item?.piecesPerCarton ?? '',
  hsnCode: item?.hsnCode ?? '',
  gstPercent: item?.gstPercent ?? '',
  notes: item?.notes ?? '',
  isActive: item?.isActive !== false,
  buildUp: {
    ...Object.fromEntries(BUILD_UP.map(([key]) => [key, item?.buildUp?.[key] ?? ''])),
    /* The resin the grams are costed in — its rate and grammage over PP — and a rate typed over it. */
    material: item?.buildUp?.material?._id ?? item?.buildUp?.material ?? '',
    ratePerKg: item?.buildUp?.ratePerKg ?? '',
  },
});

const NUMBERS = ['sizeMm', 'inwardPrice', 'moq', 'piecesPerCarton', 'gstPercent'];

/* The plant's cost build-up for the piece, as the price sheet heads it [server: TradedItem `buildUp`]. */
const BUILD_UP = [
  ['partWeightGrams', 'Grammage as PP (g)'],
  ['runnerWeightGrams', 'Runner grammage (g)'],
  ['jobWorkCost', 'Job work cost (₹)'],
  ['hookCost', 'Hook (₹)'],
  ['clipsCost', 'Clips (₹)'],
  ['packingCost', 'Packing cost (₹)'],
];

export default function TradedItemForm({ item, onClose, onSaved }) {
  const [values, setValues] = useState(blank(item));
  const [priceNote, setPriceNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  /* Held until Save, then sent on its own endpoint, as the mould form does. */
  const [photo, setPhoto] = useState(null);
  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });
  const setCost = (key) => (event) => setValues({ ...values, buildUp: { ...values.buildUp, [key]: event.target.value } });
  const setResin = (value) => setValues((current) => ({ ...current, buildUp: { ...current.buildUp, material: value || '' } }));
  const loadMaterials = useCallback((term) => materialsApi.list({ search: term || undefined, isActive: true, limit: 20 }), []);
  const priceMoved = item && values.inwardPrice !== '' && Number(values.inwardPrice) !== item.inwardPrice;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { buildUp: costs, ...plain } = values;
    const buildUp = Object.fromEntries(BUILD_UP.filter(([key]) => costs[key] !== '').map(([key]) => [key, Number(costs[key])]));
    if (costs.ratePerKg !== '') buildUp.ratePerKg = Number(costs.ratePerKg);
    buildUp.material = costs.material || null;
    const payload = Object.fromEntries(
      Object.entries(plain)
        .map(([key, value]) => [key, NUMBERS.includes(key) ? (value === '' ? undefined : Number(value)) : value])
        .map(([key, value]) => [key, typeof value === 'string' ? value.trim() || undefined : value])
    );
    /* Sent whenever the item had one or now has one, so clearing a figure clears it. */
    if (Object.keys(buildUp).length > 1 || buildUp.material || item?.buildUp) payload.buildUp = buildUp;
    try {
      let saved = item
        ? await tradedItemsApi.update({ id: item._id, ...payload, priceNote: priceMoved ? priceNote.trim() || undefined : undefined })
        : await tradedItemsApi.create(payload);
      if (photo) saved = await tradedItemsApi.setPhoto(saved._id, photo);
      onSaved?.(saved);
      onClose();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model" hint="The name the buyer and the quotation use" required>
          <input className="input" autoFocus placeholder="PH-17" value={values.modelNumber} onChange={set('modelNumber')} />
        </Field>
        <Field label="Item code" hint="Your own code, if you use one">
          <input className="input" placeholder="TR-001" value={values.code} onChange={set('code')} />
        </Field>
      </div>
      <MouldPhotoField photo={item?.photo} file={photo} onPick={setPhoto} onClear={() => setPhoto(null)} noun="item" />
      <Field label="Description">
        <input className="input" placeholder="Plain shirt hanger, 17 inch" value={values.description} onChange={set('description')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category">
          <select className="input" value={values.category} onChange={set('category')}>
            <option value="">—</option>
            {HANGER_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="Size (mm)">
          <input type="number" min="0" className="input" value={values.sizeMm} onChange={set('sizeMm')} />
        </Field>
        <Field label="Colour">
          <input className="input" value={values.colour} onChange={set('colour')} />
        </Field>
      </div>

      <div className="rounded-xl border border-flame-500/20 bg-flame-500/[0.05] p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inward price (₹ per piece)" hint="What the supplier is paid — a costing reads this" required>
            <input type="number" min="0" step="0.01" className="input" value={values.inwardPrice} onChange={set('inwardPrice')} />
          </Field>
          <Field label="Supplier">
            <input className="input" value={values.supplier} onChange={set('supplier')} />
          </Field>
        </div>
        {priceMoved && (
          <Field label="Why the price moved" hint="Kept in the price history" className="mt-4">
            <input className="input" placeholder="Supplier increase from 1 Nov" value={priceNote} onChange={(event) => setPriceNote(event.target.value)} />
          </Field>
        )}
      </div>

      <fieldset className="rounded-xl border border-line/[0.08] p-4">
        <legend className="px-1 text-xs font-bold uppercase tracking-[0.08em] text-steel-400">Cost build-up — per piece</legend>
        <p className="mb-3 text-xs text-steel-400">What the piece would cost the plant to make. The costing sheet sets it beside the inward price, so the supplier’s margin shows and there is a number to negotiate to.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Resin" hint="Its rate, and its grammage over PP">
            <Combobox
              value={values.buildUp.material}
              onChange={setResin}
              loadOptions={loadMaterials}
              loadOne={materialsApi.get}
              toOption={(row) => ({ value: row._id, label: `${row.name}${row.colour ? ` · ${row.colour}` : ''} — ₹${row.ratePerKg}/kg` })}
              placeholder="Search the material register…"
              emptyLabel="No resin — type the rate"
              noMatchLabel="No material matches"
            />
          </Field>
          <Field label="Rate (₹/kg)" hint="Typed over the resin's register rate">
            <input type="number" min="0" step="any" className="input" value={values.buildUp.ratePerKg} onChange={setCost('ratePerKg')} />
          </Field>
          {BUILD_UP.map(([key, label]) => (
            <Field key={key} label={label}>
              <input type="number" min="0" step="any" className="input" value={values.buildUp[key]} onChange={setCost(key)} />
            </Field>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Supplier's code">
          <input className="input" value={values.supplierItemCode} onChange={set('supplierItemCode')} />
        </Field>
        <Field label="Material">
          <input className="input" placeholder="PP, wood, velvet…" value={values.material} onChange={set('material')} />
        </Field>
        <Field label="MOQ" hint="Offered on the quotation line">
          <input type="number" min="0" className="input" value={values.moq} onChange={set('moq')} />
        </Field>
        <Field label="Pcs per carton">
          <input type="number" min="0" className="input" value={values.piecesPerCarton} onChange={set('piecesPerCarton')} />
        </Field>
        <Field label="HSN">
          <input className="input" value={values.hsnCode} onChange={set('hsnCode')} />
        </Field>
        <Field label="GST %">
          <input type="number" step="any" min="0" max="100" className="input" value={values.gstPercent} onChange={set('gstPercent')} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea rows={2} className="input" value={values.notes} onChange={set('notes')} />
      </Field>
      {item && (
        <label className="flex items-center gap-2 text-sm text-steel-300">
          <input type="checkbox" checked={values.isActive} onChange={(event) => setValues({ ...values, isActive: event.target.checked })} />
          Still bought — untick to retire it (old quotations keep pointing at it)
        </label>
      )}

      <FormError error={error} />
      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || !values.modelNumber.trim() || values.inwardPrice === ''}>
          {busy ? 'Saving…' : item ? 'Save' : 'Add to the trading master'}
        </button>
      </div>
    </form>
  );
}

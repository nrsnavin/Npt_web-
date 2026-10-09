import { useState } from 'react';
import { tradedItems as tradedItemsApi } from '../api/endpoints.js';
import { Field, FormError } from './ui.jsx';
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
});

const NUMBERS = ['sizeMm', 'inwardPrice', 'moq', 'piecesPerCarton', 'gstPercent'];

export default function TradedItemForm({ item, onClose, onSaved }) {
  const [values, setValues] = useState(blank(item));
  const [priceNote, setPriceNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });
  const priceMoved = item && values.inwardPrice !== '' && Number(values.inwardPrice) !== item.inwardPrice;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const payload = Object.fromEntries(
      Object.entries(values)
        .map(([key, value]) => [key, NUMBERS.includes(key) ? (value === '' ? undefined : Number(value)) : value])
        .map(([key, value]) => [key, typeof value === 'string' ? value.trim() || undefined : value])
    );
    try {
      const saved = item
        ? await tradedItemsApi.update({ id: item._id, ...payload, priceNote: priceMoved ? priceNote.trim() || undefined : undefined })
        : await tradedItemsApi.create(payload);
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
          <input type="number" min="0" max="100" className="input" value={values.gstPercent} onChange={set('gstPercent')} />
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

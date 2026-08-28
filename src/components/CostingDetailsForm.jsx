import { useState } from 'react';
import { pricings as pricingsApi } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import { ProductSelect } from './pickers.jsx';
import { formatNumber } from '../utils/format.js';

/**
 * What the costing is *of* — not what it costs.
 *
 * A separate form from the sheet, matching the two doors the server keeps. These fields
 * describe the job: the quantity, the model, what the buyer said they wanted to pay. Changing
 * them does not re-run §9, because no price has moved. Prices go through the sheet, where the
 * floor is checked.
 *
 * The quantity is the field this exists for. The automation copies it off the enquiry, which
 * is exactly where it is most often wrong, and until now a costing raised for the wrong
 * quantity could only be abandoned — leaving two sheets for one job and no way to tell which
 * price was live.
 */
export default function CostingDetailsForm({ pricing, onClose, onSaved }) {
  const [values, setValues] = useState({
    product: pricing.product?._id || pricing.product || '',
    modelNumber: pricing.modelNumber ?? '',
    quantity: pricing.quantity ?? '',
    targetPrice: pricing.targetPrice ?? '',
    remarks: pricing.remarks ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });
  const number = (value) => (value === '' || value === null ? undefined : Number(value));

  const settled = ['approved', 'rejected'].includes(pricing.status);
  const quantityMoved = Number(values.quantity) !== Number(pricing.quantity);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await pricingsApi.update({
          id: pricing._id,
          product: values.product || undefined,
          modelNumber: values.modelNumber || undefined,
          quantity: number(values.quantity),
          targetPrice: number(values.targetPrice),
          remarks: values.remarks || undefined,
        })
      );
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Notice tone="info">
        This is what the costing is for. The cost lines and the prices are on the sheet itself,
        so correcting a quantity here cannot re-open an approved price.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model" hint="From the catalogue — its code and material come with it">
          <ProductSelect
            value={values.product}
            onChange={(product) => setValues({ ...values, product })}
            aria-label="Model"
          />
        </Field>
        <Field label="Model number" hint="Only if it is not in the catalogue">
          <input className="input" value={values.modelNumber} onChange={set('modelNumber')} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantity to cost">
          <input
            type="number"
            min="1"
            className="input"
            value={values.quantity}
            onChange={set('quantity')}
          />
        </Field>
        <Field label="Target price" hint="What the buyer wants to pay, if they said">
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={values.targetPrice}
            onChange={set('targetPrice')}
          />
        </Field>
      </div>

      <Field label="Remarks">
        <textarea rows={2} className="input" value={values.remarks} onChange={set('remarks')} />
      </Field>

      {/*
        Said before saving rather than discovered afterwards. The approved price was arrived at
        for a lot size; moving the lot size does not move the price, and whoever changes it
        should know that rather than assume the sheet re-priced itself.
      */}
      {settled && quantityMoved && (
        <Notice tone="warn">
          This price was settled for {formatNumber(pricing.quantity)} pieces. Changing the
          quantity does not re-price it — re-cost the sheet if the new lot changes what it
          should sell for.
        </Notice>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save the details'}
        </button>
      </div>
    </form>
  );
}

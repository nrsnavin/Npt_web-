import { useState } from 'react';
import { pricings as pricingsApi } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import { MouldSelect } from './pickers.jsx';

/**
 * What the costing is *of* — not what it costs.
 *
 * A separate form from the sheet, matching the two doors the server keeps. These fields
 * describe the job: the model, what the buyer said they wanted to pay. Changing them does not
 * re-run §9, because no price has moved. Prices go through the sheet, where the floor is
 * checked.
 *
 * **There is no quantity here, and the sheet does not carry one.** A costing on this sheet has
 * only ever been a per-piece cost — grams of resin per piece at a rate per kilo, plus a hook, a
 * clip and a print each priced per piece — so nothing in the build-up varies with the lot size.
 * The figure that used to sit here came off the enquiry, where nobody knows how many, and then
 * travelled onto quotations looking like something a buyer had agreed to. What the offer is
 * conditional on is the **minimum**, and that lives on the quotation where a buyer reads it.
 *
 * The registers the sheet is costed against — the resin, the hook, the clip, the print — are on
 * the costing sheet rather than here, because each of them is an *input* to the price.
 */
export default function CostingDetailsForm({ pricing, onClose, onSaved }) {
  const [values, setValues] = useState({
    mould: pricing.mould?._id || pricing.mould || '',
    modelNumber: pricing.modelNumber ?? '',
    targetPrice: pricing.targetPrice ?? '',
    remarks: pricing.remarks ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });
  const number = (value) => (value === '' || value === null ? undefined : Number(value));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await pricingsApi.update({
          id: pricing._id, expectedUpdatedAt: pricing.updatedAt,
          mould: values.mould || undefined,
          modelNumber: values.modelNumber || undefined,
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
        This is what the costing is for. The cost lines, the prices and the registers it is
        costed against are on the sheet itself, so correcting a description here cannot re-open
        an approved price. The sheet prices one piece; how many is settled by the purchase
        order.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model" hint="The tool it runs on — its code and resin come with it">
          <MouldSelect
            value={values.mould}
            onChange={(mould) => setValues({ ...values, mould })}
            aria-label="Model"
          />
        </Field>
        <Field label="Model number" hint="What the buyer calls it, or the whole of it if it is traded">
          <input className="input" value={values.modelNumber} onChange={set('modelNumber')} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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

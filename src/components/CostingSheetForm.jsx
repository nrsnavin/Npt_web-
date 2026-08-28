import { useState } from 'react';
import { pricings as pricingsApi } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';

/**
 * The costing sheet, shared by the list and the costing's own page.
 *
 * One copy because it is one form: a second would drift, and the half that drifted would be the
 * one enforcing that the calculated price is never typed.
 */
const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

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
    productionCost: pricing.cost?.productionCost ?? '',
    printingCost: pricing.cost?.printingCost ?? '',
    hookCost: pricing.cost?.hookCost ?? '',
    packingCost: pricing.cost?.packingCost ?? '',
    otherCost: pricing.cost?.otherCost ?? '',
  });
  const [targetMargin, setMargin] = useState(pricing.targetMargin ?? 20);
  const [minimum, setMinimum] = useState(pricing.minimumSellingPrice ?? '');
  const [approved, setApproved] = useState(pricing.approvedSellingPrice ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const number = (value) => (value === '' || value === null ? undefined : Number(value));

  // The same arithmetic the server does, so the sheet adds up as it is typed rather than after
  // it is saved. The server's answer is still the one that is stored.
  const material = (Number(cost.gramWeight) * Number(cost.rawMaterialRate)) / 1000 || 0;
  const total =
    material +
    ['productionCost', 'printingCost', 'hookCost', 'packingCost', 'otherCost'].reduce(
      (sum, key) => sum + (Number(cost[key]) || 0),
      0
    );
  const margin = Number(targetMargin) || 0;
  const calculated = total && margin < 100 ? total / (1 - margin / 100) : total;

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
          targetMargin: number(targetMargin),
          minimumSellingPrice: number(minimum),
          approvedSellingPrice: number(approved),
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
      <div className="grid gap-4 sm:grid-cols-2">
        {line('gramWeight', 'Gram weight', 'Grams in one piece')}
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

      <div className="grid gap-4 sm:grid-cols-2">
        {line('productionCost', 'Production', 'Per piece')}
        {line('printingCost', 'Printing', 'Per piece')}
        {line('hookCost', 'Hook / clip', 'Per piece')}
        {line('packingCost', 'Packing', 'Per piece')}
        {line('otherCost', 'Anything else', 'Per piece')}
        <Field label="Target margin (%)" hint="On the selling price, not added to the cost">
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            className="input"
            value={targetMargin}
            onChange={(event) => setMargin(event.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card px-4 py-3">
          <p className="eyebrow">Total cost</p>
          <p className="stat-value mt-1 text-steel-50">{rupees(total)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="eyebrow">Calculated price</p>
          <p className="stat-value mt-1 text-steel-50">{rupees(calculated)}</p>
          <p className="mt-0.5 text-[0.6875rem] text-steel-500">Cost at {margin}% margin</p>
        </div>
        <div className="card px-4 py-3">
          <p className="eyebrow">Margin on approved</p>
          <p className="stat-value mt-1 text-steel-50">
            {approved && total ? `${(((approved - total) / approved) * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Minimum selling price"
          hint="The floor. Below it, nothing is quoted until management signs it off"
        >
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
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
      {minimum !== '' && approved !== '' && Number(approved) < Number(minimum) && (
        <Notice tone="warn">
          This is below the minimum, so it will go to management for approval and nothing can be
          quoted until they sign it off.
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

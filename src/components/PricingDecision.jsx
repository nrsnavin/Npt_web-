import { useState } from 'react';
import { pricings as pricingsApi } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';

/* Two decimals, because a rate per piece is quoted in paise. The same flavour the costing
   screens use — the figures here have to match the sheet this decision is about. */
const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

/**
 * Signing off a price under the floor, or sending it back [BLUEPRINT §9].
 *
 * Extracted from the costings register because it is wanted in two places now: there, and on
 * management's own home screen, where "what is waiting on my signature" is the first thing the
 * screen answers. One form behind both — a §9 decision is the one action in this application
 * that nobody else can take, and a second copy of it is a second place for the note to stop
 * being mandatory.
 *
 * The three figures at the top are the whole argument for deciding in place rather than opening
 * the sheet: the cost, the floor and what is being asked are what the decision turns on, and
 * they fit in a row. Anything more and the reader is being asked to re-do the costing.
 */
export default function PricingDecision({ pricing, line, onClose, onSaved }) {
  /*
   * One price, not one sheet [§9].
   *
   * A costing prices several models now and each carries its own floor, so a signature is given
   * to a model. Opened without a line — from a queue that names a sheet — it settles the first
   * one waiting, because that is the one that put the sheet on the queue.
   */
  const row =
    line
    || (pricing.lines || []).find((entry) => entry.status === 'approval_pending')
    || pricing.lines?.[0]
    || pricing;

  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const waiting = (pricing.lines || []).filter((entry) => entry.status === 'approval_pending');

  const decide = async (approve) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await pricingsApi.decide({
          id: pricing._id,
          line: row._id === pricing._id ? undefined : row._id,
          approve,
          note: note || undefined,
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
    <div className="space-y-4">
      {/*
        Which model is being signed off, where the sheet holds several. A signature standing for
        prices the signer never saw is the one thing §9 exists to prevent, so the model is named
        and the others are said to be still waiting rather than quietly carried along.
      */}
      {pricing.lines?.length > 1 && (
        <p className="rounded-lg border border-line/[0.06] bg-line/[0.02] px-3.5 py-2.5 text-xs text-steel-300">
          <span className="font-semibold text-steel-100">{row.modelNumber || 'This model'}</span>
          {' '}— one of {pricing.lines.length} on {pricing.number}.
          {waiting.length > 1
            ? ` ${waiting.length - 1} other price on this sheet is also waiting, and needs its own decision.`
            : ' Nothing else on the sheet is affected.'}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card px-4 py-3">
          <p className="eyebrow">Total cost</p>
          <p className="stat-value mt-1 text-steel-50">{rupees(row.totalCost)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="eyebrow">Minimum</p>
          <p className="stat-value mt-1 text-steel-50">{rupees(row.minimumSellingPrice)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="eyebrow">Asking</p>
          <p className="stat-value mt-1 text-warn-400">{rupees(row.approvedSellingPrice)}</p>
          <p className="mt-0.5 text-xs text-steel-500">
            {row.grossMarginPercent}% margin
          </p>
        </div>
      </div>

      <Field label="Note" hint="Required when refusing — it is what the re-costing is built from">
        <textarea rows={2} className="input" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-danger" disabled={busy} onClick={() => decide(false)}>
          Send it back
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => decide(true)}>
          Approve this price
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { orders as ordersApi } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import { formatCurrency, formatNumber } from '../utils/format.js';
import { text } from '../utils/pipeline.js';

/**
 * Booking the order an accepted quotation became [§12].
 *
 * **The only thing this form asks for is the quantity**, and that is the interesting part. A
 * quotation quotes a rate against a minimum and carries no quantity at all [§10] — the buyer is
 * told ₹4.90 a piece with a 5,000 minimum, and the purchase order decides how many, months
 * later. So the PO is the first document in the chain that says how many, and everything else
 * on the line — the mould, the model number, the rate, the costing behind it — comes across
 * untouched rather than being typed a second time.
 *
 * **A model the PO does not cover is simply left unticked.** Eight models quoted and six
 * ordered is the ordinary case, and it is expressed by not ticking two rows rather than by
 * editing a copy of the quotation and hoping the two still agree.
 *
 * The rate is editable because a buyer sometimes writes a different one on the PO, and the
 * honest record is what the order was actually placed at. It starts at what was quoted, so
 * leaving it alone is the same as agreeing with the quote.
 */
export default function OrderFromQuotation({ quotation, onClose, onOrdered }) {
  const [po, setPo] = useState({ number: '', date: '' });
  const [rows, setRows] = useState(() =>
    (quotation.lines || []).map((line) => ({
      _id: line._id,
      label: line.modelNumber || line.mould?.mouldCode || 'Unnamed model',
      detail: line.mould ? `${line.mould.mouldCode} · ${line.mould.name}` : 'Bought in — no tool of ours',
      moq: line.moq,
      /* Every line on, because a PO usually covers everything that was quoted. */
      taken: true,
      quantity: line.moq ? String(line.moq) : '',
      unitPrice: String(line.unitPrice ?? ''),
      colour: '',
      deliveryDate: '',
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const setRow = (id, key) => (event) =>
    setRows(rows.map((row) => (row._id === id ? { ...row, [key]: event.target.value } : row)));

  const toggle = (id) =>
    setRows(rows.map((row) => (row._id === id ? { ...row, taken: !row.taken } : row)));

  const chosen = rows.filter((row) => row.taken);
  const value = chosen.reduce(
    (sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0),
    0
  );
  const incomplete = chosen.some((row) => !Number(row.quantity));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onOrdered(
        await ordersApi.fromQuotation({
          id: quotation._id,
          customerPo: { number: text(po.number), date: text(po.date) },
          lines: chosen.map((row) => ({
            quotationLine: row._id,
            quantity: Number(row.quantity),
            unitPrice: Number(row.unitPrice),
            colour: text(row.colour),
            deliveryDate: text(row.deliveryDate),
          })),
        })
      );
      onClose();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Notice tone="info">
        Everything but the quantity comes off {quotation.number}. A quotation states a rate
        against a minimum, so the purchase order is the first document that says how many.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Their PO number">
          <input
            className="input"
            autoFocus
            placeholder="PO/SCM/2026/4471"
            value={po.number}
            onChange={(event) => setPo({ ...po, number: event.target.value })}
          />
        </Field>
        <Field label="PO dated">
          <input
            type="date"
            className="input"
            value={po.date}
            onChange={(event) => setPo({ ...po, date: event.target.value })}
          />
        </Field>
      </div>

      <div>
        <p className="eyebrow mb-2">What the PO covers</p>

        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row._id}
              className={`rounded-lg border p-3 transition-colors ${
                row.taken ? 'border-line/[0.1]' : 'border-line/[0.05] opacity-55'
              }`}
            >
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 flex-none accent-flame-500"
                  checked={row.taken}
                  onChange={() => toggle(row._id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-steel-100">{row.label}</span>
                  <span className="block text-xs text-steel-500">
                    {row.detail}
                    {row.moq ? ` · minimum ${formatNumber(row.moq)}` : ''}
                  </span>
                </span>
              </label>

              {row.taken && (
                <div className="mt-3 grid gap-3 pl-7 sm:grid-cols-4">
                  <Field label="Quantity">
                    <input
                      type="number"
                      min="1"
                      className="input"
                      value={row.quantity}
                      onChange={setRow(row._id, 'quantity')}
                    />
                  </Field>
                  <Field label="Rate" hint="As quoted">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      value={row.unitPrice}
                      onChange={setRow(row._id, 'unitPrice')}
                    />
                  </Field>
                  <Field label="Colour">
                    <input className="input" value={row.colour} onChange={setRow(row._id, 'colour')} />
                  </Field>
                  <Field label="Wanted by">
                    <input
                      type="date"
                      className="input"
                      value={row.deliveryDate}
                      onChange={setRow(row._id, 'deliveryDate')}
                    />
                  </Field>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex justify-end gap-6 border-t border-line/[0.06] pt-3 text-sm">
          <span className="text-steel-400">
            {chosen.length} of {rows.length} model{rows.length === 1 ? '' : 's'}
          </span>
          <span className="tabular-nums font-semibold text-steel-100">
            {formatCurrency(value)} before tax
          </span>
        </div>
      </div>

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
          {/* A conflict hands back the order that already exists, so it can be opened. */}
          {error.details?.order && (
            <p className="text-xs">
              {error.details.order.number} was raised from this quotation already.
            </p>
          )}
          {Array.isArray(error.details) &&
            error.details.map((detail) => (
              <p key={detail.field} className="text-xs">{detail.field}: {detail.message}</p>
            ))}
        </Notice>
      )}

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || !chosen.length || incomplete}>
          {busy ? 'Booking…' : 'Book the order'}
        </button>
      </div>
    </form>
  );
}

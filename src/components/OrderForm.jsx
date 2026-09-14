import { useState } from 'react';
import { orders as ordersApi } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import {
  ColourInput, CustomerSelect, MaterialSelect, MouldSelect, PartSelect,
} from './pickers.jsx';
import { formatCurrency } from '../utils/format.js';
import { numeric, text } from '../utils/pipeline.js';

/* The order screens round to the rupee: a line value is thousands of pieces, and paise on a
   figure that size is noise. Rates are shown to the paisa where they are entered. */
const rupees = (value) => (value === undefined || value === null ? '—' : formatCurrency(value));

/**
 * Booking a customer's order, or correcting one before it is released.
 *
 * Lifted out of the list so the detail page edits through the same form. Correcting is bounded
 * on purpose and the server holds the bound: once an order is released, its lines are what
 * production is working to and what despatch will claim stock against, so changing them there
 * is not a correction — it is a different order the floor has already started. §13's answer to a
 * released order that is wrong is a clarification, not an edit.
 *
 * The customer is fixed for the same reason it is on an enquiry: an order booked for somebody
 * else is a different order.
 */

const blankLine = () => ({
  mould: '', modelNumber: '',
  materialRef: '', colour: '',
  hookRef: '', clipRef: '', printRef: '',
  quantity: '', unitPrice: '', deliveryDate: '',
});

export default function OrderForm({ order, onClose, onSaved }) {
  const editing = Boolean(order);

  const [customer, setCustomer] = useState(order?.customer?._id ?? order?.customer ?? undefined);
  const [lines, setLines] = useState(
    order?.lines?.length
      ? order.lines.map((line) => ({
          _id: line._id,
          mould: line.mould?._id ?? line.mould ?? '',
          modelNumber: line.modelNumber ?? '',
          materialRef: line.materialRef?._id ?? line.materialRef ?? '',
          colour: line.colour ?? '',
          hookRef: line.hookRef?._id ?? line.hookRef ?? '',
          clipRef: line.clipRef?._id ?? line.clipRef ?? '',
          printRef: line.printRef?._id ?? line.printRef ?? '',
          quantity: line.quantity ?? '',
          unitPrice: line.unitPrice ?? '',
          deliveryDate: line.deliveryDate ? line.deliveryDate.slice(0, 10) : '',
        }))
      : [blankLine()]
  );
  const [terms, setTerms] = useState({
    paymentTerms: order?.paymentTerms ?? '',
    gstPercent: order?.gstPercent ?? 18,
    remarks: order?.remarks ?? '',
  });
  const [po, setPo] = useState({
    number: order?.customerPo?.number ?? '',
    date: order?.customerPo?.date ? order.customerPo.date.slice(0, 10) : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const setLine = (index, key) => (value) =>
    setLines(lines.map((line, at) => (at === index ? { ...line, [key]: value } : line)));

  /* Never below one: the server refuses an order with nothing on it, and it is right to. */
  const removeLine = (index) =>
    setLines(lines.length === 1 ? lines : lines.filter((unused, at) => at !== index));

  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
    0
  );

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
          customerPo: { number: text(po.number), date: text(po.date) },
          gstPercent: numeric(terms.gstPercent),
          paymentTerms: text(terms.paymentTerms),
          remarks: text(terms.remarks),
          lines: lines.map((line) => ({
            mould: line.mould || undefined,
            modelNumber: text(line.modelNumber),
            materialRef: line.materialRef || undefined,
            hookRef: line.hookRef || undefined,
            clipRef: line.clipRef || undefined,
            printRef: line.printRef || undefined,
            /* Left blank, the server fills it from the resin's own colour — see the model. */
            colour: text(line.colour),
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            deliveryDate: text(line.deliveryDate),
            /* Carried so the server can tell a corrected line from a new one. */
            ...(line._id ? { _id: line._id } : {}),
          })),
      };

      onSaved(
        editing
          ? /* No customer: an order booked for somebody else is a different order. */
            await ordersApi.update({ id: order._id, ...payload })
          : await ordersApi.create({ customer, ...payload })
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
        This is the second door. Where a quotation was raised and accepted, book the order from
        the quotation instead &mdash; the models, rates and moulds come across rather than being
        typed again.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer">
          <CustomerSelect value={customer} onChange={setCustomer} aria-label="Customer" />
        </Field>
        <Field label="Their PO number" hint="What the buyer calls this order">
          <input
            className="input"
            placeholder="PO/SCM/2026/4471"
            value={po.number}
            onChange={(event) => setPo({ ...po, number: event.target.value })}
          />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="eyebrow">What was ordered</p>
          <p className="text-xs tabular-nums text-steel-400">{rupees(total)} before tax</p>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="rounded-lg border border-line/[0.06] p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={index === 0 ? 'Model' : ''} hint={index === 0 ? 'The mould, or leave empty for a traded piece' : undefined}>
                  <MouldSelect
                    value={line.mould}
                    onChange={setLine(index, 'mould')}
                    aria-label={`Model on line ${index + 1}`}
                  />
                </Field>
                <Field label={index === 0 ? 'Model number' : ''} hint={index === 0 ? "What the buyer calls it" : undefined}>
                  <input
                    className="input"
                    value={line.modelNumber}
                    onChange={(event) => setLine(index, 'modelNumber')(event.target.value)}
                  />
                </Field>
              </div>

              {/*
                What it is made of, from the registers [§28]. Left empty they are simply not
                specified — a traded hanger has no resin of ours behind it, most models carry no
                clip, and plenty carry no print. The resin fills the colour beside it, so
                choosing "HIPS White" answers both questions at once.
              */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={index === 0 ? 'Material' : ''} hint={index === 0 ? 'From the register — brings its colour' : undefined}>
                  <MaterialSelect
                    value={line.materialRef}
                    onChange={setLine(index, 'materialRef')}
                    aria-label={`Material on line ${index + 1}`}
                  />
                </Field>
                <Field label={index === 0 ? 'Colour' : ''} hint={index === 0 ? "The resin's, unless the buyer named a shade" : undefined}>
                  <ColourInput
                    value={line.colour}
                    onChange={setLine(index, 'colour')}
                    aria-label={`Colour on line ${index + 1}`}
                  />
                </Field>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label={index === 0 ? 'Hook' : ''}>
                  <PartSelect
                    kind="hook"
                    value={line.hookRef}
                    onChange={setLine(index, 'hookRef')}
                    aria-label={`Hook on line ${index + 1}`}
                  />
                </Field>
                <Field label={index === 0 ? 'Clip' : ''}>
                  <PartSelect
                    kind="clip"
                    value={line.clipRef}
                    onChange={setLine(index, 'clipRef')}
                    aria-label={`Clip on line ${index + 1}`}
                  />
                </Field>
                <Field label={index === 0 ? 'Printing' : ''}>
                  <PartSelect
                    kind="print"
                    value={line.printRef}
                    onChange={setLine(index, 'printRef')}
                    aria-label={`Print on line ${index + 1}`}
                  />
                </Field>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label={index === 0 ? 'Quantity' : ''}>
                  <input
                    type="number"
                    min="1"
                    className="input"
                    value={line.quantity}
                    onChange={(event) => setLine(index, 'quantity')(event.target.value)}
                  />
                </Field>
                <Field label={index === 0 ? 'Rate' : ''}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    value={line.unitPrice}
                    onChange={(event) => setLine(index, 'unitPrice')(event.target.value)}
                  />
                </Field>
                <Field label={index === 0 ? 'Wanted by' : ''}>
                  <input
                    type="date"
                    className="input"
                    value={line.deliveryDate}
                    onChange={(event) => setLine(index, 'deliveryDate')(event.target.value)}
                  />
                </Field>
              </div>

              {lines.length > 1 && (
                <button
                  type="button"
                  className="mt-2 text-xs text-steel-500 hover:text-danger-400"
                  onClick={() => removeLine(index)}
                >
                  Remove this line
                </button>
              )}
            </div>
          ))}
        </div>

        <button type="button" className="btn-secondary mt-3" onClick={() => setLines([...lines, blankLine()])}>
          + Another model
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment terms">
          <input
            className="input"
            placeholder="45 days from invoice"
            value={terms.paymentTerms}
            onChange={(event) => setTerms({ ...terms, paymentTerms: event.target.value })}
          />
        </Field>
        <Field label="GST %">
          <input
            type="number"
            className="input"
            value={terms.gstPercent}
            onChange={(event) => setTerms({ ...terms, gstPercent: event.target.value })}
          />
        </Field>
      </div>

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
          {error.details?.map((detail) => (
            <p key={detail.field} className="text-xs">{detail.field}: {detail.message}</p>
          ))}
        </Notice>
      )}

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || (!editing && !customer)}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Book the order'}
        </button>
      </div>
    </form>
  );
}

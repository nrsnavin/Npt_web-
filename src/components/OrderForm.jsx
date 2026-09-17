import { useState } from 'react';
import { Link } from 'react-router-dom';
import { orders as ordersApi } from '../api/endpoints.js';
import { Field, FormError, Notice } from './ui.jsx';
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
  /*
   * Which record in the other system this is, when it has one.
   *
   * Only on a new order: a reference is what the record *is*, not something corrected later, and
   * the server refuses a second order carrying one that is already here.
   *
   * It exists for one case, and that case is common. An order is phoned through and typed here
   * before the Chirix poll fetches it; without somewhere to say "this is their SO-1042", the
   * poll arrives an hour later, finds nothing carrying that reference and books the same order
   * again. Saying so turns the poll into an update instead of a duplicate.
   */
  const [externalRef, setExternalRef] = useState({ source: '', id: '' });

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
          /* Both halves or neither: an id with no system to read it against identifies nothing,
             and the server refuses the pair half-filled. */
          ...(text(externalRef.source) && text(externalRef.id)
            ? { externalRef: { source: externalRef.source.trim(), id: externalRef.id.trim() } }
            : {}),
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

      {/*
        Shown only when raising one. On an edit the reference is already fixed, and the update
        door does not take it — see the note where it is held.
      */}
      {!editing && (
        <details className="rounded-lg border border-line/[0.06] px-3.5 py-3">
          <summary className="cursor-pointer text-sm text-steel-300">
            Is this order already in another system?
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-steel-400">
            Say so and the import will recognise it rather than booking it a second time when it
            next reads the feed. Leave both blank for an order that starts here.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Which system" hint="chirix">
              <input
                className="input"
                placeholder="chirix"
                value={externalRef.source}
                onChange={(event) => setExternalRef({ ...externalRef, source: event.target.value })}
              />
            </Field>
            <Field label="Their number for it" hint="Exactly as it reads there">
              <input
                className="input"
                placeholder="SO-1042"
                value={externalRef.id}
                onChange={(event) => setExternalRef({ ...externalRef, id: event.target.value })}
              />
            </Field>
          </div>
        </details>
      )}

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

      {/*
        The refusal, turned into the action it advises.

        The server hands the clashing order back with the 409 — its number and where it has got
        to — so this is a link rather than a sentence telling somebody to go and find it. It is
        the whole point of recording the outside system's reference: the person meeting this is
        usually typing an order the importer brought in an hour ago.
      */}
      <FormError error={error}>
        {error?.details?.order?.id && (
          <Link
            to={`/orders/${error.details.order.id}`}
            className="mt-2 inline-block font-semibold underline"
          >
            Open {error.details.order.number}
          </Link>
        )}
      </FormError>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/[0.06] pt-4">
        {/*
          Said, rather than left to be worked out from a grey button. The customer is the first
          field on the form and the only one that has to be filled before anything can be
          booked; without this line the button is simply dead, and the usual response to a dead
          button is to press it again.
        */}
        {!editing && !customer && (
          <p className="mr-auto text-xs text-steel-500">Choose the customer first.</p>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || (!editing && !customer)}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Book the order'}
        </button>
      </div>
    </form>
  );
}

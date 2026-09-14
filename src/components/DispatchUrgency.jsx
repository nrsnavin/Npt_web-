import { useState } from 'react';
import { dispatches as dispatchApi } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * What marketing asked for, on the consignment that answers it.
 *
 * Marketing could already mark an order critical and watch the press queue lift it. The last
 * department before the buyer — and the one the buyer actually rings — could see none of it:
 * the board fetched the order's number and nothing else. So a flag raised on Monday reached
 * production and died before the loading bay.
 *
 * These are the three pieces that close that loop on the row itself: the flag, the date the
 * customer was given, and a line back to whoever is waiting.
 */

/**
 * The flag, said as a request from a person.
 *
 * "Critical" alone is a severity, and a severity with nobody's name on it is something a team
 * learns to discount. "Nandhini: buyer is threatening to cancel" is a person asking, which is
 * both harder to ignore and easier to push back on when it is wrong.
 */
export function PriorityFlag({ order }) {
  if (!order?.priority || order.priority === 'normal') return null;

  const critical = order.priority === 'critical';

  return (
    <p
      className={`mt-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
        critical
          ? 'border-danger-500/40 bg-danger-500/[0.06] text-danger-300'
          : 'border-warn-500/40 bg-warn-500/[0.06] text-warn-300'
      }`}
    >
      <span className="font-extrabold uppercase tracking-wide">
        {critical ? 'Critical' : 'High'}
      </span>
      {order.priorityReason ? ` — ${order.priorityReason}` : ''}
      {order.priorityBy?.name && (
        <span className="ml-1 font-normal opacity-80">· {order.priorityBy.name}</span>
      )}
    </p>
  );
}

/**
 * The two dates, and which one is being counted against.
 *
 * Shown as a pair rather than as the winner. "Promised the 14th, we planned the 20th" is the
 * sentence that turns a scheduling detail into a gap somebody has to close, and it cannot be
 * reconstructed from whichever date happens to be earlier.
 */
export function PromisedDate({ row, onChanged, mayPromise }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(row.promise?.date ? row.promise.date.slice(0, 10) : '');
  const [note, setNote] = useState(row.promise?.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async (clearing = false) => {
    setBusy(true);
    setError(null);
    try {
      await dispatchApi.promise({
        id: row._id,
        date: clearing ? null : date,
        ...(clearing ? {} : { note: note || undefined }),
      });
      setOpen(false);
      onChanged();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-2 text-sm">
        {row.promise?.date ? (
          <p className="text-steel-300">
            <span className="font-semibold text-steel-100">
              Customer was promised {formatDate(row.promise.date)}
            </span>
            {row.promise.by ? ` · ${row.promise.by}` : ''}
            {/* The plant's own plan, beside it, so the gap is visible rather than inferred. */}
            {row.expectedDeliveryDate && (
              <span className="text-steel-500"> · we planned {formatDate(row.expectedDeliveryDate)}</span>
            )}
          </p>
        ) : (
          <p className="text-steel-500">
            No promise recorded — counted against the plant&rsquo;s own estimate
          </p>
        )}
        {mayPromise && (
          <button type="button" className="row-action mt-1" onClick={() => setOpen(true)}>
            {row.promise?.date ? 'Change what the customer was told' : 'Record what the customer was told'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-line/[0.08] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Must reach them by" hint="The date you gave the buyer, not the plan">
          <input
            type="date"
            className="input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field label="Why then" hint="What the yard needs to know to judge it">
          <input
            className="input"
            placeholder="Their line stops Thursday"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>

      {error && <div className="mt-2"><Notice tone="danger">{error}</Notice></div>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !date}
          onClick={() => save(false)}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {row.promise?.date && (
          /* Withdrawable, or a renegotiated promise leaves the consignment on the late list for
             ever against a date nobody is holding the plant to. */
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => save(true)}>
            Remove the promise
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Answering the person who is waiting.
 *
 * Only offered when somebody actually is — there is no point in a button whose only outcome is
 * "nobody has asked about this". The server refuses that case too; this stops the refusal being
 * how a person finds out.
 */
export function TellMarketing({ row, onTold }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const waiting = Boolean(
    (row.order?.priority && row.order.priority !== 'normal') || row.promise?.date
  );
  if (!waiting) return null;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await dispatchApi.tellMarketing({ id: row._id, note: note.trim() });
      setSent(true);
      setOpen(false);
      setNote('');
      onTold?.();
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setBusy(false);
    }
  };

  if (sent && !open) {
    return <p className="mt-2 text-sm font-semibold text-accent">Told them.</p>;
  }

  if (!open) {
    return (
      <button type="button" className="row-action mt-2" onClick={() => setOpen(true)}>
        Tell them where it is
      </button>
    );
  }

  return (
    <div className="mt-2">
      <Field label="What shall I tell them?" hint="Goes onto their to-do list, not into an inbox">
        <input
          className="input"
          placeholder="On KPN, LR-88213, leaves tonight"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      {error && <div className="mt-2"><Notice tone="danger">{error}</Notice></div>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !note.trim()}
          onClick={send}
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * The paperwork a consignment is short of, typed in place.
 *
 * The row already names what is missing — "still needs an invoice number and a transporter" —
 * and then sent the reader to another screen to supply it. On the one group whose whole job is
 * chasing documents, that is the job: the list should empty as the answers arrive.
 *
 * Only the fields actually outstanding are offered. A form showing all four with two filled in
 * invites somebody to retype what is already there, and a retyped invoice number is a wrong
 * invoice number eventually.
 */
const PAPERWORK = [
  { label: 'an invoice number', field: 'invoiceNumber', placeholder: 'INV-2026-0091' },
  { label: 'a transporter', field: 'transporter', placeholder: 'KPN Roadways' },
  { label: 'an LR number', field: 'lrNumber', placeholder: 'LR-88213' },
  { label: 'a delivery address', field: 'address', placeholder: '14 Avinashi Road, Tiruppur' },
];

export function FillPaperwork({ row, onFilled }) {
  const missing = PAPERWORK.filter((paper) => (row.outstandingPaperwork || []).includes(paper.label));
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!missing.length) return null;

  const set = (field) => (event) => setValues({ ...values, [field]: event.target.value });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      /* Only what was typed. Sending blanks for the rest would clear fields this form never
         showed, which is how a half-filled quick action destroys the other half. */
      const payload = {};
      if (values.invoiceNumber) payload.invoice = { number: values.invoiceNumber.trim() };
      if (values.transporter) payload.transporter = values.transporter.trim();
      if (values.lrNumber) payload.lrNumber = values.lrNumber.trim();
      if (values.address) payload.destination = { address: values.address.trim() };

      await dispatchApi.update({ id: row._id, ...payload });
      setValues({});
      onFilled();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t border-line/[0.06] pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {missing.map((paper) => (
          <Field key={paper.field} label={paper.label.replace(/^an? /, '')}>
            <input
              className="input"
              placeholder={paper.placeholder}
              value={values[paper.field] || ''}
              onChange={set(paper.field)}
            />
          </Field>
        ))}
      </div>

      {error && <div className="mt-2"><Notice tone="danger">{error}</Notice></div>}

      <button
        type="button"
        className="btn-secondary mt-3"
        disabled={busy || !Object.values(values).some((value) => value?.trim())}
        onClick={save}
      >
        {busy ? 'Saving…' : 'Save what I have'}
      </button>
    </div>
  );
}

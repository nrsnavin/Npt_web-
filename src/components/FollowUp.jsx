import { useState } from 'react';
import { payments as paymentsApi } from '../api/endpoints.js';
import { Field, Modal, Notice } from './ui.jsx';
import { formatCurrency } from '../utils/format.js';

/**
 * One conversation about money owed [BLUEPRINT §20].
 *
 * **Three fields, and only one of them is required.** A chaser who has just put the phone down
 * will type one sentence and move on; a form that asked eight questions would collect nothing,
 * and a chase that never reaches the record is the exact failure this module exists to fix.
 *
 * **The promise is the field that matters.** It is what makes this a chase rather than a log of
 * overdue invoices: a buyer who says "Friday" has made a commitment somebody can hold them to,
 * and without recording it the next caller starts from nothing, asks the same question and gets
 * the same answer. The form says so under the field rather than leaving it to be discovered —
 * and the server puts a task on the promised day for whoever logged it, so the promise is
 * chased rather than merely written down.
 *
 * **Who was spoken to** is the other thing worth typing, and it is the cheapest. A name turns
 * the next call from "may I speak to somebody in accounts" into "may I speak to Mr Ravi".
 *
 * Either department writes here. Accounts owns the record, but the buyer takes their marketing
 * person's call — and a chase only one of them could write is a chase where the other rings
 * anyway and nobody knows it happened.
 */
export default function FollowUpForm({ receivable, onClose, onSaved }) {
  const [values, setValues] = useState({
    note: '', spokeTo: '', promisedDate: '', promisedAmount: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await paymentsApi.followUp({
        id: receivable._id,
        note: values.note.trim(),
        spokeTo: values.spokeTo.trim() || undefined,
        promisedDate: values.promisedDate || undefined,
        /* Only sent alongside a date. An amount promised for no day is not a promise. */
        promisedAmount:
          values.promisedDate && values.promisedAmount
            ? Number(values.promisedAmount)
            : undefined,
      });
      /* The promise is the part worth confirming: it is what the next caller opens with, and
         what puts a reminder on the day it falls due. */
      onSaved(saved);
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(receivable)}
      title="What did they say?"
      description={
        receivable
          ? `${receivable.customer?.name || ''} · ${formatCurrency(receivable.balance)} outstanding`
          : undefined
      }
      onClose={onClose}
    >
      {receivable && (
        <form onSubmit={submit} className="space-y-4">
          <Field label="What they said" hint="A sentence. The next person to ring will read this first">
            <textarea
              rows={3}
              className="input"
              autoFocus
              placeholder="Says the invoice is in their approval queue and will move this week."
              value={values.note}
              onChange={set('note')}
            />
          </Field>

          <Field label="Who did you speak to?" hint="A name makes the next call easier">
            <input
              className="input"
              placeholder="Mr Ravi, accounts"
              value={values.spokeTo}
              onChange={set('spokeTo')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Did they promise a day?"
              hint="You get a reminder on the day, and a broken one leads the chase list"
            >
              <input
                type="date"
                className="input"
                value={values.promisedDate}
                onChange={set('promisedDate')}
              />
            </Field>
            {/* Only meaningful beside a date, so it appears with one. A promised amount with no
                day is not a commitment anybody can hold them to. */}
            {values.promisedDate && (
              <Field label="How much?" hint="Leave it blank if they said the whole amount">
                <input
                  type="number"
                  min="0"
                  className="input"
                  placeholder={receivable.balance}
                  value={values.promisedAmount}
                  onChange={set('promisedAmount')}
                />
              </Field>
            )}
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
            <button type="submit" className="btn-primary" disabled={busy || values.note.trim().length < 3}>
              {busy ? 'Saving…' : 'Log it'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

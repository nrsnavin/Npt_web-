import { useState } from 'react';
import { orderQueries as queriesApi } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Field, Modal, Notice } from './ui.jsx';
import { humanise } from '../utils/format.js';

/**
 * Handing an urgent order's blocker to whoever can clear it [§29].
 *
 * A concern is an order query, and deliberately so — the clock, the escalation, the answer
 * thread and the department queue all already exist, and a second parallel concept would be a
 * second inbox nobody watches. What is different is the *act*, and this dialog is shaped by it
 * rather than by the general "ask about this order" form:
 *
 * **The department is already chosen.** The despatch screen worked out what is holding the
 * order — a lot on a quality hold, material that has not landed — and asking the person raising
 * it to pick a department again would be asking them to re-derive what the screen just told
 * them. It stays changeable, because the screen's guess is a guess.
 *
 * **Urgent is the default.** Every order this is raised from is one marketing escalated. A form
 * defaulting to "within a day" on an order the buyer is chasing would collect the wrong clock
 * on nearly every use.
 *
 * **The blocker is quoted into the box.** Not prefilled as the question — that would collect a
 * hundred identical concerns — but shown above it, so what despatch types is the part the
 * screen could not work out for itself.
 */
export default function RaiseConcern({ order, onClose, onRaised }) {
  const { toast } = useToast();
  const [askedOf, setAskedOf] = useState(order?.blockedBy || 'production');
  const [question, setQuestion] = useState('');
  const [urgency, setUrgency] = useState('urgent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onRaised(
        await queriesApi.raise({
          orderId: order._id,
          askedOf,
          question: question.trim(),
          urgency,
        })
      );
      /* Names both recipients, because the second one is the part nobody expects: the order's
         owner is told as well as the department being asked. */
      toast(
        `Raised with ${humanise(askedOf).toLowerCase()}`,
        `${order.owner || 'The order\u2019s owner'} is told too`
      );
    } catch (raiseError) {
      setError(raiseError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(order)}
      title="Raise a concern"
      description={order ? `${order.number} · ${order.customer?.name || ''}` : undefined}
      onClose={onClose}
    >
      {order && (
        <form onSubmit={submit} className="space-y-4">
          {/*
            What the screen already knows, so the person typing adds to it rather than repeating
            it — and so the department they are about to ask can see why they were asked.
          */}
          <Notice tone={order.blockedBy ? 'warn' : 'info'}>
            <p className="font-bold">{order.blockerLabel}</p>
            {order.why?.map((line) => (
              <p key={line} className="text-sm">{line}</p>
            ))}
            {order.priorityReason && (
              <p className="mt-1 text-xs">
                Marketing marked this {order.priority}: {order.priorityReason}
              </p>
            )}
          </Notice>

          <Field
            label="Who can clear it?"
            hint="Chosen from what is holding the order — change it if the screen has it wrong"
          >
            <select className="input" value={askedOf} onChange={(event) => setAskedOf(event.target.value)}>
              {['production', 'quality', 'order_confirmation', 'marketing', 'accounts'].map((key) => (
                <option key={key} value={key}>{humanise(key)}</option>
              ))}
            </select>
          </Field>

          <Field label="What do you need from them?" hint="The owner of this order is told as well as the department">
            <textarea
              rows={3}
              className="input"
              autoFocus
              placeholder="Buyer is collecting on Monday. Can the first 20,000 be off the press by Friday?"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </Field>

          <Field label="How soon" hint="Urgent means it is chased in four hours rather than a day">
            <select className="input" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
              <option value="urgent">Urgent — the buyer is waiting</option>
              <option value="normal">Normal — within a day</option>
            </select>
          </Field>

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
            <button type="submit" className="btn-primary" disabled={busy || question.trim().length < 3}>
              {busy ? 'Raising…' : 'Raise it'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

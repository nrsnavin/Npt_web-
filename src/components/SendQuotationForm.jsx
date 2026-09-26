import { useEffect, useState } from 'react';
import { quotations as quotationsApi } from '../api/endpoints.js';
import { Field, Notice, Spinner } from './ui.jsx';
import { formatDate } from '../utils/format.js';
import { sendLabel, sendProblem } from '../utils/quoteSend.js';

/**
 * Sending a quotation to the buyer: the email and the WhatsApp message, pre-filled from the quote
 * and the customer's record, every part of it — the address, the number, the subject, the words —
 * for the sender to change before anything leaves. What they see here is what is sent.
 *
 * The email carries the PDF as an attachment; the WhatsApp message carries a link that opens it.
 * A quote handed over in person can still just be marked sent, without a message.
 */
function Channel({ title, on, onToggle, disabled, warning, children }) {
  return (
    <section className={`rounded-xl border p-4 transition-colors ${on ? 'border-flame-500/30 bg-flame-500/[0.03]' : 'border-line/[0.08]'}`}>
      <label className="flex items-center gap-2.5">
        <input type="checkbox" className="h-4 w-4 accent-flame-500" checked={on} disabled={disabled} onChange={(event) => onToggle(event.target.checked)} />
        <span className="text-sm font-bold text-steel-50">{title}</span>
      </label>
      {warning && <p className="mt-2 text-xs text-warn-400">{warning}</p>}
      {on && <div className="mt-3 space-y-3">{children}</div>}
    </section>
  );
}

export default function SendQuotationForm({ quotation, onCancel, onSent, onRefused }) {
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [email, setEmail] = useState({ send: false, to: '', subject: '', body: '' });
  const [whatsapp, setWhatsapp] = useState({ send: false, to: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    let live = true;
    setPreview(null);
    setLoadError(null);
    quotationsApi
      .sendPreview(quotation._id)
      .then((data) => {
        if (!live) return;
        setPreview(data);
        /* Ticked where there is somewhere to send it and the buyer has not said no. */
        setEmail({ send: Boolean(data.email.to) && !data.email.optedOut, to: data.email.to || '', subject: data.email.subject, body: data.email.body });
        setWhatsapp({ send: Boolean(data.whatsapp.to) && !data.whatsapp.optedOut, to: data.whatsapp.to || '', body: data.whatsapp.body });
      })
      .catch((failure) => live && setLoadError(failure));
    return () => {
      live = false;
    };
  }, [quotation._id]);

  const why = sendProblem({ email, whatsapp });

  const send = async (channels) => {
    setBusy(true);
    setProblem(null);
    try {
      onSent(await quotationsApi.deliver({ id: quotation._id, ...channels }));
    } catch (failure) {
      setProblem(failure.message);
      /* A price refused by the approval rule moves the quote into the approval queue, so the
         caller's list is stale either way. */
      onRefused?.();
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <Notice>{loadError.message}</Notice>;
  if (!preview) return <Spinner label="Preparing the message" />;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!why) send({ email, whatsapp });
      }}
    >
      <p className="text-sm text-steel-400">
        To <span className="font-semibold text-steel-100">{preview.customer?.name}</span>. Everything below is filled in from the
        quote and their record — change anything before it goes.
      </p>

      <Channel
        title="Email"
        on={email.send}
        disabled={preview.email.optedOut}
        onToggle={(send) => setEmail({ ...email, send })}
        warning={
          preview.email.optedOut
            ? 'This customer has asked not to be emailed.'
            : !preview.email.configured
              ? 'Email is not set up on the server yet, so it will not reach the buyer.'
              : null
        }
      >
        <Field label="To" required>
          <input required className="input" type="email" value={email.to} disabled={busy} onChange={(event) => setEmail({ ...email, to: event.target.value })} />
        </Field>
        <Field label="Subject" required>
          <input required className="input" value={email.subject} disabled={busy} onChange={(event) => setEmail({ ...email, subject: event.target.value })} />
        </Field>
        <Field label="Message" required>
          <textarea required className="input font-sans" rows={10} value={email.body} disabled={busy} onChange={(event) => setEmail({ ...email, body: event.target.value })} />
        </Field>
        <p className="flex items-center gap-2 text-xs text-steel-400">
          <span aria-hidden>📎</span> {preview.attachment} is attached
        </p>
      </Channel>

      <Channel
        title="WhatsApp"
        on={whatsapp.send}
        disabled={preview.whatsapp.optedOut}
        onToggle={(send) => setWhatsapp({ ...whatsapp, send })}
        warning={
          preview.whatsapp.optedOut
            ? 'This customer has asked not to be messaged on WhatsApp.'
            : !preview.whatsapp.configured
              ? 'WhatsApp is not set up on the server yet, so it will not reach the buyer.'
              : !preview.whatsapp.template
                ? 'WhatsApp delivers this only if the buyer has messaged you in the last 24 hours.'
                : null
        }
      >
        <Field label="WhatsApp number" required>
          <input required className="input" inputMode="tel" value={whatsapp.to} disabled={busy} onChange={(event) => setWhatsapp({ ...whatsapp, to: event.target.value })} />
        </Field>
        <Field label="Message" required>
          <textarea required className="input font-sans" rows={7} value={whatsapp.body} disabled={busy} onChange={(event) => setWhatsapp({ ...whatsapp, body: event.target.value })} />
        </Field>
        <p className="flex items-center gap-2 text-xs text-steel-400">
          <span aria-hidden>📎</span> {preview.attachment} goes with it
        </p>
      </Channel>

      {preview.sent?.length > 0 && (
        <div className="rounded-lg bg-line/[0.03] px-3 py-2 text-xs text-steel-400">
          <p className="font-semibold text-steel-300">Sent before</p>
          <ul className="mt-1 space-y-0.5">
            {preview.sent.map((row) => (
              <li key={row._id}>
                {row.channel === 'email' ? 'Email' : 'WhatsApp'} to {row.recipient} — {row.status}
                {row.sentBy?.name ? ` by ${row.sentBy.name}` : ''}, {formatDate(row.sentAt)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(problem || why) && <Notice tone={problem ? 'danger' : 'info'}>{problem || why}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => send({})} title="For a quote handed over in person — nothing is sent">
          Mark sent without a message
        </button>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>Back</button>
          <button type="submit" className="btn-primary" disabled={busy || Boolean(why)}>
            {busy ? 'Sending…' : sendLabel({ email, whatsapp })}
          </button>
        </div>
      </div>
    </form>
  );
}

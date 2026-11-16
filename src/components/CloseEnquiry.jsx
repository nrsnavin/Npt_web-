import { useEffect, useState } from 'react';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { Field, Modal, Spinner } from './ui.jsx';
import { LOST_REASONS } from '../utils/pipeline.js';
import { todayInIndia } from '../utils/taskForm.js';
import { formatDate } from '../utils/format.js';

/**
 * Admin closes an enquiry and records how it ended [server: services/enquiryClosure.service.js,
 * config/enquiryClosure.js] — for the enquiry finished in the plant while nobody kept its statuses
 * up: Order completed, Dispatched, Order in production, Cancelled after quotation, Enquiry
 * cancelled. The dialog says what closes with it, asks the outcome, when it happened, a reference
 * (invoice, LR, order number) or the reason it was cancelled, and a note. An enquiry already
 * closed takes its outcome the same way.
 *
 *   CloseEnquiry    the button and the dialog
 *   ClosureLine     "Dispatched on 10 Nov 2026 · INV-204 — note", wherever the enquiry is shown
 */

/** How it ended, in one line — or null when no outcome was recorded. */
export const closureWords = (closure) => (closure?.outcome
  ? [`${closure.label || closure.outcome}${closure.date ? ` on ${formatDate(closure.date)}` : ''}`, closure.reference, closure.note].filter(Boolean).join(' · ')
  : null);

export function ClosureLine({ enquiry, className = '' }) {
  const words = closureWords(enquiry?.closure);
  if (!words) return null;
  const by = enquiry.closure.by?.name;
  return (
    <p className={`text-sm text-steel-200 ${className}`} aria-label="How the enquiry ended">
      <span className="font-bold text-steel-50">Closed — {words}</span>
      <span className="text-steel-400">{by ? ` · recorded by ${by}` : ''}{enquiry.closure.at ? `, ${formatDate(enquiry.closure.at)}` : ''}</span>
    </p>
  );
}

export default function CloseEnquiry({ enquiry, onClosed, className = 'btn-secondary' }) {
  const [open, setOpen] = useState(false);
  const closed = enquiry.stage === 'closed';
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {closed ? (enquiry.closure?.outcome ? 'Change how it ended' : 'Record how it ended') : 'Close enquiry'}
      </button>
      {open && <CloseEnquiryDialog enquiry={enquiry} onClose={() => setOpen(false)} onClosed={onClosed} />}
    </>
  );
}

function CloseEnquiryDialog({ enquiry, onClose, onClosed }) {
  const closed = enquiry.stage === 'closed';
  const [plan, setPlan] = useState(closed ? {} : null);
  const [outcomes, setOutcomes] = useState(null);
  const [outcome, setOutcome] = useState(enquiry.closure?.outcome || '');
  const [date, setDate] = useState(enquiry.closure?.date || '');
  const [reference, setReference] = useState(enquiry.closure?.reference || '');
  const [lostReason, setLostReason] = useState(enquiry.lostReason || '');
  const [note, setNote] = useState(enquiry.closure?.note || '');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    enquiriesApi.closeOutcomes().then((data) => live && setOutcomes(data?.outcomes || [])).catch((failure) => live && setProblem(failure.message));
    if (!closed) enquiriesApi.closing(enquiry._id).then((data) => live && setPlan(data || {})).catch((failure) => live && setProblem(failure.message));
    return () => { live = false; };
  }, []);
  const rule = (outcomes || []).find((entry) => entry.key === outcome) || null;
  const asks = (key) => Boolean(rule?.asks?.includes(key));
  const noteNeeded = Boolean(rule?.noteRequired) && note.trim().length < 5;
  const ready = plan && rule && !noteNeeded && !busy;
  const go = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const done = await enquiriesApi.closeOut({
        id: enquiry._id, outcome,
        date: asks('date') && date ? date : undefined,
        reference: asks('reference') && reference.trim() ? reference.trim() : undefined,
        lostReason: asks('lostReason') && lostReason ? lostReason : undefined,
        note: note.trim() || undefined,
      });
      onClose();
      onClosed?.(done);
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  const what = `enquiry ${enquiry.number}`;
  return (
    <Modal open title={closed ? `How ${what} ended` : `Close ${what}`} description="Record what actually happened, so the enquiry reads right even though its statuses were not kept up" onClose={onClose} size="md">
      <div className="space-y-3" aria-label={closed ? `How ${what} ended` : `Close ${what}`}>
        {(!plan || !outcomes) && !problem && <Spinner label="Checking what closes with it" />}
        {plan?.tasks && (
          <div className="rounded-xl border border-line/[0.1] p-3 text-sm">
            {plan.tasks.length
              ? (
                <>
                  <p className="font-semibold text-steel-100">{plan.tasks.length === 1 ? 'This open task closes with it:' : `These ${plan.tasks.length} open tasks close with it:`}</p>
                  <ul className="mt-1 list-disc pl-5 text-xs text-steel-300">{plan.tasks.map((row) => <li key={row._id}>{row.title}</li>)}</ul>
                </>
              )
              : <p className="text-steel-300">No open tasks on it.</p>}
            {plan.keptOpen?.length > 0 && <p className="mt-2 text-xs text-warn-400">Kept open until the money is in: {plan.keptOpen.map((row) => row.title).join(', ')}</p>}
            {plan.samples > 0 && <p className="mt-2 text-xs text-steel-400">{plan.samples === 1 ? 'Its sample on the bench is stopped.' : `Its ${plan.samples} samples on the bench are stopped.`}</p>}
          </div>
        )}
        {outcomes && (
          <fieldset className="space-y-1.5" aria-label="How did it end?">
            <legend className="text-sm font-semibold text-steel-100">How did it end?</legend>
            {outcomes.map((entry) => (
              <label key={entry.key} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${outcome === entry.key ? 'border-accent/50 bg-accent/[0.06]' : 'border-line/[0.1]'}`}>
                <input type="radio" name="close-outcome" className="mt-0.5" checked={outcome === entry.key} onChange={() => setOutcome(entry.key)} />
                <span>
                  <span className="font-semibold text-steel-50">{entry.label}</span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${entry.status === 'won' ? 'bg-success-500/15 text-success-400' : entry.status === 'lost' ? 'bg-danger-500/15 text-danger-400' : 'bg-line/[0.08] text-steel-400'}`}>
                    {entry.status === 'won' ? 'Order taken' : entry.status === 'lost' ? 'No order' : 'As it is'}
                  </span>
                  <span className="block text-xs text-steel-400">{entry.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {rule && (
          <div className="grid gap-3 sm:grid-cols-2">
            {asks('date') && (
              <Field label={rule.dateLabel || 'When'} hint="Leave empty if not known">
                <input type="date" className="input" max={todayInIndia()} value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
            )}
            {asks('reference') && (
              <Field label="Invoice / LR / order number" hint="Optional">
                <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="INV-204 / LR 88123" maxLength={120} />
              </Field>
            )}
            {asks('lostReason') && (
              <Field label="Why was it cancelled?">
                <select className="input" value={lostReason} onChange={(event) => setLostReason(event.target.value)}>
                  <option value="">Not known</option>
                  {LOST_REASONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="Note" required={Boolean(rule.noteRequired)} className="sm:col-span-2">
              <textarea className="input" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth keeping — who confirmed it, what was sent, why it was dropped" maxLength={1000} />
            </Field>
          </div>
        )}
        <p className="text-xs text-steel-500">
          {closed ? 'The enquiry stays closed; its outcome is updated.' : 'Closing keeps the record — it reads closed, with what you record here. Nothing is deleted.'}
        </p>
        {noteNeeded && <p className="text-xs text-warn-400">Say what happened in the note.</p>}
        {problem && <p className="text-sm text-danger-400" role="alert">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!ready} onClick={go}>{busy ? 'Saving…' : closed ? 'Save outcome' : `Close ${what}`}</button>
        </div>
      </div>
    </Modal>
  );
}

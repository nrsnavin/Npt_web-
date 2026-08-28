import { useCallback, useState } from 'react';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { Field, Modal, Notice } from './ui.jsx';
import { LOST_REASONS } from '../utils/pipeline.js';

/**
 * What you can do to an enquiry, as things you do.
 *
 * The screen used to offer a dropdown of twelve stages and a free-text box. Both are the wrong
 * question. "Move to sample_required" is a database word; what a marketing person does is
 * *raise a sample request* — and the automation for that already existed, it simply had no
 * door anybody would find. This is that door.
 *
 * **Each action asks for exactly what it needs and nothing else.** The server publishes what
 * that is, so the form is built from the answer rather than showing every field on every move
 * and letting the save fail afterwards. Winning asks for the figure; losing asks why; parking
 * asks what it is waiting on; raising a sample asks for nothing at all, because there is
 * nothing to ask.
 *
 * **The next action is written, not typed.** It arrives prefilled from the action and stays
 * editable, which is the point of the whole exercise: "chase sample", "follow up sampling" and
 * "ask bench" were one intention in three spellings, and no follow-up list could group them.
 */

/** The handful that close or park the enquiry read differently from the ones that advance it. */
const TONE = {
  confirm_order: 'border-success-500/40 hover:!border-success-500/70',
  mark_lost: 'border-danger-500/30 hover:!border-danger-500/60',
  hold: 'border-warn-500/30 hover:!border-warn-500/60',
};

function ActionForm({ enquiry, action, onClose, onSaved }) {
  const [nextAction, setNextAction] = useState(action.nextAction || '');
  const [nextFollowUpDate, setFollowUp] = useState(action.defaultFollowUpDate || '');
  const [value, setValue] = useState(enquiry.estimatedValue ?? '');
  const [lostReason, setLostReason] = useState('price');
  const [lostNote, setLostNote] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const needs = (what) => action.needs?.includes(what);
  // Winning and losing end the enquiry, so there is nothing left to chase.
  const closes = action.nextAction === null;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await enquiriesApi.act({
        id: enquiry._id,
        action: action.action,
        note: note || undefined,
        nextAction: closes ? undefined : nextAction || undefined,
        nextFollowUpDate: closes ? undefined : nextFollowUpDate || undefined,
        estimatedValue: needs('value') && value !== '' ? Number(value) : undefined,
        lostReason: needs('lostReason') ? lostReason : undefined,
        lostNote: needs('lostReason') ? lostNote || undefined : undefined,
        holdReason: needs('holdReason') ? holdReason || undefined : undefined,
      });
      onSaved(saved);
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm leading-relaxed text-steel-300">{action.hint}.</p>
      {action.raises && (
        <Notice tone="info">
          This hands the work to {action.raises} — the task appears on their list straight away.
        </Notice>
      )}

      {needs('value') && (
        <Field label="Confirmed value (₹)" hint="Required — this is the figure the month is counted in">
          <input
            type="number"
            className="input"
            required
            min="0"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
      )}

      {needs('lostReason') && (
        <>
          <Field label="Why was it lost">
            <select className="input" value={lostReason} onChange={(event) => setLostReason(event.target.value)}>
              {LOST_REASONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Anything worth remembering" hint="Optional, but it is what the next quote is priced against">
            <input className="input" value={lostNote} onChange={(event) => setLostNote(event.target.value)} />
          </Field>
        </>
      )}

      {needs('holdReason') && (
        <Field label="What is it waiting on" hint="Required — this is what somebody will look for later">
          <input
            className="input"
            required
            autoFocus
            placeholder="Buyer waiting on their own customer’s approval"
            value={holdReason}
            onChange={(event) => setHoldReason(event.target.value)}
          />
        </Field>
      )}

      {/*
        * Prefilled from the action, and editable. The default is what makes the field
        * groupable across a hundred enquiries; the edit is what keeps it honest on the one
        * where the usual words are wrong.
        */}
      {!closes && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Then" hint="Written from the action — change it if your case is unusual">
            <input
              className="input"
              required
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
            />
          </Field>
          <Field label="Come back to it on">
            <input
              type="date"
              className="input"
              required
              min={new Date().toISOString().slice(0, 10)}
              value={nextFollowUpDate}
              onChange={(event) => setFollowUp(event.target.value)}
            />
          </Field>
        </div>
      )}

      <Field label="Note" hint="Recorded against this in the history">
        <textarea rows={2} className="input" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          type="submit"
          className={action.action === 'mark_lost' ? 'btn-danger' : 'btn-primary'}
          disabled={busy}
        >
          {busy ? 'Saving…' : action.label}
        </button>
      </div>
    </form>
  );
}

export default function EnquiryActions({ enquiry, onSaved, canWrite }) {
  const fetchActions = useCallback(() => enquiriesApi.actions(enquiry._id), [enquiry._id]);
  const { data, error } = useRecord(fetchActions, `enquiry-actions-${enquiry._id}-${enquiry.status}`);
  const [chosen, setChosen] = useState(null);

  const actions = data || [];
  // A closed enquiry offers none — it reopens through its own door, above.
  if (error || !actions.length || !canWrite) return null;

  return (
    <>
      <div className="card p-5">
        <p className="eyebrow">What happens next</p>
        <p className="mt-1 text-xs leading-relaxed text-steel-500">
          Pick what you are actually doing. The stage and the follow-up come with it, and the
          department that picks up the work is told.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((action) => (
            <button
              key={action.action}
              type="button"
              onClick={() => setChosen(action)}
              className={`card-interactive px-3.5 py-3 text-left transition-transform duration-150 hover:-translate-y-0.5 ${
                TONE[action.action] || ''
              }`}
            >
              <p className="text-[0.8125rem] font-semibold text-steel-100">{action.label}</p>
              <p className="mt-0.5 text-[0.6875rem] leading-snug text-steel-500">{action.hint}</p>
              {action.raises && (
                <p className="mt-1.5 text-[0.625rem] font-bold uppercase tracking-[0.06em] text-aqua-400">
                  → {action.raises}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      <Modal
        open={Boolean(chosen)}
        title={chosen?.label || ''}
        description={chosen?.raises ? `Hands the work to ${chosen.raises}` : 'Recorded against this enquiry'}
        onClose={() => setChosen(null)}
      >
        {chosen && (
          <ActionForm
            enquiry={enquiry}
            action={chosen}
            onClose={() => setChosen(null)}
            onSaved={onSaved}
          />
        )}
      </Modal>
    </>
  );
}

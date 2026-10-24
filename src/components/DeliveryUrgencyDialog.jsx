import { useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { Field, Modal, Notice } from './ui.jsx';
import { DELIVERY_URGENCIES } from '../utils/deliveryUrgency.js';

/**
 * Marketing or Admin says how soon the buyer needs a Dispatch request's goods [server:
 * deliveryUrgency.service `setDeliveryUrgency`]. A change says why; Dispatch hears it either way.
 * `current` is the request's urgency key, if one was given. `isDefault`: it is the app's default
 * (Today, the day it reached Dispatch) — confirmed as it stands, or changed, with no reason asked.
 */
export default function DeliveryUrgencyDialog({ taskId, current, isDefault = false, about, onClose, onSaved }) {
  const [urgency, setUrgency] = useState(current || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const changing = Boolean(current) && !isDefault;
  const ready = urgency && (!changing || (urgency !== current && note.trim().length >= 3));
  const confirming = isDefault && urgency === current;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const saved = await workspace.todos.setDelivery({ id: taskId, urgency, ...(note.trim() ? { note: note.trim() } : {}) });
      onSaved?.(saved);
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={changing ? 'Change delivery urgency' : isDefault ? 'Confirm delivery urgency' : 'Set delivery urgency'} description={about} onClose={onClose}>
      {isDefault && <p className="mb-3 text-sm text-steel-300">It reads <span className="font-semibold text-steel-100">Today</span> — the day it reached Dispatch — until you confirm it or pick another.</p>}
      <form onSubmit={submit} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold text-steel-200">How soon does the buyer need it?</legend>
          {DELIVERY_URGENCIES.map((entry) => (
            <label key={entry.key} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${urgency === entry.key ? 'border-accent bg-accent/10' : 'border-line/[0.08]'}`}>
              <input type="radio" name="urgency" value={entry.key} checked={urgency === entry.key} onChange={() => setUrgency(entry.key)} className="mt-1" />
              <span>
                <span className="block text-sm font-semibold text-steel-50">{entry.label}</span>
                <span className="block text-xs text-steel-400">{entry.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Field label={changing ? 'Why it is changing' : 'Note for Dispatch (optional)'} required={changing}>
          <textarea rows={2} className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Truck booked for 5 PM, buyer's store opens Monday …" />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !ready}>{busy ? 'Saving…' : changing ? 'Change urgency' : confirming ? 'Confirm Today' : 'Set urgency'}</button>
        </div>
      </form>
    </Modal>
  );
}

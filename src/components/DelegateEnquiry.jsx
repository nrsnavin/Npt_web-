import { useEffect, useState } from 'react';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { Field, FormError, Modal } from './ui.jsx';

/**
 * Handing the enquiry to another marketing person, at any stage [server:
 * services/delegation.service.js]. Offered to the owner and Admin only — the server says which —
 * and its open tasks, samples, quotes and orders go with it.
 */
export default function DelegateEnquiry({ enquiry, onDone }) {
  const [targets, setTargets] = useState([]);
  const [may, setMay] = useState(false);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    enquiriesApi.delegateTargets(enquiry._id)
      .then((reply) => {
        if (!live) return;
        setMay(Boolean(reply.mayDelegate));
        setTargets(reply.data || []);
      })
      .catch(() => live && setMay(false));
    return () => {
      live = false;
    };
  }, [enquiry._id, enquiry.assignedTo?._id]);

  if (!may || !targets.length) return null;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await enquiriesApi.delegate({ id: enquiry._id, to, note: note.trim() || undefined });
      setOpen(false);
      onDone?.();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        Hand to a colleague
      </button>
      <Modal
        open={open}
        title="Hand this enquiry to a colleague"
        description="It becomes theirs at whatever stage it is in, with its open tasks, samples, quotes and orders"
        onClose={() => setOpen(false)}
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Who takes it" required>
            <select className="input" value={to} onChange={(event) => setTo(event.target.value)} autoFocus>
              <option value="">Choose a marketing colleague…</option>
              {targets.map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}
            </select>
          </Field>
          <Field label="Why" hint="They read this first — what the buyer is waiting for, what was promised">
            <textarea
              rows={3}
              className="input"
              placeholder="On leave till Monday; buyer is waiting for the revised price."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <FormError error={error} />
          <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy || !to}>
              {busy ? 'Handing over…' : 'Hand it over'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

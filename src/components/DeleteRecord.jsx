import { useEffect, useRef, useState } from 'react';
import { Modal, Spinner } from './ui.jsx';

/**
 * Admin deleting an enquiry, a task or a team job [server: deletion.service] — the button, and a
 * confirmation that first reads what would go and what stops it: an enquiry takes every task,
 * sample and quotation on it; a team job's first task takes its whole job. What records something
 * that happened (an order, money, goods sent) refuses it, saying what to do instead. The person
 * types the record's number (or DELETE) before the button works.
 */

const TAKES = [['tasks', 'task'], ['samples', 'sample'], ['quotations', 'quotation'], ['workOrders', 'work order'], ['files', 'file']];
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function DeleteRecord({ label = 'Delete', what, confirmWord = 'DELETE', preview, remove, onDeleted, className = 'btn-ghost text-danger-400' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && <DeleteDialog what={what} confirmWord={confirmWord} preview={preview} remove={remove} onClose={() => setOpen(false)} onDeleted={onDeleted} />}
    </>
  );
}

function DeleteDialog({ what, confirmWord, preview, remove, onClose, onDeleted }) {
  const [plan, setPlan] = useState(null);
  const [problem, setProblem] = useState(null);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  /* Read once, when the dialog opens — the caller's function is a new one on every render. */
  const asked = useRef(preview);
  useEffect(() => {
    let live = true;
    asked.current().then((data) => live && setPlan(data)).catch((failure) => live && setProblem(failure.message));
    return () => { live = false; };
  }, []);
  const blocked = Boolean(plan?.blockers?.length);
  const ready = plan && !blocked && typed.trim().toUpperCase() === String(confirmWord).toUpperCase() && !busy;
  const go = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const done = await remove(reason.trim() || undefined);
      onClose();
      onDeleted?.(done);
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Delete ${what}`} onClose={onClose} size="md">
      <div className="space-y-3" aria-label={`Delete ${what}`}>
        {!plan && !problem && <Spinner label="Checking what goes with it" />}
        {plan && blocked && (
          <div className="rounded-xl border border-danger-500/50 bg-danger-500/[0.08] p-3" role="alert">
            <p className="text-sm font-bold text-danger-400">It cannot be deleted</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-steel-200">{plan.blockers.map((line) => <li key={line}>{line}</li>)}</ul>
          </div>
        )}
        {plan && !blocked && (
          <>
            <div className="rounded-xl border border-warn-500/50 bg-warn-500/[0.08] p-3">
              <p className="text-sm font-bold text-warn-400">This cannot be undone.</p>
              {plan.takes && (
                <p className="mt-1 text-sm text-steel-200">
                  It deletes {TAKES.filter(([key]) => plan.takes[key] > 0).map(([key, word]) => count(plan.takes[key], word)).join(', ') || 'nothing else'} with it. The buyer stays.
                </p>
              )}
              {plan.tasks && (
                <>
                  <p className="mt-1 text-sm text-steel-200">{plan.tasks.length > 1 ? `The whole job goes — ${count(plan.tasks.length, 'task')}:` : 'This task goes:'}</p>
                  <ul className="mt-1 list-disc pl-5 text-xs text-steel-300">{plan.tasks.map((row) => <li key={row._id}>{row.title}{row.completed ? ' (done)' : ''}</li>)}</ul>
                </>
              )}
            </div>
            <label className="block text-sm text-steel-300">
              Why (kept on the record)
              <input className="input mt-1" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Duplicate, raised by mistake…" maxLength={300} />
            </label>
            <label className="block text-sm text-steel-300">
              Type <span className="font-mono font-bold text-steel-100">{confirmWord}</span> to confirm
              <input className="input mt-1" value={typed} onChange={(event) => setTyped(event.target.value)} aria-label="Type to confirm" autoComplete="off" />
            </label>
          </>
        )}
        {problem && <p className="text-sm text-danger-400" role="alert">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          {!blocked && <button type="button" className="btn-danger" disabled={!ready} onClick={go}>{busy ? 'Deleting…' : `Delete ${what}`}</button>}
        </div>
      </div>
    </Modal>
  );
}

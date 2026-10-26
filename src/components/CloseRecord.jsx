import { useEffect, useRef, useState } from 'react';
import { Modal, Spinner } from './ui.jsx';

/**
 * Admin closing an enquiry, a task or a team job where it stands [server: `task_closed`,
 * handoff.service `closeByAdmin`, teamJobs.service `closeTeamJob`] — the button, and a dialog
 * that says what closes with it (the open tasks, the money cases kept open until paid, the samples
 * stopped) and asks why. Unlike delete, nothing is removed: the record stays, read as closed.
 */
export default function CloseRecord({ label = 'Close', what, preview, close, onClosed, className = 'btn-secondary' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && <CloseDialog what={what} preview={preview} close={close} onClose={() => setOpen(false)} onClosed={onClosed} />}
    </>
  );
}

function CloseDialog({ what, preview, close, onClose, onClosed }) {
  const [plan, setPlan] = useState(preview ? null : {});
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  /* Read once, when the dialog opens — the caller's function is a new one on every render. */
  const asked = useRef(preview);
  useEffect(() => {
    if (!asked.current) return undefined;
    let live = true;
    asked.current().then((data) => live && setPlan(data || {})).catch((failure) => live && setProblem(failure.message));
    return () => { live = false; };
  }, []);
  const ready = plan && reason.trim().length >= 5 && !busy;
  const go = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const done = await close(reason.trim());
      onClose();
      onClosed?.(done);
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Close ${what}`} onClose={onClose} size="md">
      <div className="space-y-3" aria-label={`Close ${what}`}>
        {!plan && !problem && <Spinner label="Checking what closes with it" />}
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
            {plan.keptOpen?.length > 0 && (
              <p className="mt-2 text-xs text-warn-400">Kept open until the money is in: {plan.keptOpen.map((row) => row.title).join(', ')}</p>
            )}
            {plan.samples > 0 && <p className="mt-2 text-xs text-steel-400">{plan.samples === 1 ? 'Its sample on the bench is stopped.' : `Its ${plan.samples} samples on the bench are stopped.`}</p>}
          </div>
        )}
        <label className="block text-sm text-steel-300">
          Why is it being closed?
          <textarea className="input mt-1" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Buyer cancelled, raised by mistake, completed outside the app…" maxLength={500} aria-label="Why it is being closed" />
        </label>
        <p className="text-xs text-steel-500">Closing keeps the record — it reads closed, with your reason. Nothing is deleted.</p>
        {problem && <p className="text-sm text-danger-400" role="alert">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!ready} onClick={go}>{busy ? 'Closing…' : `Close ${what}`}</button>
        </div>
      </div>
    </Modal>
  );
}

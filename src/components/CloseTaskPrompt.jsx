import { useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { Field, Modal, Notice } from './ui.jsx';

/**
 * The offer to close a task that has nothing left to do [server: taskClosable.service, the
 * task's `closable`]: Production once every model is handed on or ready, Quality once its QC
 * record is entered, Dispatch once the goods are marked Dispatched, Reception once the LR copy
 * went to the buyer, Quotation once the quote is sent. A dialog, never a move made by itself —
 * "Keep it open" leaves the task where it stands.
 *
 * Closing is the task's own Task Closed status [TaskWorkflow], with the remark its workflow asks
 * for — the reason the server gave is the remark unless the person writes their own.
 */
export default function CloseTaskPrompt({ task, why, onClose, onClosed }) {
  const [note, setNote] = useState(why || 'Nothing left to do on this task');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  if (!task) return null;

  const close = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const saved = await workspace.todos.status({ id: task._id, status: 'closed', note: note.trim() });
      onClosed?.(saved);
      onClose();
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };

  return (
    <Modal open title="Close this task?" description={task.title} onClose={onClose}>
      <form onSubmit={close} className="space-y-4" aria-label="Close the task">
        <p className="rounded-lg bg-success-500/10 px-3 py-2 text-sm text-success-400 ring-1 ring-success-500/20">
          {why || 'Nothing is left to do on this task.'}
        </p>
        <Field label="Remark" hint="Written on the task with Task Closed; whoever raised it is told">
          <textarea rows={2} className="input" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Keep it open</button>
          <button type="submit" className="btn-primary" disabled={busy || note.trim().length < 3}>{busy ? 'Closing…' : 'Close the task'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Whether a task, as the server sent it, may be offered for closing. */
export const offersClose = (task) => Boolean(task && !task.completed && task.closable?.why);

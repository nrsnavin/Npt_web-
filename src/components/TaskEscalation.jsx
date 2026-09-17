import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, FormError, Modal, Notice } from './ui.jsx';
import { DEPARTMENTS, departmentLabel } from '../utils/pipeline.js';
import { formatDate } from '../utils/format.js';

/**
 * Handing a task to another department [BLUEPRINT §25, §35].
 *
 * The plant already had two ways to say "this is somebody else's problem": ring them, or raise
 * an order escalation, which is about an *order* being stopped. Neither covers the ordinary
 * case — one job, on the wrong queue, that somebody else has to do. That was a phone call, and
 * a phone call leaves no record of who was told or whether anything happened.
 *
 * So the task moves, with a sentence. The sentence is the whole value: the department receiving
 * it has not seen the record, and "sent to despatch" tells them nothing they can act on.
 */
export function EscalateTaskDialog({ task, open, onClose, onEscalated }) {
  const [department, setDepartment] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const close = () => {
    setDepartment('');
    setReason('');
    setError(null);
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onEscalated({ id: task._id, department, reason: reason.trim() });
      close();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Hand this to another department"
      description={task?.title}
      onClose={close}
    >
      <form onSubmit={submit} className="space-y-4">
        <Notice tone="info">
          <p>
            It leaves this queue and lands on theirs, highlighted, with your name and the reason
            on it. You keep it in your own list marked with where it went, so you can see whether
            anybody picked it up.
          </p>
        </Notice>

        <Field label="Who has to do it">
          <select
            className="input"
            autoFocus
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="">Choose a department…</option>
            {/* Never the queue it is already on — that would only clear whoever is holding it,
                which is a confusing way to do nothing. */}
            {DEPARTMENTS.filter((entry) => entry.key !== task?.department).map((entry) => (
              <option key={entry.key} value={entry.key}>{entry.label}</option>
            ))}
          </select>
        </Field>

        <Field
          label="Why it is going to them"
          hint="They have not seen the record — a sentence they can act on"
        >
          <textarea
            rows={3}
            className="input"
            placeholder="Lorry is at the gate and the e-way bill is not cut"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>

        <FormError error={error} />

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/[0.06] pt-4">
          {(!department || reason.trim().length < 10) && (
            <p className="mr-auto text-xs text-steel-500">
              {!department ? 'Choose who has to do it.' : 'Say why, in a sentence.'}
            </p>
          )}
          <button type="button" className="btn-secondary" onClick={close}>Keep it here</button>
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !department || reason.trim().length < 10}
          >
            {busy ? 'Sending…' : `Hand it to ${department ? departmentLabel(department) : '…'}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The line under a task saying whose it is, what it is about, and where it came from.
 *
 * On a private list none of this was needed — every task was yours, about nothing in
 * particular. On a shared queue it is the difference between a row somebody picks up and a row
 * everybody assumes is covered.
 */
export function TaskMeta({ task, showDepartment = false }) {
  const owner = task.user?.name;
  const escalated = task.escalation?.at;

  return (
    <>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        {/* Unclaimed first and in the accent colour, because it is the one state that is asking
            somebody to do something about it. */}
        {!task.completed && !owner && (
          <span className="font-semibold text-flame-400">Nobody has this</span>
        )}
        {owner && <span className="text-steel-400">{owner}</span>}
        {showDepartment && task.department && (
          <span className="text-steel-500">{departmentLabel(task.department)}</span>
        )}
        {task.customer?.name && (
          <Link
            to={`/customers/${task.customer._id}`}
            className="truncate text-steel-400 transition-colors hover:text-accent"
          >
            {task.customer.name}
          </Link>
        )}
        {task.order?.number && (
          <Link
            to={`/orders/${task.order._id}`}
            className="text-steel-500 transition-colors hover:text-accent"
          >
            {task.order.number}
          </Link>
        )}
      </div>

      {/* The handover, said in full. A reason truncated to fit is a reason somebody has to open
          the record to read, which is the thing escalating was meant to save them. */}
      {escalated && !task.completed && (
        <p className="mt-1 rounded-md bg-warn-500/10 px-2 py-1 text-xs text-warn-400">
          <span className="font-bold">
            {departmentLabel(task.escalation.from)} → {departmentLabel(task.escalation.to)}
          </span>
          {task.escalation.by?.name ? ` · ${task.escalation.by.name}` : ''}
          {task.escalation.at ? ` · ${formatDate(task.escalation.at)}` : ''}
          {task.escalation.reason ? <span className="block">{task.escalation.reason}</span> : null}
        </p>
      )}
    </>
  );
}

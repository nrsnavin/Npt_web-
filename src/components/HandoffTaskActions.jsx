import { useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { Field, Modal, Notice } from './ui.jsx';

/**
 * What a department does with a task sent about an enquiry [server: config/handoffs.js]:
 *
 *   Done         what was done, and the details the button asks for — goes back to the sender
 *   Send back    with a reason — goes back to the sender too
 *   Change date  with a reason — every task starts due at the end of the day it was sent
 *
 * Picking it up and passing it to another department are the ordinary task actions beside it.
 */

const todayIso = () => new Date().toISOString().slice(0, 10);

export function HandoffDialog({ todo, mode, onClose, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const button = buttonFor(catalogue, todo?.kind);
  const [note, setNote] = useState('');
  const [fields, setFields] = useState({});
  const [dueDate, setDueDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  if (!todo || !mode) return null;

  const titles = {
    done: `Done — ${button?.label || 'task'}`,
    back: `Send back — ${button?.label || 'task'}`,
    date: `Change the due date — ${button?.label || 'task'}`,
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      let updated;
      if (mode === 'done') updated = await workspace.todos.done({ id: todo._id, note, fields });
      if (mode === 'back') updated = await workspace.todos.sendBack({ id: todo._id, reason: note });
      if (mode === 'date') updated = await workspace.todos.reschedule({ id: todo._id, dueDate, reason: note });
      onChanged?.(updated);
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={titles[mode]}
      description={todo.title}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        {todo.notes && (
          <p className="rounded-lg border border-line/[0.06] bg-ink-800/40 p-3 text-sm text-steel-300">
            <span className="text-steel-500">Asked: </span>{todo.notes}
          </p>
        )}

        {mode === 'date' && (
          <Field label="New due date" required>
            <input type="date" className="input" min={todayIso()} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        )}

        <Field
          label={mode === 'done' ? 'What was done' : mode === 'back' ? 'Why it is going back' : 'Why the date is moving'}
          required
          hint={mode === 'done' ? 'Goes back to whoever asked, with the details below' : 'Whoever asked sees this'}
        >
          <textarea rows={3} className="input" value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
        </Field>

        {mode === 'done' && button?.records?.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {button.records.map((record) => (
              <Field key={record.key} label={record.label}>
                <input
                  type={record.type === 'date' ? 'date' : 'text'}
                  className="input"
                  value={fields[record.key] || ''}
                  onChange={(event) => setFields((current) => ({ ...current, [record.key]: event.target.value }))}
                />
              </Field>
            ))}
          </div>
        )}

        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || note.trim().length < 2 || (mode === 'date' && !dueDate)}>
            {busy ? 'Saving…' : mode === 'done' ? 'Mark done' : mode === 'back' ? 'Send back' : 'Change date'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The three buttons, for a task row. `onChanged` gets the updated task. */
export default function HandoffTaskActions({ todo, onChanged }) {
  const [mode, setMode] = useState(null);
  if (!todo?.kind || todo.completed) return null;
  return (
    <>
      <button type="button" className="row-action" onClick={() => setMode('done')}>Done</button>
      <button type="button" className="row-action" onClick={() => setMode('back')}>Send back</button>
      <button type="button" className="row-action" onClick={() => setMode('date')}>Change date</button>
      <HandoffDialog todo={todo} mode={mode} onClose={() => setMode(null)} onChanged={onChanged} />
    </>
  );
}

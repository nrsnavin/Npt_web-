import { useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { departmentLabel } from '../utils/pipeline.js';
import { Field, Modal, Notice } from './ui.jsx';

/**
 * What a department does with an enquiry it holds [server: services/handoff.service.js]:
 *
 *   Update       how it is going — pending quantity, a call made — without moving it on
 *   Move on      what was done, the details the button asks for, and where it goes next:
 *                that department has the enquiry from here
 *   Send back    with a reason — back to whoever had it before
 *   Change date  with a reason — every task starts due at the end of the day it was sent
 *
 * A side request (a PRT visit) is not the enquiry itself, so it is simply Done, and goes back to
 * whoever asked. Picking it up and passing it to another department are the ordinary task
 * actions beside these.
 */

const todayIso = () => new Date().toISOString().slice(0, 10);

/** The departments the next step goes to, in words: "Sampling", or "the marketing person". */
const goesTo = (button) => (button.department === 'owner' ? 'the marketing person' : departmentLabel(button.department));

export function HandoffDialog({ todo, mode, onClose, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const button = buttonFor(catalogue, todo?.kind);
  const [note, setNote] = useState('');
  const [fields, setFields] = useState({});
  const [next, setNext] = useState('');
  const [dueDate, setDueDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  if (!todo || !mode) return null;

  const holds = Boolean(todo.holds);
  /* Where it can go next: every button that hands the enquiry over, except back to this one. */
  const steps = (catalogue?.buttons || []).filter((step) => step.moves && !step.hidden && step.key !== todo.kind);
  const name = button?.label || 'task';

  const titles = {
    done: holds ? `Move on — ${name}` : `Done — ${name}`,
    update: `Update — ${name}`,
    back: `Send back — ${name}`,
    date: `Change the due date — ${name}`,
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      let updated;
      if (mode === 'done') updated = await workspace.todos.done({ id: todo._id, note, fields, ...(holds ? { next } : {}) });
      if (mode === 'update') updated = await workspace.todos.progress({ id: todo._id, note, fields });
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

  const recordsDetails = (mode === 'done' || mode === 'update') && button?.records?.length > 0;
  const noteLabel = {
    done: 'What was done',
    update: 'How it is going',
    back: 'Why it is going back',
    date: 'Why the date is moving',
  }[mode];
  const noteHint = {
    done: holds ? 'The next department and the marketing person see this' : 'Goes back to whoever asked, with the details below',
    update: 'The marketing person sees this; the enquiry stays with you',
    back: 'It goes back to whoever had it before, with this',
    date: 'Whoever asked sees this',
  }[mode];
  const ready = note.trim().length >= 2 && !(mode === 'date' && !dueDate) && !(mode === 'done' && holds && !next);

  return (
    <Modal open title={titles[mode]} description={todo.title} onClose={onClose}>
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

        <Field label={noteLabel} required hint={noteHint}>
          <textarea rows={3} className="input" value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
        </Field>

        {recordsDetails && (
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

        {mode === 'done' && holds && (
          <Field label="Where it goes next" required hint="That department has the enquiry from here">
            <select className="input" value={next} onChange={(event) => setNext(event.target.value)}>
              <option value="">Choose the next step…</option>
              {steps.map((step) => (
                <option key={step.key} value={step.key}>{step.label} — {goesTo(step)}</option>
              ))}
            </select>
          </Field>
        )}

        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !ready}>
            {busy ? 'Saving…' : {
              done: holds ? 'Move it on' : 'Mark done', update: 'Save update', back: 'Send back', date: 'Change date',
            }[mode]}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The buttons for a task row. `onChanged` gets the updated task. */
export default function HandoffTaskActions({ todo, onChanged }) {
  const [mode, setMode] = useState(null);
  if (!todo?.kind || todo.completed) return null;
  return (
    <>
      {todo.holds && <button type="button" className="row-action" onClick={() => setMode('update')}>Update</button>}
      <button type="button" className="row-action" onClick={() => setMode('done')}>{todo.holds ? 'Move on' : 'Done'}</button>
      <button type="button" className="row-action" onClick={() => setMode('back')}>Send back</button>
      <button type="button" className="row-action" onClick={() => setMode('date')}>Change date</button>
      <HandoffDialog todo={todo} mode={mode} onClose={() => setMode(null)} onChanged={onChanged} />
    </>
  );
}

import { useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { Field, Modal, Notice } from './ui.jsx';
import { describeBrief } from '../utils/taskForm.js';
import { isoDay } from '../utils/format.js';

/**
 * What a department does with its task [server: services/handoff.service.js]:
 *
 *   Update       how it is going — pending quantity, a lot sent, a call made
 *   Done         what was done, with the details the task asks for; it goes back to whoever
 *                asked, who takes the next step
 *   Send back    with a reason — back to whoever asked
 *   Change date  with a reason — every task starts due at the end of the day it was raised
 *
 * The enquiry itself stays with its marketing person, whose holding task only moves its
 * follow-up date. A department that still holds an enquiry from before department tasks gives
 * it back to marketing with Done. Picking a task up and passing it to another department are the
 * ordinary task actions beside these.
 */

const todayIso = () => isoDay();

/** Marketing's holding task is the enquiry itself, not work anybody was asked to do. */
const isTheEnquiry = (todo, button) => Boolean(todo?.holds && button?.department === 'owner');

export function HandoffDialog({ todo, mode, onClose, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const button = buttonFor(catalogue, todo?.kind);
  const [note, setNote] = useState('');
  const [fields, setFields] = useState({});
  const [dueDate, setDueDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  if (!todo || !mode) return null;

  const holds = Boolean(todo.holds);
  const name = button?.label || 'task';
  const asked = describeBrief(button, todo.brief);

  const titles = {
    done: holds ? `Done — back to marketing — ${name}` : `Done — ${name}`,
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
      if (mode === 'done') updated = await workspace.todos.done({ id: todo._id, note, fields });
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
    done: holds ? 'The enquiry goes back to its marketing person, with this' : 'Goes back to whoever asked, with the details below',
    update: 'The marketing person sees this; the task stays with you',
    back: holds ? 'The enquiry goes back to its marketing person, with this' : 'It goes back to whoever asked, with this',
    date: 'Whoever asked sees this',
  }[mode];
  const ready = note.trim().length >= 2 && !(mode === 'date' && !dueDate);

  return (
    <Modal open title={titles[mode]} description={todo.title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {(todo.notes || asked.length > 0) && (
          <div className="space-y-1 rounded-lg border border-line/[0.06] bg-ink-800/40 p-3 text-sm text-steel-300">
            {asked.map((line) => <p key={line}>{line}</p>)}
            {todo.notes && <p><span className="text-steel-500">Asked: </span>{todo.notes}</p>}
          </div>
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
                {/* A choice (Quality's Passed / Failed) is picked, never typed — the server checks it. */}
                {record.type === 'choice' ? (
                  <select
                    className="input"
                    value={fields[record.key] || ''}
                    onChange={(event) => setFields((current) => ({ ...current, [record.key]: event.target.value }))}
                  >
                    <option value="">Choose…</option>
                    {record.options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input
                    type={record.type === 'date' ? 'date' : 'text'}
                    className="input"
                    value={fields[record.key] || ''}
                    onChange={(event) => setFields((current) => ({ ...current, [record.key]: event.target.value }))}
                  />
                )}
              </Field>
            ))}
          </div>
        )}

        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !ready}>
            {busy ? 'Saving…' : {
              done: holds ? 'Back to marketing' : 'Mark done', update: 'Save update', back: 'Send back', date: 'Change date',
            }[mode]}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The buttons for a task row. `onChanged` gets the updated task. */
export default function HandoffTaskActions({ todo, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const [mode, setMode] = useState(null);
  if (!todo?.kind || todo.completed) return null;
  /* The enquiry itself: its follow-up date moves; it is closed with Task Closed on the enquiry. */
  if (isTheEnquiry(todo, buttonFor(catalogue, todo.kind))) {
    return (
      <>
        <button type="button" className="row-action" onClick={() => setMode('date')}>Change date</button>
        <HandoffDialog todo={todo} mode={mode} onClose={() => setMode(null)} onChanged={onChanged} />
      </>
    );
  }
  /* A task finished by uploading its PDF (the sales order) has no plain Done [TaskWorkflow]. */
  const byUpload = (buttonFor(catalogue, todo.kind)?.form?.statuses || []).some((entry) => entry.pdf && entry.done);
  return (
    <>
      <button type="button" className="row-action" onClick={() => setMode('update')}>Update</button>
      {!byUpload && <button type="button" className="row-action" onClick={() => setMode('done')}>{todo.holds ? 'Back to marketing' : 'Done'}</button>}
      <button type="button" className="row-action" onClick={() => setMode('back')}>Send back</button>
      <button type="button" className="row-action" onClick={() => setMode('date')}>Change date</button>
      <HandoffDialog todo={todo} mode={mode} onClose={() => setMode(null)} onChanged={onChanged} />
    </>
  );
}

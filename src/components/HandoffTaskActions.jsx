import { useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { Field, Modal, Notice } from './ui.jsx';
import Menu from './Menu.jsx';
import { TaskFacts } from './TaskHistory.jsx';
import { isoDay } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import DeliveryUrgencyDialog from './DeliveryUrgencyDialog.jsx';

/**
 * What a department does with its task [server: services/handoff.service.js]:
 *
 *   Update       how it is going — pending quantity, a lot sent, a call made
 *   Done         what was done, with the details the task asks for; it goes back to whoever
 *                asked, who takes the next step
 *   Send back    with a reason — back to whoever asked
 *   Change date  with a reason — every task starts due at the end of the day it was raised
 *   Close task   Admin only, with a reason — it ends where it stands: no next team, the enquiry
 *                does not move, and the team that had it is told. Closed, never deleted.
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
  const { mayPlanProduction } = useAuth();
  const button = buttonFor(catalogue, todo?.kind);
  const [note, setNote] = useState('');
  const [fields, setFields] = useState({});
  const [dueDate, setDueDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  if (!todo || !mode) return null;

  const holds = Boolean(todo.holds);
  const name = button?.label || 'task';

  const titles = {
    done: holds ? `Done — back to marketing — ${name}` : `Done — ${name}`,
    update: `Update — ${name}`,
    back: `Send back — ${name}`,
    date: `Change the due date — ${name}`,
    admin: `Close task — ${name}`,
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
      if (mode === 'admin') updated = await workspace.todos.adminClose({ id: todo._id, reason: note });
      onChanged?.(updated);
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  /* Production's "Expected date" is its EDD: only the Production in charge (or Admin) gives it [server: `assertPlansProduction`]. */
  const records = (button?.records || []).filter((record) => !(todo.kind === 'ask_edd' && record.type === 'date' && !mayPlanProduction));
  const recordsDetails = (mode === 'done' || mode === 'update') && records.length > 0;
  const noteLabel = {
    done: 'What was done',
    update: 'How it is going',
    back: 'Why it is going back',
    date: 'Why the date is moving',
    admin: 'Why it is being closed',
  }[mode];
  const noteHint = {
    done: holds ? 'The enquiry goes back to its marketing person, with this' : 'Goes back to whoever asked, with the details below',
    update: 'The marketing person sees this; the task stays with you',
    back: holds ? 'The enquiry goes back to its marketing person, with this' : 'It goes back to whoever asked, with this',
    date: 'Whoever asked sees this',
    admin: 'It ends here: no next team is asked and the enquiry does not move. The team that had it is told, with this.',
  }[mode];
  const ready = note.trim().length >= (mode === 'admin' || mode === 'back' || mode === 'date' ? 5 : 2) && !(mode === 'date' && !dueDate);

  return (
    <Modal open title={titles[mode]} description={todo.title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {(todo.notes || todo.brief) && (
          <div className="space-y-2 rounded-lg border border-line/[0.06] bg-ink-800/40 p-3 text-sm text-steel-300">
            <TaskFacts button={button} task={todo} />
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
            {records.map((record) => (
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
              done: holds ? 'Back to marketing' : 'Mark done', update: 'Save update', back: 'Send back', date: 'Change date', admin: 'Close task',
            }[mode]}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The buttons for a task row. `onChanged` gets the updated task.
 *
 * `layout="menu"` is the task card's way: the one thing most likely wanted (`primary`: `done`
 * for a task without a workflow, nothing for one whose workflow offers the next step) as a
 * button, and the rest behind "⋯" — four equal buttons under every card were noise.
 */
export default function HandoffTaskActions({ todo, onChanged, layout = 'row', primary }) {
  const catalogue = useHandoffCatalogue();
  const { isAdmin, departments = [] } = useAuth();
  const [mode, setMode] = useState(null);
  const [urgencyOpen, setUrgencyOpen] = useState(false);
  if (!todo?.kind || todo.completed) return null;
  /* Admin may close any department task outright — never the enquiry itself, which closes with Task Closed. */
  const adminClose = isAdmin ? [{ key: 'admin', label: 'Close task (Admin)', hint: 'Ends it here, with a reason — nothing follows', onSelect: () => setMode('admin') }] : [];
  /* A Dispatch request: marketing or Admin says how soon the buyer needs it [DeliveryUrgencyDialog]. */
  const urgency = todo.kind === 'invoice_dispatch' && (isAdmin || departments.includes('marketing'))
    ? [{ key: 'urgency', label: todo.delivery?.urgency ? `Delivery: ${todo.delivery.label} — change` : 'Set delivery urgency', hint: 'How soon the buyer needs it — orders the Dispatch queue', onSelect: () => setUrgencyOpen(true) }]
    : [];
  const urgencyDialog = urgencyOpen && (
    <DeliveryUrgencyDialog taskId={todo._id} current={todo.delivery?.urgency} about={todo.title} onClose={() => setUrgencyOpen(false)} onSaved={onChanged} />
  );
  if (layout === 'menu' && !isTheEnquiry(todo, buttonFor(catalogue, todo.kind))) {
    const byUpload = (buttonFor(catalogue, todo.kind)?.form?.statuses || []).some((entry) => entry.pdf && entry.done);
    const choices = [
      { key: 'update', label: 'Update', hint: 'How it is going — the task stays with you', onSelect: () => setMode('update') },
      ...(byUpload ? [] : [{ key: 'done', label: todo.holds ? 'Back to marketing' : 'Done', hint: 'Finished — back to whoever asked', onSelect: () => setMode('done') }]),
      { key: 'back', label: 'Send back', hint: 'With a reason, to whoever asked', onSelect: () => setMode('back') },
      { key: 'date', label: 'Change date', hint: 'Move the due date, with a reason', onSelect: () => setMode('date') },
      ...urgency,
      ...adminClose,
    ];
    const lead = choices.find((choice) => choice.key === primary);
    return (
      <>
        {lead && <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={lead.onSelect}>{lead.label}</button>}
        <Menu
          label="⋯"
          srLabel="More actions"
          align="right"
          items={choices.filter((choice) => choice !== lead)}
          buttonClassName="btn-secondary min-w-9 px-2.5 py-1.5 text-sm leading-none"
        />
        <HandoffDialog todo={todo} mode={mode} onClose={() => setMode(null)} onChanged={onChanged} />
        {urgencyDialog}
      </>
    );
  }
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
      {urgency.length > 0 && <button type="button" className="row-action" onClick={() => setUrgencyOpen(true)}>{todo.delivery?.urgency ? `Urgency: ${todo.delivery.label}` : 'Set urgency'}</button>}
      {isAdmin && <button type="button" className="row-action" onClick={() => setMode('admin')}>Close task</button>}
      <HandoffDialog todo={todo} mode={mode} onClose={() => setMode(null)} onChanged={onChanged} />
      {urgencyDialog}
    </>
  );
}

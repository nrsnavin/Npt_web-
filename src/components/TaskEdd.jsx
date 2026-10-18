import { useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { todayInIndia } from '../utils/taskForm.js';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate } from '../utils/format.js';
import { dateLabelFor, eddOf, givesEdd, handsOnOf, incomingOf, needsRouting, showsEdd, teamWords } from '../utils/edd.js';
import TaskRouting from './TaskRouting.jsx';

/**
 * The expected delivery date on a department task [server: handoff.service `setTaskEdd`].
 *
 * On Production's, Assembly's and Printing's tasks it is asked for at the top of the task until
 * it is given — the thing the task was raised for — and given right there, without a status move.
 * On the dispatch request it is read: the date the goods are to go by, or that Production has
 * not given one yet. Marketing's own date, set on the enquiry, shows the same way, named as theirs.
 */

/** The date and a remark, then Give EDD. */
export function EddForm({ onSave, onCancel, initial = '', label = 'Give EDD', busyLabel = 'Saving…', dateLabel = 'EDD' }) {
  const [date, setDate] = useState(initial);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await onSave({ date, note: note.trim() || undefined });
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} aria-label={dateLabel === 'EDD' ? 'Expected delivery date' : dateLabel} className="mt-2 space-y-2">
      <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
        <Field label={dateLabel} required>
          <input type="date" className="input" min={todayInIndia()} value={date} onChange={(event) => setDate(event.target.value)} autoFocus />
        </Field>
        <Field label="Remark">
          <input className="input" placeholder="Optional — what the date rests on" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
      {problem && <Notice tone="danger">{problem}</Notice>}
      <div className="flex justify-end gap-2">
        {onCancel && <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={busy || !date}>{busy ? busyLabel : label}</button>
      </div>
    </form>
  );
}

/** "EDD 12 Nov 2026 · Production · Sivakumar, 10 Oct 2026 — two presses on it" */
export function EddLine({ edd, className = '' }) {
  if (!edd?.date) return null;
  const by = edd.by && typeof edd.by === 'object' ? edd.by.name : null;
  return (
    <p className={`text-sm text-steel-100 ${className}`}>
      <span className="font-bold">EDD {formatDate(edd.date)}</span>
      <span className="text-steel-400">
        {edd.department ? ` · ${departmentLabel(edd.department)}` : ''}
        {by ? ` · ${by}` : ''}
        {edd.at ? `, ${formatDate(edd.at)}` : ''}
        {edd.note ? ` — ${edd.note}` : ''}
      </span>
    </p>
  );
}

/** When the goods reach Printing or Assembly, from the team before it. */
function Incoming({ todo }) {
  const rows = incomingOf(todo);
  const from = todo.routing?.from || [];
  if (!rows.length && !from.length) return null;
  return (
    <p className="mt-1 text-xs text-steel-300">
      {rows.length
        ? rows.map((row) => `From ${row.label} ${formatDate(row.day)}`).join(' · ')
        : `Waiting for ${from.map((team) => (team === 'production' ? 'Production' : team === 'printing' ? 'Printing' : team)).join(' and ')} to give the hand-over date`}
    </p>
  );
}

/**
 * A team that hands on — Production before Printing or Assembly, Printing before Assembly —
 * gives the next team a hand-over date, not the EDD [server: handoff.service `passHandover`].
 */
function HandOverDate({ todo, mayAct, onChanged }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const teams = handsOnOf(todo);
  const day = todo.routing?.handOverDate;
  const gives = mayAct && !todo.completed;
  const label = dateLabelFor(todo);
  const save = async ({ date, note }) => {
    const saved = await workspace.todos.edd({ id: todo._id, date, note });
    toast(`Hand-over ${formatDate(date)}`, `${teamWords(teams)} ${teams.length > 1 ? 'are' : 'is'} told when the goods come.`);
    setEditing(false);
    onChanged?.(saved);
  };
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${day ? 'border-accent/30 bg-accent/[0.05]' : 'border-warn-500/40 bg-warn-500/[0.07]'}`} aria-label="Hand-over date">
      {day ? (
        <p className="text-sm text-steel-100"><span className="font-bold">Hand-over to {teamWords(teams)} {formatDate(day)}</span></p>
      ) : (
        <p className="text-sm text-steel-100">
          <span className="font-bold text-warn-400">Hand-over date needed</span>
          <span className="text-steel-300"> — say when the goods reach {teamWords(teams)}. The last team in the chain gives the EDD.</span>
        </p>
      )}
      <Incoming todo={todo} />
      <EddReadOnly todo={todo} />
      {gives && day && !editing && <button type="button" className="row-action mt-1" onClick={() => setEditing(true)}>Change hand-over date</button>}
      {gives && (!day || editing) && (
        <EddForm onSave={save} onCancel={editing ? () => setEditing(false) : undefined} dateLabel={label} label={day ? 'Change hand-over date' : 'Give hand-over date'} />
      )}
    </div>
  );
}

/** The enquiry's EDD, read beside a hand-over date: the last team's word. */
function EddReadOnly({ todo }) {
  const edd = eddOf(todo.enquiry);
  if (!edd) return null;
  return <EddLine edd={edd} className="mt-1 text-xs" />;
}

export default function TaskEdd({ todo, mayAct = false, onChanged }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  if (!showsEdd(todo)) return null;
  /* Production decides printing and assembly first, then gives a date. */
  if (todo.kind === 'ask_edd' && todo.enquiry) {
    const routed = !needsRouting(todo);
    return (
      <div className="space-y-2">
        <TaskRouting todo={todo} mayAct={mayAct} onChanged={onChanged} />
        {routed && handsOnOf(todo).length > 0 && <HandOverDate todo={todo} mayAct={mayAct} onChanged={onChanged} />}
        {routed && !handsOnOf(todo).length && <EddBox todo={todo} mayAct={mayAct} onChanged={onChanged} toast={toast} editing={editing} setEditing={setEditing} />}
      </div>
    );
  }
  if (handsOnOf(todo).length) return <HandOverDate todo={todo} mayAct={mayAct} onChanged={onChanged} />;
  return <EddBox todo={todo} mayAct={mayAct} onChanged={onChanged} toast={toast} editing={editing} setEditing={setEditing} />;
}

function EddBox({ todo, mayAct, onChanged, toast, editing, setEditing }) {
  const edd = eddOf(todo.enquiry);
  const gives = givesEdd(todo) && mayAct && !todo.completed;
  const needed = !edd && !todo.completed;

  const save = async ({ date, note }) => {
    const saved = await workspace.todos.edd({ id: todo._id, date, note });
    toast(`EDD ${formatDate(date)}`, 'The enquiry’s marketing person and Admin are told.');
    setEditing(false);
    onChanged?.(saved);
  };

  const tone = needed && givesEdd(todo) ? 'border-warn-500/40 bg-warn-500/[0.07]' : 'border-accent/30 bg-accent/[0.05]';
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tone}`} aria-label="Expected delivery date">
      {edd ? (
        <EddLine edd={edd} />
      ) : givesEdd(todo) ? (
        <p className="text-sm text-steel-100">
          <span className="font-bold text-warn-400">EDD needed</span>
          <span className="text-steel-300"> — the enquiry has no expected delivery date yet.{gives ? ' Give it here; marketing and Admin are told.' : ''}</span>
        </p>
      ) : (
        <p className="text-sm text-steel-100">
          <span className="font-bold">EDD not given yet</span>
          <span className="text-steel-400"> — Production has not said when the goods will be ready.</span>
        </p>
      )}
      {/* Wanted: the form is right there. Given: a Change button, and the form on request. */}
      {gives && edd && !editing && (
        <button type="button" className="row-action mt-1" onClick={() => setEditing(true)}>Change EDD</button>
      )}
      <Incoming todo={todo} />
      {gives && (needed || editing) && (
        <EddForm onSave={save} onCancel={editing ? () => setEditing(false) : undefined} label={edd ? 'Change EDD' : 'Give EDD'} />
      )}
    </div>
  );
}

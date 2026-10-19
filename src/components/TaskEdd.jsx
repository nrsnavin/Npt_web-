import { useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { todayInIndia } from '../utils/taskForm.js';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate } from '../utils/format.js';
import { dateLabelFor, datesOfTask, eddByModelOf, eddOf, givesEdd, handsOnOf, incomingOf, modelsOfTask, needsRouting, showsEdd, teamWords } from '../utils/edd.js';
import TaskRouting from './TaskRouting.jsx';

/**
 * The expected delivery date on a department task [server: handoff.service `setTaskEdd`].
 *
 * On Production's, Assembly's and Printing's tasks it is asked for at the top of the task until
 * it is given — the thing the task was raised for — and given right there, without a status move.
 * On the dispatch request it is read: the date the goods are to go by, or that Production has
 * not given one yet. Marketing's own date, set on the enquiry, shows the same way, named as theirs.
 */

/**
 * The date and a remark, then Give EDD. With several `models` (an order of three or four items)
 * a date is asked for each model, with one box to fill them all at once; `given` is the date this
 * task gave each model before [server: Todo `modelDates`].
 */
export function EddForm({ onSave, onCancel, initial = '', label = 'Give EDD', busyLabel = 'Saving…', dateLabel = 'EDD', models = [], given = {} }) {
  const [date, setDate] = useState(initial);
  const [perModel, setPerModel] = useState(() => Object.fromEntries(models.map((model) => [model, given[model] || initial || ''])));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const several = models.length > 1;
  const ready = several ? models.every((model) => perModel[model]) : Boolean(date);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await onSave(several
        ? { models: models.map((model) => ({ model, date: perModel[model] })), note: note.trim() || undefined }
        : { date, note: note.trim() || undefined });
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} aria-label={dateLabel === 'EDD' ? 'Expected delivery date' : dateLabel} className="mt-2 space-y-2">
      {several ? (
        <div className="space-y-1.5" aria-label={`${dateLabel} for each model`}>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={`${dateLabel} — same for all`}>
              <input type="date" className="input" min={todayInIndia()} value={date} onChange={(event) => { setDate(event.target.value); setPerModel(Object.fromEntries(models.map((model) => [model, event.target.value]))); }} />
            </Field>
            <p className="pb-2 text-xs text-steel-400">or one date for each model:</p>
          </div>
          {models.map((model) => (
            <label key={model} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm text-steel-200">
              <span className="truncate font-semibold">{model}</span>
              <input type="date" aria-label={`${dateLabel} for ${model}`} className="input py-1.5" min={todayInIndia()} value={perModel[model] || ''} onChange={(event) => setPerModel({ ...perModel, [model]: event.target.value })} />
            </label>
          ))}
          <Field label="Remark">
            <input className="input" placeholder="Optional — what the dates rest on" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>
      ) : (
      <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
        <Field label={dateLabel} required>
          <input type="date" className="input" min={todayInIndia()} value={date} onChange={(event) => setDate(event.target.value)} autoFocus required />
        </Field>
        <Field label="Remark">
          <input className="input" placeholder="Optional — what the date rests on" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
      )}
      {problem && <Notice tone="danger">{problem}</Notice>}
      <div className="flex justify-end gap-2">
        {onCancel && <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={busy || !ready}>{busy ? busyLabel : label}</button>
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

/**
 * Each model's EDD — the latest date its teams gave — and this task's own date for it, so a team
 * sees where its date stands beside the others' [server: handoff.service `refreshModelEdds`].
 */
export function ModelEdds({ todo, rows, className = '' }) {
  const own = datesOfTask(todo);
  const models = todo ? modelsOfTask(todo) : [];
  const all = rows || eddByModelOf(todo?.enquiry);
  const shown = models.length ? all.filter((row) => models.includes(row.model)) : all;
  const extra = models.filter((model) => own[model] && !shown.some((row) => row.model === model)).map((model) => ({ model }));
  const list = [...shown, ...extra];
  if (!list.length || (list.length === 1 && !Object.keys(own).length && !rows)) return null;
  return (
    <ul className={`space-y-0.5 text-xs text-steel-300 ${className}`} aria-label="EDD by model">
      {list.map((row) => (
        <li key={row.model}>
          <span className="font-semibold text-steel-100">{row.model}</span>
          {row.date ? ` · EDD ${formatDate(row.date)}${row.department ? ` (${departmentLabel(row.department)})` : ''}` : ' · EDD not complete yet'}
          {own[row.model] ? ` · this team: ${formatDate(own[row.model])}` : ''}
          {!own[row.model] && row.teams?.length ? ` · ${row.teams.map((team) => `${departmentLabel(team.department)} ${formatDate(team.date)}`).join(', ')}` : ''}
        </li>
      ))}
    </ul>
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
  const save = async ({ date, note, models }) => {
    const saved = await workspace.todos.edd({ id: todo._id, date, models, note });
    const latest = date || (models || []).map((row) => row.date).sort().at(-1);
    toast(`Hand-over ${formatDate(latest)}`, `${teamWords(teams)} ${teams.length > 1 ? 'are' : 'is'} told when the goods come.`);
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
      <ModelEdds todo={todo} className="mt-1" />
      {gives && day && !editing && <button type="button" className="row-action mt-1" onClick={() => setEditing(true)}>Change hand-over date</button>}
      {gives && (!day || editing) && (
        <EddForm onSave={save} onCancel={editing ? () => setEditing(false) : undefined} dateLabel={label} label={day ? 'Change hand-over date' : 'Give hand-over date'} models={modelsOfTask(todo)} given={datesOfTask(todo)} />
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

  const save = async ({ date, note, models }) => {
    const saved = await workspace.todos.edd({ id: todo._id, date, models, note });
    const latest = date || (models || []).map((row) => row.date).sort().at(-1);
    toast(models?.length ? `EDD given for ${models.length} models` : `EDD ${formatDate(latest)}`, 'Each model’s EDD is the latest its teams give; marketing and Admin are told.');
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
      <ModelEdds todo={todo} className="mt-1" />
      {gives && (needed || editing) && (
        <EddForm onSave={save} onCancel={editing ? () => setEditing(false) : undefined} label={edd ? 'Change EDD' : 'Give EDD'} models={modelsOfTask(todo)} given={datesOfTask(todo)} />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { Notice } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { pathOf, teamWords } from '../utils/edd.js';

/**
 * Production's first call on its task: model by model, is it printed, assembled, both (printing
 * first) or neither [server: handoff.service `decideRouting`]. Printing's and Assembly's tasks are
 * raised from this at once; until it is made, Production gives no date. It may be changed while
 * the task is open.
 */


function RoutingForm({ todo, onSaved, onCancel }) {
  const [rows, setRows] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    workspace.todos.routing(todo._id).then((answer) => {
      if (!live) return;
      const said = new Map((answer.routing?.models || []).map((row) => [row.model, row]));
      setRows(answer.models.map((entry) => ({
        model: entry.model, print: entry.print, clip: entry.clip, hook: entry.hook,
        printing: Boolean(said.get(entry.model)?.printing), assembly: Boolean(said.get(entry.model)?.assembly),
      })));
    }).catch((failure) => live && setProblem(failure.message));
    return () => { live = false; };
  }, [todo._id]);

  const toggle = (index, key) => setRows((current) => current.map((row, at) => (at === index ? { ...row, [key]: !row[key] } : row)));
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await workspace.todos.route({ id: todo._id, models: rows.map(({ model, printing, assembly }) => ({ model, printing, assembly })) }));
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };

  if (!rows) return problem ? <Notice tone="danger">{problem}</Notice> : <p className="text-xs text-steel-400">Loading the models…</p>;
  if (!rows.length) return <Notice tone="warn">{todo.enquiry ? 'The enquiry names no model. Add the model on the enquiry first.' : 'The task names no model. Edit the task’s hanger details to add it.'}</Notice>;
  return (
    <form onSubmit={save} aria-label="Printing and assembly" className="mt-2 space-y-2">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-steel-400">
              <th className="py-1 pr-3 font-semibold">Model</th>
              <th className="px-2 py-1 font-semibold">Printing</th>
              <th className="px-2 py-1 font-semibold">Assembly</th>
              <th className="py-1 pl-2 font-semibold">Goes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/[0.06]">
            {rows.map((row, index) => (
              <tr key={row.model}>
                <td className="py-1.5 pr-3">
                  <p className="font-semibold text-steel-100">{row.model}</p>
                  {(row.print || row.clip || row.hook) && (
                    <p className="text-xs text-steel-400">{[row.print && `Print: ${row.print}`, row.hook && `Hook: ${row.hook}`, row.clip && `Clip: ${row.clip}`].filter(Boolean).join(' · ')}</p>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <input type="checkbox" className="h-4 w-4" aria-label={`Printing for ${row.model}`} checked={row.printing} onChange={() => toggle(index, 'printing')} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="checkbox" className="h-4 w-4" aria-label={`Assembly for ${row.model}`} checked={row.assembly} onChange={() => toggle(index, 'assembly')} />
                </td>
                <td className="py-1.5 pl-2 text-xs text-steel-300">{pathOf(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-steel-400">
        Printing and Assembly get their tasks now, with only their models. You then give the hand-over date; the last team gives the EDD.
      </p>
      {problem && <Notice tone="danger">{problem}</Notice>}
      <div className="flex justify-end gap-2">
        {onCancel && <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={busy}>{busy ? 'Saving…' : 'Save and raise the tasks'}</button>
      </div>
    </form>
  );
}

export default function TaskRouting({ todo, mayAct = false, onChanged }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  if (todo.kind !== 'ask_edd') return null;
  const routing = todo.routing?.decidedAt ? todo.routing : null;
  const open = !todo.completed;
  const saved = (task) => {
    const teams = task.routing?.handsTo || [];
    const raised = [...new Set((task.routing?.models || []).flatMap((row) => [row.printing && 'printing', row.assembly && 'assembling']).filter(Boolean))];
    toast('Printing / assembly saved', raised.length ? `${teamWords(raised)} ${raised.length > 1 ? 'have' : 'has'} the task. Give ${teamWords(teams)} your hand-over date.` : 'Nothing follows moulding — your date is the EDD.');
    setEditing(false);
    onChanged?.(task);
  };

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${routing ? 'border-line/[0.1] bg-line/[0.02]' : 'border-warn-500/40 bg-warn-500/[0.07]'}`} aria-label="After moulding">
      {routing ? (
        <>
          <p className="text-xs font-semibold text-steel-400">After moulding</p>
          <ul className="mt-1 space-y-0.5 text-sm text-steel-100">
            {routing.models.map((row) => (
              <li key={row.model}><span className="font-semibold">{row.model}</span> <span className="text-steel-400">· {pathOf(row)}</span></li>
            ))}
          </ul>
          {open && mayAct && !editing && <button type="button" className="row-action mt-1" onClick={() => setEditing(true)}>Change</button>}
        </>
      ) : (
        <p className="text-sm text-steel-100">
          <span className="font-bold text-warn-400">Printing or assembly?</span>
          <span className="text-steel-300"> Decide for each model before you give a date.{mayAct ? '' : ' The Production in charge decides this.'}</span>
        </p>
      )}
      {open && mayAct && (!routing || editing) && (
        <RoutingForm todo={todo} onSaved={saved} onCancel={editing ? () => setEditing(false) : undefined} />
      )}
    </div>
  );
}


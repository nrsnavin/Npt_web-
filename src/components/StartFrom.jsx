import { useEffect, useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Field, Notice } from './ui.jsx';
import { todayInIndia } from '../utils/taskForm.js';
import { modelsOfTask } from '../utils/edd.js';

/**
 * "Where does this order stand?" — a Production task Admin or marketing raised with only the
 * buyer's name [server: teamProduction.service]. The Production in charge reads the order and:
 *
 *   links it    to the buyer's open enquiry, when there is one — the task follows that enquiry;
 *               one already with Production takes this ask instead
 *   or starts   each model from where it is: not started (he plans it), started, with Printing
 *               or Assembly since a date (that team's task is raised), with Dispatch (the request
 *               is raised), or already dispatched (recorded — nothing sends it again)
 *
 * Printing and Assembly are ticked per model; what a model has already passed through is done.
 */

const DEFAULT_POINTS = [
  { key: 'not_started', label: 'Not started yet' },
  { key: 'started', label: 'Production started' },
  { key: 'handed_printing', label: 'Already handed to Printing', dated: true },
  { key: 'handed_assembly', label: 'Already handed to Assembly', dated: true },
  { key: 'ready_dispatch', label: 'Ready — with Dispatch' },
  { key: 'dispatched', label: 'Already dispatched', dated: true, pieces: true },
];

const blankRow = (model = '', quantity = '') => ({ model, quantity, printing: false, assembly: false, at: 'not_started', date: '', pieces: '' });

export default function StartFrom({ todo, onChanged }) {
  const { toast } = useToast();
  const [options, setOptions] = useState(null);
  const [rows, setRows] = useState(() => {
    const items = Array.isArray(todo.brief?.items) ? todo.brief.items : [];
    const names = [...new Set([...modelsOfTask(todo), ...items.map((item) => item.model)].filter(Boolean))];
    const quantityOf = (model) => items.find((item) => item.model === model)?.quantity || (names.length === 1 ? todo.brief?.quantity || '' : '');
    return names.length ? names.map((model) => blankRow(model, String(quantityOf(model) || ''))) : [blankRow()];
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    let live = true;
    workspace.todos.linkOptions(todo._id).then((data) => { if (live) setOptions(data); }).catch(() => setOptions({ enquiries: [], startPoints: DEFAULT_POINTS }));
    return () => { live = false; };
  }, [todo._id]);

  const points = options?.startPoints || DEFAULT_POINTS;
  const pointOf = (key) => points.find((entry) => entry.key === key) || {};
  const set = (index, patch) => setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  const link = async (enquiry) => {
    setBusy(true);
    setProblem(null);
    try {
      const answer = await workspace.todos.linkEnquiry({ id: todo._id, enquiry: enquiry._id });
      toast(answer.mergedInto ? `Closed onto ${enquiry.number}` : `Linked to ${enquiry.number}`, answer.mergedInto ? `Production already has it: ${answer.mergedInto.title}` : 'The task follows that enquiry from here.');
      onChanged?.(answer.data);
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const named = rows.filter((row) => row.model.trim());
  const missing = named.find((row) => (pointOf(row.at).dated && !row.date) || (pointOf(row.at).pieces && !(Number(row.pieces) > 0))
    || (row.at === 'handed_printing' && !row.printing) || (row.at === 'handed_assembly' && !row.assembly));
  const start = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const saved = await workspace.todos.startFrom({
        id: todo._id,
        models: named.map((row) => ({
          model: row.model.trim(), quantity: row.quantity, printing: row.printing, assembly: row.assembly, at: row.at,
          ...(pointOf(row.at).dated ? { date: row.date } : {}), ...(pointOf(row.at).pieces ? { pieces: Number(row.pieces) } : {}),
        })),
      });
      toast('Started from where the goods are', named.map((row) => `${row.model}: ${pointOf(row.at).label?.toLowerCase()}`).join(' · '));
      onChanged?.(saved);
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-accent/30 bg-accent/[0.04] p-3" aria-label="Where does this order stand">
      <div>
        <p className="text-sm font-bold text-steel-50">Where does this order stand?</p>
        <p className="text-xs text-steel-400">Asked with only the buyer’s name — read the order, name each model, and start it from where it is now.</p>
      </div>

      {options?.enquiries?.length > 0 && (
        <div className="rounded-lg border border-line/[0.08] px-3 py-2" aria-label="The buyer's open enquiries">
          <p className="text-xs font-bold uppercase tracking-wide text-steel-400">This buyer’s open enquiries</p>
          <ul className="divide-y divide-line/[0.06]">
            {options.enquiries.map((enquiry) => (
              <li key={enquiry._id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                <span>
                  <span className="font-semibold text-steel-100">{enquiry.number}</span>
                  <span className="text-xs text-steel-400"> · {enquiry.models.join(', ') || 'no model'}{enquiry.order ? ` · ${enquiry.order.number}` : ''}{enquiry.inProduction ? ' · already with Production' : ''}</span>
                </span>
                <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={() => link(enquiry)}>
                  {enquiry.inProduction ? 'Same order — close onto it' : 'Link to this enquiry'}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-steel-500">Linked, the task follows that enquiry’s order, dispatch and payments. Not this order? Start it below.</p>
        </div>
      )}

      <form onSubmit={start} className="space-y-2">
        {rows.map((row, index) => {
          const point = pointOf(row.at);
          return (
            <fieldset key={index} className="grid gap-2 rounded-lg border border-line/[0.08] p-2 sm:grid-cols-[1.2fr_0.8fr_auto_1.4fr]" aria-label={`Model ${index + 1}`}>
              <Field label="Model"><input className="input" value={row.model} placeholder="CRF25" onChange={(event) => set(index, { model: event.target.value })} /></Field>
              <Field label="Pieces"><input className="input" inputMode="numeric" value={row.quantity} placeholder="10,000" onChange={(event) => set(index, { quantity: event.target.value })} /></Field>
              <div className="flex flex-col justify-end gap-1 pb-1 text-xs text-steel-200">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={row.printing} onChange={(event) => set(index, { printing: event.target.checked })} /> Printing</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={row.assembly} onChange={(event) => set(index, { assembly: event.target.checked })} /> Assembly</label>
              </div>
              <Field label="Where is it now?">
                <select className="input" value={row.at} onChange={(event) => set(index, { at: event.target.value })}>
                  {points.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
                </select>
              </Field>
              {point.dated && (
                <Field label={row.at === 'dispatched' ? 'Dispatched on' : 'Handed over on'} required>
                  <input type="date" required className="input" max={todayInIndia()} value={row.date} onChange={(event) => set(index, { date: event.target.value })} />
                </Field>
              )}
              {point.pieces && (
                <Field label="Pieces dispatched" required>
                  <input className="input" required inputMode="numeric" value={row.pieces} onChange={(event) => set(index, { pieces: event.target.value.replace(/[^\d]/g, '') })} />
                </Field>
              )}
              {(row.at === 'handed_printing' && !row.printing) && <p className="text-xs text-warn-400 sm:col-span-4">Tick Printing — it is with Printing.</p>}
              {(row.at === 'handed_assembly' && !row.assembly) && <p className="text-xs text-warn-400 sm:col-span-4">Tick Assembly — it is with Assembly.</p>}
              {rows.length > 1 && <button type="button" className="link-muted justify-self-start text-xs sm:col-span-4" onClick={() => setRows(rows.filter((_, at) => at !== index))}>Remove this model</button>}
            </fieldset>
          );
        })}
        <button type="button" className="link-muted text-xs" onClick={() => setRows([...rows, blankRow()])}>+ Add a model</button>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={busy || !named.length || Boolean(missing)}>{busy ? 'Starting…' : 'Start from here'}</button>
        </div>
      </form>
    </section>
  );
}

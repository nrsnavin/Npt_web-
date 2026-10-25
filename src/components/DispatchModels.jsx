import { useEffect, useState } from 'react';
import { workspace } from '../api/endpoints.js';

/**
 * Each model of a Dispatch request where it stands on its own [server: handoff.service
 * `dispatchStateOf`] — one model part sent never reads as every model part sent:
 *
 *   Fully sent      every piece ordered has gone
 *   Part sent       some gone — how many of how many, what is left, and where the rest is
 *   Ready           marked Ready for Dispatch by its last team, nothing sent yet
 *   Waiting for QC  made, Quality's pass still to come where QC is compulsory
 *   In the plant    still with Production, Printing or Assembly — "Not produced yet" before it starts
 *
 * The request closes only once every model has gone in full.
 */
export const DISPATCH_STATES = {
  sent: { label: 'Fully sent', tone: 'bg-success-500/15 text-success-400' },
  part_sent: { label: 'Part sent', tone: 'bg-accent/15 text-accent' },
  ready: { label: 'Ready', tone: 'bg-success-500/10 text-success-400' },
  qc: { label: 'Waiting for QC', tone: 'bg-warn-500/15 text-warn-400' },
  in_plant: { label: 'In the plant', tone: 'bg-line/[0.08] text-steel-300' },
};

/** One line a model: the state chip, the model, and the words. `compact` for a table cell. */
export function DispatchModelList({ models = [], compact = false }) {
  if (!models.length) return null;
  return (
    <ul className={compact ? 'space-y-1' : 'divide-y divide-line/[0.06]'} aria-label="Each model">
      {models.map((row) => {
        const state = DISPATCH_STATES[row.state] || DISPATCH_STATES.in_plant;
        return (
          <li key={row.model} className={compact ? 'text-xs' : 'flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm'}>
            <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${state.tone}`}>{state.label}</span>
            <span className={`font-semibold text-steel-100 ${compact ? 'ml-1.5' : ''}`}>{row.model}</span>
            <span className={compact ? 'block text-steel-400' : 'text-steel-400'}>{row.words}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** On a Dispatch request: each model's own state, read from the dispatch sheet as the task moves. */
export default function DispatchModels({ todo }) {
  const [models, setModels] = useState(null);
  useEffect(() => {
    let live = true;
    workspace.todos.dispatchSheet(todo._id).then((sheet) => { if (live) setModels(sheet.models || []); }).catch(() => {});
    return () => { live = false; };
  }, [todo._id, todo.updatedAt, todo.status, todo.loads?.length]);
  if (!models?.length) return null;
  const owed = models.filter((row) => row.state !== 'sent');
  return (
    <section className="rounded-lg border border-line/[0.08] px-3 py-2" aria-label="Each model's dispatch">
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-bold uppercase tracking-wide text-steel-400">
        <span>Each model</span>
        {models.length > 1 && <span className="font-semibold normal-case tracking-normal">{owed.length ? `${models.length - owed.length} of ${models.length} fully sent — closes once all have gone` : 'All fully sent'}</span>}
      </p>
      <DispatchModelList models={models} />
    </section>
  );
}

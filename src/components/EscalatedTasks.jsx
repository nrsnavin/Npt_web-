import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { workspace } from '../api/endpoints.js';
import { useWorkspace } from './dock/WorkspaceContext.jsx';
import { Notice } from './ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate, plural } from '../utils/format.js';

/**
 * What another department has stopped and handed to us [BLUEPRINT §25, §35].
 *
 * Its own card rather than a colour on a row in the queue, and that is the whole request: a job
 * escalated from production is not the same kind of thing as a job despatch raised for itself.
 * Somebody else has already run out of road on it, which means it has been waiting since before
 * this morning — and on a queue of thirty rows the only way it gets seen is by not being
 * thirtieth.
 *
 * **It empties as the work is picked up**, not as it is read. Taking a job off it is the
 * acknowledgement; there is no "mark as seen", because that is a button people press to clear a
 * badge. So the card is what is *unanswered*, never a second copy of the queue.
 *
 * Drawn as nothing at all when nothing has been escalated — the same rule as the stopped-orders
 * feed. A card that says "none" every morning is a card people stop reading, and then miss on
 * the morning it is not empty.
 */
export default function EscalatedTasks() {
  const { reload } = useWorkspace();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await workspace.todos.escalated();
      setRows(response.data || []);
      setError(null);
    } catch (failure) {
      /*
       * A person with no department has no queue and the server says so quietly. Anything else
       * is worth a line, because a card that failed to load looks exactly like a morning with
       * nothing handed over.
       */
      if (failure?.status === 403 || failure?.status === 401) setRows([]);
      else setError(failure);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Taking it is the acknowledgement, so the row leaves this card as soon as it is claimed. */
  const take = async (task) => {
    setBusy(task._id);
    try {
      await workspace.todos.update({ id: task._id, claim: true });
      setRows((current) => current.filter((row) => row._id !== task._id));
      /* The queue and the badge both change, so the dock is told rather than left stale. */
      await reload();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <Notice tone="warn">
        <p>Could not load what has been handed to you — {error.message}</p>
      </Notice>
    );
  }
  if (!rows?.length) return null;

  return (
    <section className="mt-6">
      {/*
        The card carries the warning tone of its contents rather than the neutral one every other
        panel uses. It is the one block on the screen that is somebody else's deadline.
      */}
      <div className="rounded-xl border border-warn-500/30 bg-warn-500/[0.06] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-bold tracking-tight text-warn-300">
            Handed to you <span className="text-warn-400/70">({rows.length})</span>
          </h2>
          <p className="text-sm text-steel-400">
            {plural(rows.length, 'job another department could not finish',
              'jobs other departments could not finish')}
          </p>
        </div>

        <ul className="mt-3 space-y-2.5">
          {rows.map((task) => (
            <li
              key={task._id}
              className="rounded-lg border border-line/[0.08] bg-ink-800/40 p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-steel-100">
                  {task.link ? (
                    <Link to={task.link} className="transition-colors hover:text-accent">
                      {task.title}
                    </Link>
                  ) : (
                    task.title
                  )}
                </p>
                <p className="text-xs font-bold uppercase tracking-wide text-warn-400">
                  from {departmentLabel(task.escalation?.from)}
                </p>
              </div>

              {/* The reason, in full and not truncated — it is the thing that says what to do,
                  and a reason somebody has to open the record to read saves nobody anything. */}
              {task.escalation?.reason && (
                <p className="mt-1.5 text-sm leading-relaxed text-steel-300">
                  {task.escalation.reason}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel-500">
                {task.escalation?.by?.name && <span>{task.escalation.by.name}</span>}
                {task.escalation?.at && <span>{formatDate(task.escalation.at)}</span>}
                {task.customer?.name && (
                  <Link
                    to={`/customers/${task.customer._id}`}
                    className="transition-colors hover:text-accent"
                  >
                    {task.customer.name}
                  </Link>
                )}
                {task.order?.number && (
                  <Link
                    to={`/orders/${task.order._id}`}
                    className="transition-colors hover:text-accent"
                  >
                    {task.order.number}
                  </Link>
                )}

                <button
                  type="button"
                  className="row-action ml-auto"
                  disabled={busy === task._id}
                  onClick={() => take(task)}
                >
                  {busy === task._id ? 'Taking…' : "I'll take it"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

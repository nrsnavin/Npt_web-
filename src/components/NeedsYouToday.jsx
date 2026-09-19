import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { workspace } from '../api/endpoints.js';
import { useWorkspace } from './dock/WorkspaceContext.jsx';
import { Notice } from './ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate, plural } from '../utils/format.js';

/**
 * What needs somebody in this department today [BLUEPRINT §25, §35].
 *
 * One card, two groups, and the grouping is the point. Both halves are unanswered work on the
 * same queue wanting the same response, so they belong in one block a person scans at nine
 * o'clock — a dashboard that answers "what now" in four warning-coloured cards answers it in
 * none.
 *
 * **Handed over** goes first: another department stopped on it and passed it here, so it has
 * already waited through somebody else's day.
 *
 * **Urgent on your queue** is high priority or past its date, unclaimed first — a job nobody
 * holds is the one at risk of being everybody's assumption.
 *
 * It empties as the work is picked up rather than as it is read. Taking a job clears it; there
 * is no "mark as seen", because that is a button people press to clear a badge. And it draws as
 * nothing at all when there is nothing — a card that says "none" every morning is a card people
 * stop reading, and then miss on the morning it is not empty.
 */

/**
 * One row, in either group.
 *
 * `from` is the handover's origin department when there is one. `why` is the sentence that came
 * with it, or the reason a priority was suggested — in both cases the thing that says what to do,
 * which is why it is never truncated.
 */
function Row({ task, onTake, busy }) {
  const handedOver = Boolean(task.escalation?.at);
  const suggested = task.prioritySuggested?.by;
  const late = task.dueDate && new Date(task.dueDate) < new Date().setHours(0, 0, 0, 0);

  return (
    <li className="rounded-lg border border-line/[0.08] bg-ink-800/40 p-3">
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

        {/*
          Where it came from *and* how urgent — not one or the other.

          These were an either/or, and the handover branch won, which hid the urgency label on
          exactly the rows that carry it: a priority only ever becomes "suggested" through the
          handover dialog, so an escalated row was the one place the distinction mattered and
          the one place it was not drawn.
        */}
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs font-bold uppercase tracking-wide">
          {handedOver && (
            <span className="text-warn-400">from {departmentLabel(task.escalation.from)}</span>
          )}
          {late && <span className="text-danger-400">Past its date</span>}
          {task.priority === 'high' && (
            /*
             * The distinction the whole feature rests on. "Urgent" is somebody's decision;
             * "suggested urgent" is a guess a person has not yet checked. Drawn in the quieter
             * colour, because a suggestion that shouts as loudly as a decision teaches people
             * to discount both.
             */
            <span className={suggested ? 'font-semibold text-steel-400' : 'text-warn-400'}>
              {suggested ? 'Suggested urgent' : 'Urgent'}
            </span>
          )}
        </p>
      </div>

      {/* Why, in full. A reason somebody has to open the record to read saves them nothing. */}
      {(task.escalation?.reason || task.prioritySuggested?.reason) && (
        <p className="mt-1.5 text-sm leading-relaxed text-steel-300">
          {task.escalation?.reason || task.prioritySuggested.reason}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel-500">
        {handedOver && task.escalation.by?.name && <span>{task.escalation.by.name}</span>}
        {handedOver && task.escalation.at && <span>{formatDate(task.escalation.at)}</span>}
        {!handedOver && task.dueDate && <span>Due {formatDate(task.dueDate)}</span>}
        {/* Whose it is, or that it is nobody's — the difference between a row somebody picks up
            and a row everybody assumes is covered. */}
        {task.user?.name ? (
          <span>{task.user.name}</span>
        ) : (
          <span className="font-semibold text-flame-400">Nobody has this</span>
        )}
        {task.customer?.name && (
          <Link
            to={`/customers/${task.customer._id}`}
            className="transition-colors hover:text-accent"
          >
            {task.customer.name}
          </Link>
        )}
        {/* The order number, as text. A task can still carry one — the server keeps sales
            orders — but this application has no screen to open, and a link to a route that
            does not exist is worse than a plain number. */}
        {task.order?.number && (
          <span className="text-steel-500">{task.order.number}</span>
        )}

        {!task.user && (
          <button
            type="button"
            className="row-action ml-auto"
            disabled={busy}
            onClick={() => onTake(task)}
          >
            {busy ? 'Taking…' : "I'll take it"}
          </button>
        )}
      </div>
    </li>
  );
}

export default function NeedsYouToday() {
  const { reload } = useWorkspace();
  const [groups, setGroups] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await workspace.todos.needsMe();
      setGroups(response.data || { handedOver: [], urgent: [], asked: [] });
      setMeta(response.meta || {});
      setError(null);
    } catch (failure) {
      /*
       * A person with no department has no queue, and the server says so quietly rather than
       * refusing. Anything else is worth a line, because a card that failed to load looks
       * exactly like a morning with nothing waiting.
       */
      if (failure?.status === 403 || failure?.status === 401) {
        setGroups({ handedOver: [], urgent: [], asked: [] });
      } else setError(failure);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Taking it is the acknowledgement, so the row leaves the card as soon as it is claimed. */
  const take = async (task) => {
    setBusy(task._id);
    try {
      await workspace.todos.update({ id: task._id, claim: true });
      setGroups((current) => ({
        ...current,
        handedOver: current.handedOver.filter((row) => row._id !== task._id),
        urgent: current.urgent.filter((row) => row._id !== task._id),
      }));
      /* The queue and the dock badge both change, so the dock is told rather than left stale. */
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
        <p>Could not load what needs you — {error.message}</p>
      </Notice>
    );
  }

  const handedOver = groups?.handedOver || [];
  const urgent = groups?.urgent || [];
  const asked = groups?.asked || [];
  const total = handedOver.length + urgent.length + asked.length;
  if (!total) return null;

  return (
    <section className="mt-6">
      {/*
        The card carries the warning tone of its contents rather than the neutral one every other
        panel uses. It is the one block on the screen that is a deadline rather than a report.
      */}
      <div className="rounded-xl border border-warn-500/30 bg-warn-500/[0.06] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-bold tracking-tight text-warn-300">
            Needs you today <span className="text-warn-400/70">({total})</span>
          </h2>
          <p className="text-sm text-steel-400">
            {meta.department ? `On the ${departmentLabel(meta.department).toLowerCase()} queue` : ''}
          </p>
        </div>

        {handedOver.length > 0 && (
          <div className="mt-3">
            <p className="eyebrow text-warn-400/80">
              {plural(handedOver.length, 'handed over', 'handed over')} — another department
              stopped on {handedOver.length === 1 ? 'it' : 'these'}
            </p>
            <ul className="mt-1.5 space-y-2.5">
              {handedOver.map((task) => (
                <Row key={task._id} task={task} onTake={take} busy={busy === task._id} />
              ))}
            </ul>
          </div>
        )}

        {urgent.length > 0 && (
          <div className="mt-4">
            <p className="eyebrow text-warn-400/80">
              {urgent.length} urgent or late on your own queue
            </p>
            <ul className="mt-1.5 space-y-2.5">
              {urgent.map((task) => (
                <Row key={task._id} task={task} onTake={take} busy={busy === task._id} />
              ))}
            </ul>
          </div>
        )}

        {/*
          Questions put to this department that nobody has answered [queries]. On this card
          rather than on one of their own, because they are the same kind of thing as the rows
          above: work sitting here that somebody outside is waiting on. A thread addressed to
          despatch and read by nobody in despatch is exactly the failure the module was built to
          end, and it would survive intact if the only way to find it were the Queries screen.

          No "take" button: a query is answered by replying to it, which needs the thread. The
          row is a way in, and it leaves this card the moment anybody replies.
        */}
        {asked.length > 0 && (
          <div className="mt-4">
            {/*
              "Query about a buyer", not "question": the despatch and production homes already
              have a Questions tile counting the questions put against a sales order, and two
              different things wearing the same word on one screen is a count nobody can read.
              This is the wording the module's own screen uses.
            */}
            <p className="eyebrow text-warn-400/80">
              {plural(asked.length, 'query about a buyer', 'queries about a buyer')} nobody has
              answered
            </p>
            <ul className="mt-1.5 space-y-2.5">
              {asked.map((query) => (
                <li
                  key={query._id}
                  className="rounded-lg border border-line/[0.08] bg-ink-900/40 px-3.5 py-3"
                >
                  <Link
                    to={`/queries/${query._id}`}
                    className="text-sm font-semibold text-steel-100 hover:text-accent"
                  >
                    {query.subject}
                  </Link>
                  <p className="mt-0.5 text-xs text-steel-400">
                    {query.customer?.name ? `${query.customer.name} · ` : ''}
                    asked by {query.raisedBy?.name || 'somebody'} on {formatDate(query.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

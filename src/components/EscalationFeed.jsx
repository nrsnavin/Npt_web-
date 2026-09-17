import { useCallback, useEffect, useState } from 'react';
import { escalations as escalationsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Notice } from './ui.jsx';
import Escalation from './Escalation.jsx';
import { plural } from '../utils/format.js';

/**
 * Every stopped order, on every department's day screen.
 *
 * The one thing that makes this feature work rather than being a second inbox: it is the *same*
 * list everywhere. A plant that cannot run for want of resin needs purchasing; a yard short of
 * paperwork needs accounts; neither of them can name the person who will actually fix it. A feed
 * narrowed to "what my department raised" would show each department its own problems and
 * nobody else's, which is the phone call with extra steps.
 *
 * So the only narrowing is the one that was already there: a marketing person sees escalations
 * on the orders they own, because an escalation carries the order number and the customer's name
 * and §29 does not stop applying because the record is an alarm. The serving departments see the
 * whole plant, which is what they are for.
 *
 * Drawn as nothing at all when nothing is stopped. A panel that says "no escalations" every
 * morning is a panel people learn to scroll past, and then do not see the morning it is not
 * empty.
 */
export default function EscalationFeed({ limit = 6, title = 'Orders that have stopped' }) {
  const { user, canRead } = useAuth();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  /*
   * Not every department holds the escalations grant, and this panel is dropped onto several
   * day screens that a reader without it can legitimately open. Asked anyway, the server
   * refused, and the panel below announced the refusal as a failure — "Could not load what has
   * stopped" on a screen somebody sees every morning, about a list that is simply not theirs.
   * A warning that is always there and never actionable is the one people stop reading, and
   * then miss on the day it means something.
   */
  /* `orders`, because that is the grant the feed's route is actually behind — an escalation is
     a fact about an order, and the server guards it as one. Guessing a module named after the
     feature would have been a check that never refuses anything. */
  const mine = canRead('orders');

  const load = useCallback(async () => {
    if (!mine) return;
    setError(null);
    try {
      const response = await escalationsApi.feed({ limit: 50 });
      setRows(response.data || []);
      setMeta(response.meta || {});
    } catch (loadError) {
      /* A refusal is not a failure. The grant can also be withdrawn between this render and
         the reply, so the status is checked here as well as before the call. */
      if (loadError?.status === 403 || loadError?.status === 401) setRows([]);
      else setError(loadError);
    }
  }, [mine]);

  useEffect(() => {
    load();
  }, [load]);

  if (!mine) return null;

  /* Silent while loading and silent when clear — see the note above. A genuine error is worth a
     line, because a feed that failed to load looks exactly like a plant with nothing wrong. */
  if (error) {
    return (
      <Notice tone="warn">
        <p>Could not load what has stopped — {error.message}</p>
      </Notice>
    );
  }
  if (!rows?.length) return null;

  const shown = showAll ? rows : rows.slice(0, limit);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-bold tracking-tight text-steel-50">
          {title} <span className="text-steel-400">({meta.open ?? rows.length})</span>
        </h2>
        {/* The two counts worth leading with: how many have actually stopped, and how many are
            being looked to this department to clear. */}
        <p className="text-sm text-steel-400">
          {meta.blocking > 0 && (
            <span className="font-bold text-danger-400">
              {plural(meta.blocking, 'has stopped work', 'have stopped work')}
            </span>
          )}
          {meta.blocking > 0 && meta.onUs > 0 ? ' · ' : ''}
          {meta.onUs > 0 && (
            <span className="font-bold text-accent">{meta.onUs} waiting on you</span>
          )}
        </p>
      </div>

      <p className="mt-0.5 text-sm text-steel-400">
        Raised by whoever hit the problem. Anyone can say what they did;{' '}
        {user?.department ? 'the department that raised it' : 'whoever raised it'} closes it.
      </p>

      <ul className="mt-3 space-y-3">
        {shown.map((row) => (
          <Escalation key={row._id} row={row} onChanged={load} />
        ))}
      </ul>

      {rows.length > limit && (
        <button
          type="button"
          className="btn-ghost mt-3"
          onClick={() => setShowAll((was) => !was)}
        >
          {showAll ? 'Show fewer' : `Show the other ${rows.length - limit}`}
        </button>
      )}
    </section>
  );
}

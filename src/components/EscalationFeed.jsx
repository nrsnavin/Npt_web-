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
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await escalationsApi.feed({ limit: 50 });
      setRows(response.data || []);
      setMeta(response.meta || {});
    } catch (loadError) {
      setError(loadError);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Silent while loading and silent when clear — see the note above. An error is worth a line,
     because a feed that failed to load looks exactly like a plant with nothing wrong. */
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

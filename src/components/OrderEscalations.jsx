import { useCallback, useEffect, useState } from 'react';
import { escalations as escalationsApi } from '../api/endpoints.js';
import { Notice, Section } from './ui.jsx';
import Escalation from './Escalation.jsx';
import RaiseEscalation from './RaiseEscalation.jsx';

/**
 * What has stopped this order, on the order's own screen.
 *
 * The entry point for the two departments the feature exists for. Production and despatch work
 * from their day screens, but the moment they need to *raise* one they are looking at an order —
 * the line that will not run, the consignment that cannot be loaded — and a button somewhere
 * else is a button nobody finds at the moment they need it.
 *
 * Offered to anybody who can read the order rather than to two named departments. Quality
 * holding a line, order confirmation finding the specification is unanswerable, accounts seeing
 * a credit block — all of them are the same event from a different desk, and a rule listing two
 * departments would send the rest back to the telephone this replaces. The server draws the same
 * line, through the order's own read grant.
 *
 * Resolved ones stay, below the open ones. An order that stopped twice for the same reason is a
 * fact worth being able to see, and the resolution sentence is the only record of what actually
 * fixed it last time.
 */
export default function OrderEscalations({ order }) {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({});
  const [raising, setRaising] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await escalationsApi.onOrder(order._id);
      setRows(response.data || []);
      setMeta(response.meta || {});
    } catch (loadError) {
      setError(loadError);
      setRows([]);
    }
  }, [order._id]);

  useEffect(() => {
    load();
  }, [load]);

  const open = meta.open || 0;

  return (
    <Section
      title={open ? `Stopped — ${open} open` : 'Escalations'}
      actions={
        <button
          type="button"
          className="row-action"
          onClick={() => setRaising(true)}
        >
          Escalate this order
        </button>
      }
    >
      {rows === null && <p className="text-sm text-steel-500">Loading…</p>}

      {rows?.length === 0 && (
        <p className="text-sm text-steel-500">
          Nothing has stopped this order. Raise one if it cannot move — every department&rsquo;s
          day screen picks it up, and whoever owns the order is told.
        </p>
      )}

      {rows?.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row) => (
            <Escalation key={row._id} row={row} onChanged={load} showOrder={false} />
          ))}
        </ul>
      )}

      {error && <Notice tone="danger"><p>{error.message}</p></Notice>}

      <RaiseEscalation
        order={raising ? order : null}
        onClose={() => setRaising(false)}
        onRaised={() => { setRaising(false); load(); }}
      />
    </Section>
  );
}

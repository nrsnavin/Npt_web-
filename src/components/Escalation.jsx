import { useState } from 'react';
import { Link } from 'react-router-dom';
import { escalations as escalationsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Notice } from './ui.jsx';
import { formatDate, humanise, plural } from '../utils/format.js';

/**
 * One stopped order, on whichever screen is reading it.
 *
 * One component for the plant, the yard, the office and the order page, for the same reason the
 * urgent-order card is one component: they are all looking at the same problem, and two of them
 * would drift. The way they would drift is the way that matters — one screen calling an order
 * stopped while another shows it cleared is the disagreement the feature exists to remove.
 *
 * **Anybody can say what they did; only the department that stopped says it is over.** The fix
 * usually comes from somebody the raiser could not have named, so the update box is open to
 * everyone who can read the order. Resolving is not: it is a claim about the world — the resin
 * arrived, the tool is back — and purchasing believing the drum was delivered is not the plant
 * being able to run. The button is simply absent for everybody else, with a line saying why, so
 * nobody presses it and reads the refusal afterwards.
 */

/** Saying what you did. One sentence, in place, because a page load is not worth it. */
function Update({ escalation, onSaved }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await escalationsApi.update({ id: escalation._id, body: body.trim() });
      setBody('');
      onSaved();
    } catch (sendError) {
      setError(sendError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="mt-2 flex flex-wrap gap-2">
      <input
        className="input min-w-0 flex-1"
        placeholder="What did you do about it?"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <button type="submit" className="btn-secondary" disabled={busy || body.trim().length < 2}>
        {busy ? 'Adding…' : 'Add an update'}
      </button>
      {error && <Notice tone="danger"><p>{error.message}</p></Notice>}
    </form>
  );
}

/** Closing it, which asks what was actually done rather than offering a tick. */
function Resolve({ escalation, onClose, onSaved }) {
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await escalationsApi.resolve({ id: escalation._id, resolution: resolution.trim() });
      onSaved();
    } catch (resolveError) {
      setError(resolveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-success-500/30 bg-success-500/[0.04] p-3">
      <p className="text-sm font-bold text-steel-100">What sorted it?</p>
      <p className="mt-0.5 text-xs text-steel-400">
        The next person to hit this reads your sentence. &ldquo;Fixed&rdquo; tells them nothing.
      </p>
      <textarea
        rows={2}
        className="input mt-2"
        placeholder="Drum landed Wednesday — press 3 is running it now"
        value={resolution}
        onChange={(event) => setResolution(event.target.value)}
      />
      {error && <div className="mt-2"><Notice tone="danger"><p>{error.message}</p></Notice></div>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || resolution.trim().length < 5}>
          {busy ? 'Closing…' : 'Mark it resolved'}
        </button>
      </div>
    </form>
  );
}

export default function Escalation({ row, onChanged, showOrder = true }) {
  const { user } = useAuth();
  const [resolving, setResolving] = useState(false);

  const open = row.status === 'open';
  const blocking = row.severity === 'blocking';

  /*
   * Who may close it, worked out the same way the server does. A button that appears for
   * everybody and refuses most of them teaches people to press and read afterwards.
   */
  const mayResolve =
    open &&
    (String(row.raisedBy?._id || row.raisedBy) === String(user?.id) ||
      row.raisedByDepartment === user?.department ||
      user?.role === 'admin');

  const tone = !open
    ? 'border-line/10 bg-line/[0.02]'
    : blocking
      ? 'border-danger-500/40 bg-danger-500/[0.04]'
      : 'border-warn-500/40 bg-warn-500/[0.04]';

  return (
    <li className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-base font-bold text-steel-50">{row.kindLabel}</p>
        <p
          className={`text-sm font-bold ${
            !open ? 'text-success-400' : blocking ? 'text-danger-400' : 'text-warn-400'
          }`}
        >
          {!open ? 'Resolved' : blocking ? 'Work has stopped' : 'Will bite'}
        </p>
      </div>

      {/* The order, unless the card is already on the order's own screen. */}
      {showOrder && row.order && (
        <p className="mt-1 text-sm text-steel-300">
          <Link to={`/orders/${row.order._id}`} className="transition-colors hover:text-accent">
            {row.order.number}
          </Link>
          {row.order.customer?.name ? ` · ${row.order.customer.name}` : ''}
          {row.order.deliveryDate ? ` · promised ${formatDate(row.order.deliveryDate)}` : ''}
        </p>
      )}

      <p className="mt-2 text-sm text-steel-200">{row.detail}</p>

      <p className="mt-1.5 text-xs text-steel-500">
        {row.raisedBy?.name || 'Somebody'}
        {row.raisedByDepartment ? ` (${humanise(row.raisedByDepartment)})` : ''} ·{' '}
        {row.ageDays === 0 ? 'today' : `${plural(row.ageDays, 'day')} ago`}
        {row.number ? ` · ${row.number}` : ''}
        {row.dispatch?.number ? ` · about ${row.dispatch.number}` : ''}
      </p>

      {/* Who was named, when anybody was. Shown to everyone rather than only to them: an order
          waiting on accounts is something the plant is entitled to see it is waiting on. */}
      {open && row.needsFrom && (
        <p
          className={`mt-2 text-sm font-bold ${
            row.needsFrom === user?.department ? 'text-accent' : 'text-steel-300'
          }`}
        >
          {row.needsFrom === user?.department
            ? 'Yours to clear'
            : `Waiting on ${humanise(row.needsFrom)}`}
        </p>
      )}

      {/* What has been done so far, so three people do not ring the same supplier. */}
      {row.updates?.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {row.updates.map((entry) => (
            <li
              key={entry._id}
              className="rounded-lg border border-line/[0.08] bg-line/[0.03] px-3 py-2 text-sm text-steel-200"
            >
              <span className="font-bold text-steel-100">
                {entry.by?.name || 'Somebody'}
                {entry.byDepartment ? ` (${humanise(entry.byDepartment)})` : ''}:
              </span>{' '}
              {entry.body}
            </li>
          ))}
        </ul>
      )}

      {!open && row.resolution && (
        <p className="mt-3 rounded-lg border border-success-500/30 bg-success-500/[0.05] px-3 py-2 text-sm text-steel-200">
          <span className="font-bold text-success-400">
            {row.resolvedBy?.name || 'Resolved'}
            {row.resolvedAt ? ` · ${formatDate(row.resolvedAt)}` : ''}:
          </span>{' '}
          {row.resolution}
        </p>
      )}

      {open && <Update escalation={row} onSaved={onChanged} />}

      {open && !resolving && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/[0.06] pt-3">
          {mayResolve ? (
            <button type="button" className="btn-secondary" onClick={() => setResolving(true)}>
              Mark it resolved
            </button>
          ) : (
            /* Said rather than shown as a disabled button: "you may not" with no explanation
               reads as a broken screen, and the sentence is the whole instruction. */
            <p className="text-xs text-steel-500">
              {humanise(row.raisedByDepartment || 'whoever raised it')} closes this one — add an
              update and they will.
            </p>
          )}
          {showOrder && row.order && (
            <Link to={`/orders/${row.order._id}`} className="btn-ghost">Open the order</Link>
          )}
        </div>
      )}

      {resolving && (
        <Resolve
          escalation={row}
          onClose={() => setResolving(false)}
          onSaved={() => { setResolving(false); onChanged(); }}
        />
      )}
    </li>
  );
}

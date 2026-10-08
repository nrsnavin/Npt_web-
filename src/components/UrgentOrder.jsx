import { useState } from 'react';
import { Link } from 'react-router-dom';
import { orderQueries as queriesApi } from '../api/endpoints.js';
import { Notice } from './ui.jsx';
import RaiseConcern from './RaiseConcern.jsx';
import { formatDate, formatNumber, humanise } from '../utils/format.js';

/**
 * An order somebody escalated, on whichever screen is reading it [§29].
 *
 * One component for the yard and the plant, because they are looking at the same order and the
 * only thing that differs is which half is theirs. Two components would drift, and the way they
 * would drift is the way that matters: one screen calling an order blocked on production while
 * the other calls it ready to load is the disagreement the whole feature exists to remove.
 *
 * So the card takes `mine` — the department reading it — and says the same facts from that
 * angle. "Production's to clear" on the yard's screen is "Yours to clear" on the plant's, and
 * it is the same sentence underneath.
 *
 * **The exchange rides on the card.** Whatever has been asked about this order and whatever came
 * back is shown here rather than on the department's own queue alone. Each screen holding only
 * its own half is how the same question gets asked twice in a morning — despatch chasing an
 * answer production gave an hour ago, to somebody else.
 */

/** Answering in place, because the answer is one sentence and a page load is not worth it. */
function Answer({ query, orderId, onAnswered }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await queriesApi.answer({ orderId, queryId: query._id, body: body.trim() });
      setBody('');
      onAnswered();
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
        placeholder="Answer it — a sentence is enough"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <button type="submit" className="btn-primary" disabled={busy || body.trim().length < 2}>
        {busy ? 'Sending…' : 'Send answer'}
      </button>
      {error && <Notice tone="danger"><p>{error.message}</p></Notice>}
    </form>
  );
}

/** One question on the order, and the last thing said about it. */
function Thread({ query, orderId, canAnswer, onAnswered }) {
  return (
    <li className="rounded-lg border border-line/[0.08] bg-line/[0.03] px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-bold text-steel-100">
          {query.by || 'Somebody'}
          {query.byDepartment ? ` (${humanise(query.byDepartment)})` : ''} → {humanise(query.askedOf)}
        </p>
        {query.isOverdue && query.status === 'open' && (
          <p className="text-xs font-semibold text-danger-400">Past the time promised</p>
        )}
      </div>

      <p className="mt-1 text-sm text-steel-200">{query.question}</p>

      {query.latestAnswer ? (
        <p className="mt-1.5 text-sm text-steel-300">
          <span className="font-bold text-steel-100">{query.latestAnswer.by || 'Answered'}:</span>{' '}
          {query.latestAnswer.body}
        </p>
      ) : (
        /* Only the department being asked can answer, which the server enforces too — offering
           the box to everybody would collect answers the save then refuses. */
        canAnswer && <Answer query={query} orderId={orderId} onAnswered={onAnswered} />
      )}
    </li>
  );
}

export default function UrgentOrder({ row, mine, onRaise, onAnswered }) {
  const critical = row.priority === 'critical';
  const ours = row.blockedBy === mine;
  const [raising, setRaising] = useState(false);

  /* The three parts are the whole order between them, so they scale against their own sum
     rather than against the ordered quantity — which the card does not carry, and which would
     leave the bar empty on an order whose lines were cut. */
  const total = (row.gone || 0) + (row.free || 0) + (row.toMake || 0);
  const share = (part) => (total > 0 ? ((part || 0) / total) * 100 : 0);

  return (
    <li
      className={`rounded-xl border p-4 ${
        critical ? 'border-danger-500/40 bg-danger-500/[0.04]' : 'border-warn-500/40 bg-warn-500/[0.04]'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-base font-bold text-steel-50">
          {row.customer?.name || 'Customer not named'}
        </p>
        <p className={`text-sm font-bold ${critical ? 'text-danger-400' : 'text-warn-400'}`}>
          {critical ? 'Critical' : 'Pulled forward'}
        </p>
      </div>

      <p className="mt-1 text-sm text-steel-300">
        <Link to={row.link} className="transition-colors hover:text-accent">{row.number}</Link>
        {row.deliveryDate ? ` · promised ${formatDate(row.deliveryDate)}` : ''}
        {row.owner ? ` · ${row.owner}` : ''}
      </p>

      {/* Who asked and why. A flag whose author is visible is a flag people set carefully, and
          the department being asked to reorder its day is entitled to the argument. */}
      {row.priorityReason && (
        <p className="mt-2 rounded-lg border border-line/[0.08] bg-line/[0.03] px-3 py-2 text-sm text-steel-200">
          <span className="font-bold text-steel-100">{row.priorityBy || 'Marketing'}:</span>{' '}
          {row.priorityReason}
        </p>
      )}

      {/*
        The same fact from the reader's angle. "Production's to clear" and "Yours to clear" are
        one sentence written twice, and the second is the one that makes somebody act.
      */}
      <p className={`mt-2 text-base font-bold ${ours ? 'text-accent' : 'text-steel-100'}`}>
        {row.blockerLabel}
        {ours ? ' — yours to clear' : row.blockedBy ? ` — ${humanise(row.blockedBy)}'s to clear` : ''}
      </p>
      {row.why?.map((line) => (
        <p key={line} className="mt-1 text-sm text-steel-300">{line}</p>
      ))}

      {/* What is already being asked about it, so nobody asks it again. */}
      {row.questions?.length > 0 && (
        <ul className="mt-3 space-y-2">
          {row.questions.map((query) => (
            <Thread
              key={query._id}
              query={query}
              orderId={row._id}
              canAnswer={query.askedOf === mine}
              onAnswered={onAnswered}
            />
          ))}
        </ul>
      )}

      {/*
        Where the order's pieces are, as a bar of three parts.

        This was "0 gone · 0 free · 4,000 to make" — three numbers whose nouns only mean
        something to somebody who already knows the shape of the answer. Named in full and drawn
        to scale, it says the thing the reader actually wants: how much of this order has left
        the building, and how much has not been made yet.
      */}
      <div className="mt-3 border-t border-line/[0.06] pt-3">
        <div
          className="flex h-1.5 overflow-hidden rounded-full bg-line/[0.08]"
          role="img"
          aria-label={`${formatNumber(row.gone)} of ${formatNumber(total)} pieces despatched, ${formatNumber(row.free)} packed and free, ${formatNumber(row.toMake)} still to make`}
        >
          <div className="bg-success-500" style={{ width: `${share(row.gone)}%` }} />
          <div className="bg-aqua-500" style={{ width: `${share(row.free)}%` }} />
        </div>
        <p className="mt-1.5 text-sm text-steel-400">
          {formatNumber(row.gone)} despatched · {formatNumber(row.free)} packed and free ·{' '}
          {formatNumber(row.toMake)} still to make
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {/* Offered whoever the blocker is: "nothing is holding it" is the screen's reading,
            and the person standing in the bay may know better. */}
        {onRaise !== false && (
          <button type="button" className="btn-secondary" onClick={() => setRaising(true)}>
            {row.questions?.length ? 'Ask something else' : 'Raise a concern'}
          </button>
        )}
        <Link to={row.link} className="btn-ghost">Open it</Link>
      </div>

      <RaiseConcern
        order={raising ? row : null}
        onClose={() => setRaising(false)}
        onRaised={() => { setRaising(false); onAnswered(); }}
      />
    </li>
  );
}

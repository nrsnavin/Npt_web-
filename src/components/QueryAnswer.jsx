import { useState } from 'react';
import { Link } from 'react-router-dom';
import { orderQueries } from '../api/endpoints.js';

/**
 * A question put to your department, answerable where you read it.
 *
 * Shared by every department's front page rather than copied into each, because the whole value
 * of a typed query over a WhatsApp message is that one loop governs all of them: somebody asks,
 * somebody named answers, and the asker is told. Two implementations of that would be two
 * loops, and the second one to be written is the one that quietly forgets to tell anybody.
 *
 * **Answering in place** is the part that earns its keep. The department knows the answer at the
 * moment it reads the question — "Friday, 20,000 of it", "LR-88213, left the yard at four" — and
 * a screen that sends them elsewhere to type it is a screen where the question waits another
 * day. That was the failure the query thread was built to fix, so the answer box goes where the
 * question is.
 *
 * `subject` is whatever the asking department needs named beside the order: the plant needs
 * nothing beyond it, despatch needs the lorry, because "where is the vehicle" on an order
 * already sent in three loads is unanswerable without knowing which.
 */
export default function QueryAnswer({ query, onAnswered }) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const send = async (event) => {
    event.preventDefault();
    if (!body.trim()) return;

    setSaving(true);
    setError(null);
    try {
      await orderQueries.answer({ orderId: query.order._id, queryId: query._id, body });
      setBody('');
      onAnswered();
    } catch (answerError) {
      setError(answerError);
    } finally {
      setSaving(false);
    }
  };

  const asker = query.raisedBy?.name?.split(' ')[0] || 'They';

  return (
    <li
      className={`rounded-xl border p-4 ${
        query.isOverdue ? 'border-danger-500/40 bg-danger-500/[0.04]' : 'border-line/10'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-base font-bold text-steel-50">{query.raisedBy?.name} asks</p>
        {query.isOverdue && (
          <p className="text-sm font-bold text-danger-400">
            Waiting {query.waitingHours} hours — past its promise
          </p>
        )}
      </div>

      <p className="mt-1 text-sm text-steel-300">
        About{' '}
        <Link to={`/orders/${query.order?._id}`} className="font-semibold text-accent hover:underline">
          {query.order?.number}
        </Link>
        {query.order?.customer?.name ? ` · ${query.order.customer.name}` : ''}
        {/* The consignment, when the question named one. Without it despatch answers about
            whichever load they assume, and a confident answer about the wrong lorry is worse
            than none — it gets relayed to the buyer. */}
        {query.dispatch?.number && (
          <>
            {' · '}
            <Link
              to={`/dispatches/${query.dispatch._id}`}
              className="font-semibold text-accent hover:underline"
            >
              {query.dispatch.number}
            </Link>
            {query.dispatch.transporter ? ` · ${query.dispatch.transporter}` : ''}
          </>
        )}
      </p>

      <p className="mt-3 text-base text-steel-100">{query.question}</p>

      <form onSubmit={send} className="mt-3 flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          placeholder="Answer it — a sentence is enough"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-label={`Answer ${query.number}`}
        />
        <button type="submit" className="btn-primary" disabled={saving || !body.trim()}>
          {saving ? 'Sending…' : 'Send answer'}
        </button>
      </form>
      {/* Said out loud, because otherwise the answerer assumes nobody was told and rings them. */}
      <p className="mt-1.5 text-xs text-steel-400">{asker} gets told as soon as you send it.</p>

      {error && <p className="mt-2 text-sm text-danger-400">{error.message}</p>}
    </li>
  );
}

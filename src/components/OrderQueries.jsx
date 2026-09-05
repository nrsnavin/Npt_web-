import { useCallback, useEffect, useState } from 'react';
import { orderQueries as queriesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Modal, Notice, Section } from './ui.jsx';
import { formatDate, humanise } from '../utils/format.js';

/**
 * The questions asked against one order, on the order itself.
 *
 * This is what replaces the WhatsApp message, and the design follows from why that fails.
 * A message is not hard to send — it is that nobody owns it and nothing chases it, and the
 * exchange lives in one person's phone so the next person to ask asks again. So three things
 * here are not decoration:
 *
 * **Unanswered comes first, and says how long it has been waiting.** Sorting by date alone
 * buries Tuesday's unanswered question under three of this morning's closed ones, which is
 * exactly the failure being fixed. The server orders them; this screen leads with the wait.
 *
 * **Answered and closed are drawn differently, because they are different.** A question the
 * plant answered is still the asker's to close, and a thread sitting in `answered` is somebody
 * saying "that did not actually answer it" waiting to happen.
 *
 * **Anyone reading the order can answer one put to their department.** No permission chrome:
 * if you can open the order you can join the conversation about it, which is the whole reason
 * the conversation is here rather than in a phone.
 */

const TONE = {
  open: 'text-warn-400',
  answered: 'text-aqua-300',
  closed: 'text-steel-500',
};

/** How long it has been waiting, in the words somebody would use out loud. */
const waited = (hours) => {
  if (hours === null || hours === undefined) return null;
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h waiting`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} waiting`;
};

function Thread({ query, orderId, onChanged, me }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const mine = String(query.raisedBy?._id || query.raisedBy) === String(me?.id);
  const settled = query.status === 'closed';

  const send = async (event) => {
    event.preventDefault();
    if (!answer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await queriesApi.answer({ orderId, queryId: query._id, body: answer }));
      setAnswer('');
    } catch (sendError) {
      setError(sendError);
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await queriesApi.close({ orderId, queryId: query._id }));
    } catch (closeError) {
      setError(closeError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className={`rounded-lg border p-3.5 ${
        query.status === 'open' ? 'border-warn-500/25 bg-warn-500/[0.04]' : 'border-line/[0.07]'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-steel-100">
          {query.question}
        </p>
        <span className={`text-[0.6875rem] font-semibold uppercase tracking-wide ${TONE[query.status]}`}>
          {query.status === 'answered' ? 'Answered — yours to close' : humanise(query.status)}
        </span>
      </div>

      <p className="mt-1 text-xs text-steel-500">
        {query.number} · {query.raisedBy?.name || 'Somebody'} asked {humanise(query.askedOf)}
        {/* The clock, which is the whole difference between this and a message. */}
        {query.status === 'open' && (
          <>
            {' · '}
            <span className={query.overdue || query.isOverdue ? 'text-danger-400' : ''}>
              {waited(query.waitingHours)}
            </span>
          </>
        )}
        {query.urgency === 'urgent' && <span className="text-danger-400"> · urgent</span>}
      </p>

      {query.answers?.length > 0 && (
        <ol className="mt-3 space-y-2 border-l border-line/[0.08] pl-3">
          {query.answers.map((entry) => (
            <li key={entry._id}>
              <p className="text-sm text-steel-200">{entry.body}</p>
              <p className="text-[0.6875rem] text-steel-500">
                {entry.by?.name || 'Somebody'}
                {entry.by?.department ? ` · ${humanise(entry.by.department)}` : ''}
                {' · '}
                {formatDate(entry.at)}
              </p>
            </li>
          ))}
        </ol>
      )}

      {!settled && (
        <form onSubmit={send} className="mt-3 flex flex-wrap items-end gap-2">
          <input
            className="input flex-1 min-w-[12rem]"
            placeholder="Answer this…"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            disabled={busy}
          />
          <button type="submit" className="btn-secondary" disabled={busy || !answer.trim()}>
            Answer
          </button>
          {/*
            Only the asker, because `answered` and `closed` are two people's judgements. The
            server refuses anyone else, so offering the button to them would be offering a
            refusal.
          */}
          {mine && query.answers?.length > 0 && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={close}>
              That answers it
            </button>
          )}
        </form>
      )}

      {settled && query.closedBy && (
        <p className="mt-2 text-[0.6875rem] text-steel-500">
          Closed by {query.closedBy.name} on {formatDate(query.closedAt)}
        </p>
      )}

      {error && <Notice tone="danger"><p>{error.message}</p></Notice>}
    </li>
  );
}

function AskForm({ order, onClose, onAsked, departments }) {
  const [values, setValues] = useState({
    askedOf: 'production',
    question: '',
    urgency: 'normal',
    line: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onAsked(
        await queriesApi.raise({
          orderId: order._id,
          askedOf: values.askedOf,
          question: values.question,
          urgency: values.urgency,
          line: values.line || undefined,
        })
      );
      onClose();
    } catch (askError) {
      setError(askError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Ask" hint="The department that owes the answer, not a person">
        <select className="input" value={values.askedOf} onChange={set('askedOf')}>
          {departments.map((department) => (
            <option key={department.key} value={department.key}>{department.label}</option>
          ))}
        </select>
      </Field>

      {/*
        Which model, on a multi-model order. "When will line 2 be ready" is unanswerable
        without it, and a question about the whole order is a real and common answer.
      */}
      {order.lines?.length > 1 && (
        <Field label="About" hint="One model, or the order as a whole">
          <select className="input" value={values.line} onChange={set('line')}>
            <option value="">The whole order</option>
            {order.lines.map((line) => (
              <option key={line._id} value={line._id}>
                {line.modelNumber || line.mould?.mouldCode || 'Unnamed model'}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="What do you need to know?">
        <textarea
          rows={3}
          className="input"
          autoFocus
          placeholder="When will the first 20,000 be ready to dispatch?"
          value={values.question}
          onChange={set('question')}
        />
      </Field>

      <Field label="How soon" hint="Urgent means an answer is chased in four hours rather than a day">
        <select className="input" value={values.urgency} onChange={set('urgency')}>
          <option value="normal">Normal — within a day</option>
          <option value="urgent">Urgent — the buyer is waiting</option>
        </select>
      </Field>

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
          {error.details?.map((detail) => (
            <p key={detail.field} className="text-xs">{detail.field}: {detail.message}</p>
          ))}
        </Notice>
      )}

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || values.question.trim().length < 3}>
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </div>
    </form>
  );
}

export default function OrderQueries({ order }) {
  const { user } = useAuth();
  const [queries, setQueries] = useState(null);
  const [meta, setMeta] = useState({ open: 0, overdue: 0 });
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await queriesApi.list(order._id);
      setQueries(response.data);
      setMeta(response.meta || { open: 0, overdue: 0 });
    } catch (loadError) {
      setError(loadError);
      setQueries([]);
    }
  }, [order._id]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Reload rather than splice the changed thread in. The server decides the order — unanswered
   * first — and re-sorting it here would be a second implementation of that rule, which is how
   * a panel comes to disagree with the API about what is urgent.
   */
  const changed = () => load();

  /** Every department, so a question can go to whoever actually holds the answer. */
  const departments = (user?.departments || [
    { key: 'production', label: 'Production' },
    { key: 'order_confirmation', label: 'Order confirmation' },
    { key: 'despatch', label: 'Despatch' },
    { key: 'quality', label: 'Quality' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'sampling', label: 'Sample team' },
    { key: 'marketing', label: 'Marketing' },
  ]);

  return (
    <Section
      title="Questions"
      actions={
        <div className="flex items-center gap-3">
          {meta.open > 0 && (
            <span className={`text-xs tabular-nums ${meta.overdue ? 'text-danger-400' : 'text-warn-400'}`}>
              {meta.open} waiting{meta.overdue ? ` · ${meta.overdue} overdue` : ''}
            </span>
          )}
          <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => setAsking(true)}>
            Ask
          </button>
        </div>
      }
    >
      {queries === null && <p className="text-sm text-steel-500">Loading…</p>}

      {queries?.length === 0 && (
        <p className="text-sm text-steel-500">
          Nothing has been asked about this order. A question here goes to a department and is
          chased if it is not answered &mdash; unlike one sent over WhatsApp.
        </p>
      )}

      {queries?.length > 0 && (
        <ul className="space-y-2.5">
          {queries.map((query) => (
            <Thread
              key={query._id}
              query={query}
              orderId={order._id}
              onChanged={changed}
              me={user}
            />
          ))}
        </ul>
      )}

      {error && <Notice tone="danger"><p>{error.message}</p></Notice>}

      <Modal
        open={asking}
        title="Ask about this order"
        description={`${order.number} · goes to a department, and is chased if it is not answered`}
        onClose={() => setAsking(false)}
      >
        <AskForm
          order={order}
          departments={departments}
          onClose={() => setAsking(false)}
          onAsked={changed}
        />
      </Modal>
    </Section>
  );
}

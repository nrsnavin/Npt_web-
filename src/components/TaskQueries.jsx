import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { taskQueries } from '../api/endpoints.js';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDateTime } from '../utils/format.js';
import { Notice } from './ui.jsx';
import CustomerName from './CustomerName.jsx';
import SubjectPicker, { forgetQuerySubjects } from './SubjectPicker.jsx';

/**
 * Queries on a task or an enquiry [server: services/taskQuery.service.js]. The team working a
 * task asks the person who raised it — its creator, else the enquiry's marketing person, else
 * Admin — and the answer comes back onto the task, for the team to carry on with. On an enquiry,
 * anybody working it asks its marketing person.
 *
 *   QueryCard      one question and its thread: answer (whoever was asked, Admin), follow up
 *                  (the team that asked), close (the team that asked, Admin), Got it on an answer
 *   TaskQueries    the questions on one task, and Ask a query for the team working it
 *   EnquiryQueries the questions on an enquiry and its tasks, and Ask a query
 */

const STATE = {
  open: { label: 'Waiting for an answer', tone: 'text-warn-400 bg-warn-500/10' },
  answered: { label: 'Answered', tone: 'text-success-400 bg-success-500/10' },
  closed: { label: 'Closed', tone: 'text-steel-400 bg-line/[0.06]' },
};

/** "Priya (SO Team) → Nandhini" — who asked, for which team, and who it went to. */
const whoAsked = (query) => {
  const team = query.department ? ` (${departmentLabel(query.department)})` : '';
  return `${query.askedBy?.name || 'Someone'}${team} → ${query.to?.name || 'Admin'}`;
};

export function QueryCard({ query, onChanged, showWhere = false }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const state = STATE[query.status] || STATE.open;
  /* Somebody may be both (Admin asking): answering is what the box does for whoever was asked. */
  const answering = query.mayAnswer && !query.mayFollowUp;
  /* The answer box while it waits; once answered, the asking side follows up and it is open again. */
  const mayWrite = answering ? query.status === 'open' : query.mayFollowUp;
  /* "PO & SO" — the task's own name, its title without the enquiry and buyer the line already shows. */
  const taskName = query.task?.title ? query.task.title.split(' — ')[0] : '';
  const run = (call) => async (event) => {
    event?.preventDefault?.();
    setBusy(true);
    setProblem(null);
    try {
      await call();
      setText('');
      onChanged?.();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const enquiryId = query.enquiry?._id || query.enquiry;
  return (
    <article aria-label={`Query: ${query.question}`} className={`rounded-xl border p-3 ${query.status === 'open' && query.mayAnswer ? 'border-warn-500/40 bg-warn-500/[0.07]' : 'border-line/[0.1] bg-line/[0.02]'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-steel-50">
          {whoAsked(query)}
          {showWhere && (
            <span className="font-normal text-steel-400">
              {taskName ? ` · ${taskName}` : ''}
              {enquiryId && query.enquiry?.number ? <> · <Link to={`/enquiries/${enquiryId}`} className="text-accent hover:underline">{query.enquiry.number}</Link></> : ''}
              {query.customer?.name ? <> · <CustomerName name={query.customer.name} /></> : ''}
            </span>
          )}
        </p>
        <span className="flex flex-wrap items-center gap-1.5">
          {query.subject && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">{query.subject}</span>}
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${state.tone}`}>{state.label}</span>
        </span>
      </div>
      <ol className="mt-2 space-y-1.5">
        {(query.messages || []).map((message) => (
          <li key={message._id} className={`rounded-lg px-2.5 py-1.5 text-sm ${message.side === 'answer' ? 'bg-success-500/[0.08] text-steel-50' : 'bg-line/[0.04] text-steel-100'}`}>
            <span className={`font-semibold ${message.side === 'answer' ? 'text-success-400' : 'text-steel-300'}`}>
              {message.side === 'answer' ? 'Answer' : 'Asked'}:
            </span>{' '}
            <span className="whitespace-pre-line">{message.body}</span>
            <span className="block text-xs text-steel-500">{message.by?.name || ''}{message.at ? ` · ${formatDateTime(message.at)}` : ''}</span>
          </li>
        ))}
      </ol>
      {mayWrite && (
        <form onSubmit={run(() => taskQueries.reply({ id: query._id, body: text }))} className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            className="input flex-1"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={answering ? 'Your answer — it goes back onto their task' : 'Add to the question'}
            aria-label={answering ? 'Answer the query' : 'Follow up on the query'}
          />
          <button type="submit" className={answering ? 'btn-primary' : 'btn-secondary'} disabled={busy || text.trim().length < 3}>
            {busy ? 'Sending…' : answering ? 'Send answer' : 'Follow up'}
          </button>
        </form>
      )}
      {(query.mayClose || (query.status === 'answered' && query.mayFollowUp && !query.seenAt)) && (
        <div className="mt-2 flex flex-wrap gap-3">
          {query.status === 'answered' && query.mayFollowUp && !query.seenAt && (
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={run(() => taskQueries.seen(query._id))}>Got it</button>
          )}
          {query.mayClose && (
            <button type="button" className="row-action" disabled={busy} onClick={run(() => taskQueries.close({ id: query._id }))}>
              {query.status === 'open' ? 'No longer needed — close' : 'Close'}
            </button>
          )}
        </div>
      )}
      {problem && <div className="mt-2"><Notice tone="danger">{problem}</Notice></div>}
    </article>
  );
}

function AskForm({ ask, to, onAsked }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  if (!open) {
    return <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setOpen(true)}>Ask a query</button>;
  }
  const send = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await ask(text, subject.trim() || undefined);
      /* A new subject is on the list now — the next picker reads it. */
      forgetQuerySubjects();
      setText('');
      setSubject('');
      setOpen(false);
      onAsked?.();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={send} className="space-y-2" aria-label="Ask a query">
      <SubjectPicker value={subject} onChange={setSubject} required />
      <textarea
        rows={2}
        className="input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="What do you need to know?"
        aria-label="Your question"
      />
      <p className="text-xs text-steel-500">{to}</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || text.trim().length < 3 || subject.trim().length < 2}>{busy ? 'Sending…' : 'Send query'}</button>
      </div>
      {problem && <Notice tone="danger">{problem}</Notice>}
    </form>
  );
}

/** Load a list of queries, and reload it — the task's or the enquiry's. */
function useQueries(load, key) {
  const [state, setState] = useState(null);
  const reload = useCallback(() => {
    if (!key) return;
    load(key).then((response) => setState({ rows: response.data || [], mayAsk: Boolean(response.mayAsk) })).catch(() => setState({ rows: [], mayAsk: false }));
  }, [load, key]);
  useEffect(() => { reload(); }, [reload]);
  return [state, reload];
}

/** The questions on one task, on its panel — and Ask a query for the team working it. */
export default function TaskQueries({ todo, onChanged }) {
  const [state, reload] = useQueries(taskQueries.onTask, todo?._id);
  if (!state || (!state.rows.length && !state.mayAsk)) return null;
  const changed = () => { reload(); onChanged?.(); };
  return (
    <div className="rounded-xl border border-line/[0.08] p-3" aria-label="Queries">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-steel-400">Queries{state.rows.length ? ` (${state.rows.length})` : ''}</p>
        {state.mayAsk && (
          <AskForm
            ask={(question, subject) => taskQueries.askOnTask({ id: todo._id, question, subject })}
            to={`Goes to ${todo.createdBy?.name ? `${todo.createdBy.name}, who raised this task` : 'whoever raised this task'} — or the enquiry’s marketing person, or Admin. The answer comes back here.`}
            onAsked={changed}
          />
        )}
      </div>
      <div className="space-y-2">
        {state.rows.map((query) => <QueryCard key={query._id} query={query} onChanged={changed} />)}
      </div>
    </div>
  );
}

/** The questions on an enquiry and on its tasks, on the enquiry page — and Ask a query. */
export function EnquiryQueries({ enquiry }) {
  const [state, reload] = useQueries(taskQueries.onEnquiry, enquiry?._id);
  if (!state || (!state.rows.length && !state.mayAsk)) return null;
  const owner = enquiry.assignedTo?.name;
  return (
    <section aria-label="Queries" className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-steel-50">Queries{state.rows.length ? ` (${state.rows.length})` : ''}</h2>
        {state.mayAsk && (
          <AskForm
            ask={(question, subject) => taskQueries.askOnEnquiry({ id: enquiry._id, question, subject })}
            to={`Goes to ${owner ? `${owner}, the enquiry’s marketing person` : 'the enquiry’s marketing person'} — theirs goes to Admin.`}
            onAsked={reload}
          />
        )}
      </div>
      {state.rows.length ? (
        <div className="space-y-2">
          {state.rows.map((query) => <QueryCard key={query._id} query={query} onChanged={reload} showWhere />)}
        </div>
      ) : (
        <p className="text-sm text-steel-500">No queries yet. A question for the marketing person goes here, and so does their answer.</p>
      )}
    </section>
  );
}

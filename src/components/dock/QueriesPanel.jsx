import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { queries as queriesApi } from '../../api/endpoints.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { announceInboxChanged } from '../InboxBell.jsx';
import QueryThread from '../QueryThread.jsx';
import RaiseQuery from '../RaiseQuery.jsx';
import { selfId } from '../../utils/pipeline.js';

/**
 * Queries, in the workspace panel at the bottom right [dock/WorkspaceRail.jsx] — the questions
 * people are waiting on, without leaving the screen you are on.
 *
 *   the list     unread first (with how many), urgent marked, then the latest; "New query"
 *   a thread     the conversation, a reply box, and the whole thread one link away
 *
 * Opening a thread marks it read, which moves the badge and the tab title at once.
 */
const when = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

function Thread({ id, onBack, onChanged }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => queriesApi.get(id).then((answer) => setData(answer.data ? answer : { data: answer })).catch(setError), [id]);
  /* Held in a ref: opening a thread loads and marks it read once, whatever the panel re-renders. */
  const changed = useRef(onChanged);
  changed.current = onChanged;
  useEffect(() => {
    load();
    queriesApi.read(id).then(() => { announceInboxChanged(); changed.current?.(); }).catch(() => {});
  }, [id, load]);

  const query = data?.data?.query || data?.data;
  const closed = query?.status === 'closed';
  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await queriesApi.say({ id, kind: 'reply', body: text });
      setBody('');
      await load();
      queriesApi.read(id).then(announceInboxChanged).catch(() => {});
    } catch (sendError) {
      setError(sendError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line/[0.06] px-3 py-2">
        <button type="button" onClick={onBack} className="rounded px-2 py-1 text-sm font-semibold text-steel-300 hover:bg-line/[0.06]" aria-label="Back to all queries">← All</button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-steel-50">{query?.subject || 'Loading…'}</p>
          <p className="truncate text-xs text-steel-500">{query?.number}{query?.customer?.name ? ` · ${query.customer.name}` : ''}</p>
        </div>
        <Link to={`/queries/${id}`} className="shrink-0 text-xs font-semibold text-accent hover:underline">Open full</Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
        {error && <p role="alert" className="text-xs text-danger-400">{error.message}</p>}
        {query ? <QueryThread query={query} me={selfId(user)} closed={closed} seenBy={data?.data?.seenBy || data?.seenBy || []} /> : !error && <p className="text-xs text-steel-500">Loading the thread…</p>}
      </div>
      {query && !closed && (
        <div className="shrink-0 border-t border-line/[0.06] p-3">
          <textarea
            rows={2}
            className="input text-sm"
            aria-label={`Reply to ${query.number}`}
            placeholder="Reply… Enter sends, Shift+Enter for a new line"
            value={body}
            disabled={busy}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <div className="mt-2 flex justify-end">
            <button type="button" className="btn-primary h-8 px-4 py-0 text-sm" disabled={busy || !body.trim()} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
          </div>
        </div>
      )}
      {closed && <p className="shrink-0 border-t border-line/[0.06] p-3 text-xs text-steel-500">This query is closed.</p>}
    </div>
  );
}

export default function QueriesPanel({ inbox, openId, onOpen }) {
  const [raising, setRaising] = useState(false);
  const rows = inbox?.data?.rows || [];
  const waiting = inbox?.data?.unread || 0;

  if (openId) return <Thread id={openId} onBack={() => onOpen(null)} onChanged={inbox?.reload} />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line/[0.06] px-3 py-2">
        <p className="text-xs text-steel-400">
          {waiting ? <><span className="font-bold text-danger-400">{waiting} unread</span> on {inbox.data.threads} {inbox.data.threads === 1 ? 'query' : 'queries'}</> : 'All caught up'}
        </p>
        <button type="button" className="btn-primary h-8 px-3 py-0 text-xs" onClick={() => setRaising(true)}>+ New query</button>
      </div>
      {inbox?.permission === 'default' && (
        <button type="button" onClick={inbox.askPermission} className="shrink-0 border-b border-line/[0.06] px-3 py-2 text-left text-xs font-semibold text-accent hover:bg-line/[0.04]">
          🔔 Turn on desktop alerts for new queries
        </button>
      )}
      <ul className="min-h-0 flex-1 divide-y divide-line/[0.06] overflow-y-auto">
        {!inbox?.data && <li className="px-3 py-4 text-xs text-steel-500">Loading queries…</li>}
        {inbox?.data && !rows.length && <li className="px-3 py-6 text-center text-sm text-steel-500">No open query.</li>}
        {rows.map((row) => (
          <li key={row._id}>
            <button
              type="button"
              onClick={() => onOpen(row._id)}
              data-unread={row.unread > 0 || undefined}
              className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-line/[0.04] ${row.unread ? 'bg-flame-500/[0.05]' : ''}`}
            >
              <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${row.isUrgent ? 'bg-danger-500' : row.unread ? 'bg-flame-500' : 'bg-transparent'}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${row.unread ? 'font-bold text-steel-50' : 'font-semibold text-steel-200'}`}>{row.subject}</span>
                  <span className="shrink-0 text-xs text-steel-500">{when(row.last?.at || row.updatedAt)}</span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-steel-400">
                    {row.number}{row.last?.text ? ` · ${row.last.by?.name ? `${row.last.by.name}: ` : ''}${row.last.text}` : ''}
                  </span>
                  {row.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-danger-600 px-1.5 text-xs font-bold leading-5 text-white" aria-label={`${row.unread} unread`}>{row.unread}</span>
                  )}
                </span>
                {row.taggedMe > 0 && <span className="mt-0.5 block text-xs font-semibold text-accent">@ you</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Link to="/queries" className="shrink-0 border-t border-line/[0.06] px-3 py-2 text-center text-xs font-semibold text-accent hover:underline">See every query →</Link>
      <RaiseQuery
        open={raising}
        onClose={() => setRaising(false)}
        onRaised={(made) => {
          setRaising(false);
          inbox?.reload();
          if (made?._id) onOpen(made._id);
        }}
      />
    </div>
  );
}

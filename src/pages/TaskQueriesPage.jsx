import { useCallback, useEffect, useState } from 'react';
import { taskQueries } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { DashboardSkeleton, EmptyState, ErrorState, PageHeader } from '../components/ui.jsx';
import { QueryCard } from '../components/TaskQueries.jsx';

/**
 * Task queries [server: taskQuery.service `queryBoard`]: the questions put to me — on tasks I
 * raised and enquiries I hold — the ones my team and I asked, and, for Admin, every open one.
 * Answered and followed up right here; the answer goes back onto the task it was asked on.
 */
const TABS = [
  { key: 'forMe', label: 'For me', empty: 'Nobody is waiting on you for an answer.' },
  { key: 'asked', label: 'We asked', empty: 'No open queries from you or your team.' },
  { key: 'everyOpen', label: 'All open', empty: 'No query is waiting for an answer.', admin: true },
];

export default function TaskQueriesPage() {
  const { isManagement } = useAuth();
  const [tab, setTab] = useState('forMe');
  const [showClosed, setShowClosed] = useState(false);
  const [state, setState] = useState({ data: null, error: null });
  const load = useCallback(() => {
    taskQueries.board(showClosed ? { show: 'all' } : {})
      .then((data) => setState({ data, error: null }))
      .catch((error) => setState({ data: null, error }));
  }, [showClosed]);
  useEffect(() => { load(); }, [load]);
  const tabs = TABS.filter((entry) => !entry.admin || isManagement);
  const current = tabs.find((entry) => entry.key === tab) || tabs[0];
  const rows = state.data?.[current.key] || [];
  const waiting = (key) => (state.data?.[key] || []).filter((query) => query.status === 'open').length;
  return (
    <div className="space-y-4">
      <PageHeader title="Task queries" subtitle="Questions on tasks and enquiries, to whoever raised the work — and their answers" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Which queries" className="flex flex-wrap gap-1.5">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={entry.key === current.key}
              className={entry.key === current.key ? 'btn-primary px-3 py-1.5 text-sm' : 'btn-secondary px-3 py-1.5 text-sm'}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
              {state.data && waiting(entry.key) > 0 && <span className="ml-1.5 rounded-full bg-warn-500/20 px-1.5 text-xs tabular-nums">{waiting(entry.key)}</span>}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-steel-300">
          <input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />
          Show closed
        </label>
      </div>
      {state.error ? (
        <ErrorState error={state.error} onRetry={load} />
      ) : !state.data ? (
        <DashboardSkeleton />
      ) : rows.length ? (
        <div className="space-y-2">
          {rows.map((query) => <QueryCard key={query._id} query={query} onChanged={load} showWhere />)}
        </div>
      ) : (
        <EmptyState title="Nothing here" description={current.empty} />
      )}
    </div>
  );
}
